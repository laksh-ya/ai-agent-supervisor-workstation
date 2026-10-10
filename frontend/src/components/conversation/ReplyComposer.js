// Supervisor response box. Unresolved {{variables}} are highlighted in-place (a backdrop layer
// behind a transparent textarea) and listed as fill-in chips, and sending is blocked until
// every variable has a value.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text, Button, Input, Tooltip, Kbd, IconButton } from '@chakra-ui/react';
import { FiChevronDown, FiX, FiMic, FiSquare } from 'react-icons/fi';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';
import { extractVariables, VARIABLE_PATTERN, humanizeVariable, variableLabel } from '../../utils/templates';
import { initials } from '../../utils/format';

const FONT = { fontSize: '11px', lineHeight: '17px', fontFamily: 'body', letterSpacing: 'normal' };
const PAD = { pt: '10px', pb: '10px', pl: '14px', pr: '168px' };

function Backdrop({ text, scrollTop }) {
  const parts = useMemo(() => {
    const out = [];
    const rx = new RegExp(VARIABLE_PATTERN.source, 'g');
    let last = 0;
    let m;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      out.push({ t: m[0], v: m[1] });
      last = m.index + m[0].length;
    }
    out.push({ t: text.slice(last) + '\n' });
    return out;
  }, [text]);
  return (
    <Box aria-hidden position="absolute" inset={0} {...PAD} {...FONT} color="transparent" whiteSpace="pre-wrap" wordBreak="break-word"
      overflow="hidden" pointerEvents="none">
      <Box transform={`translateY(${-scrollTop}px)`}>
        {parts.map((p, i) => (p.v ? (
          <Box as="mark" key={i} bg="tint.amber" color="transparent" borderRadius="4px" boxShadow="0 0 0 1px #e1a43a">{p.t}</Box>
        ) : <span key={i}>{p.t}</span>))}
      </Box>
    </Box>
  );
}

const ReplyComposer = React.forwardRef(({
  value, onChange, onSend, onOpenTemplates, template, onClearTemplate, aiInControl, sending, disabled, supervisorName,
  voiceLang = 'en-US', onVoiceError
}, ref) => {
  const taRef = useRef();
  const [scrollTop, setScrollTop] = useState(0);
  const [fills, setFills] = useState({});
  const unresolved = useMemo(() => extractVariables(value), [value]);
  const canSend = value.trim().length > 0 && unresolved.length === 0 && !sending && !disabled;

  // Voice input (Web Speech API): each finalised phrase is appended to the draft, which stays editable
  const valueRef = useRef(value);
  valueRef.current = value;
  const voice = useSpeechRecognition({
    lang: voiceLang,
    onFinal: (text) => {
      if (!text) return;
      const current = valueRef.current;
      const sep = current && !/\s$/.test(current) ? ' ' : '';
      const phrase = current.trim() ? text : text.charAt(0).toUpperCase() + text.slice(1);
      onChange(`${current}${sep}${phrase}`);
    }
  });
  useEffect(() => {
    if (voice.error) { onVoiceError?.(voice.error); voice.clearError(); }
  }, [voice.error]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => { if (voice.listening) voice.stop(); onSend(); };

  React.useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }));

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(140, Math.max(36, el.scrollHeight))}px`;
  }, [value]);

  const fill = (name) => {
    const v = (fills[name] || '').trim();
    if (!v) return;
    onChange(value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), v));
    setFills((f) => ({ ...f, [name]: '' }));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) send();
    }
  };

  return (
    <Box border="1px solid" borderColor="line.300" borderRadius="10px" px="14px" pt="14px" pb="12px" bg="white">
      <Flex justify="space-between" align="center" mb="12px">
        <Box>
          <Text fontSize="10px" fontWeight={700} color="ink.800">Supervisor response</Text>
          {aiInControl && !disabled && (
            <Text fontSize="9px" color="ink.300" mt="2px">The AI is replying. Sending a message takes over from it.</Text>
          )}
        </Box>
        <Button onClick={onOpenTemplates} variant="outline" h="26px" px="6px" pr="10px" borderRadius="14px" borderColor="line.300" bg="#faf9fc"
          color="ink.600" fontWeight={500} fontSize="12px" gap="6px" aria-label="Insert a response template" isDisabled={disabled}
          leftIcon={<Flex w="18px" h="18px" borderRadius="full" bg="#f1c9a5" color="#5b3f2c" align="center" justify="center" fontSize="7px" fontWeight={700}>{initials(supervisorName)}</Flex>}
          rightIcon={<FiChevronDown />} iconSpacing="6px">
          Template
        </Button>
      </Flex>

      {template && (
        <Flex align="center" gap="8px" mb="8px" fontSize="10px" color="ink.400">
          <Text>Using template <b>{template.name}</b></Text>
          <Box as="button" type="button" onClick={onClearTemplate} aria-label="Detach template" color="ink.200" _hover={{ color: 'ink.600' }}><FiX /></Box>
        </Flex>
      )}

      {unresolved.length > 0 && (
        <Box bg="tint.amber" borderRadius="8px" px="10px" py="8px" mb="8px" role="status">
          <Text fontSize="10px" fontWeight={700} color="tint.amberText" mb="6px">
            {unresolved.length} variable{unresolved.length > 1 ? 's' : ''} need{unresolved.length > 1 ? '' : 's'} a value to send
          </Text>
          <Flex gap="6px" wrap="wrap">
            {unresolved.map((name) => (
              <Flex key={name} as="form" onSubmit={(e) => { e.preventDefault(); fill(name); }} align="center" bg="white" borderRadius="8px" pl="8px" pr="2px" h="26px"
                border="1px solid" borderColor="#f0d68a">
                <Text fontSize="10px" color="ink.400" whiteSpace="nowrap" mr="6px" title={`{{${name}}}`}>&lt;{variableLabel(name, template) || humanizeVariable(name)}&gt;</Text>
                <Input size="xs" h="20px" w="110px" fontSize="10px" border="none" placeholder="Enter value" value={fills[name] || ''} bg="transparent"
                  onChange={(e) => setFills((f) => ({ ...f, [name]: e.target.value }))} aria-label={`Value for ${humanizeVariable(name)}`} _focusVisible={{ boxShadow: 'none' }} />
                <Button type="submit" size="xs" h="20px" px="8px" fontSize="9px" borderRadius="6px" isDisabled={!(fills[name] || '').trim()}>Fill</Button>
              </Flex>
            ))}
          </Flex>
        </Box>
      )}

      <Box position="relative" border="1px solid" borderColor="line.300" borderRadius="10px" bg="white"
        _focusWithin={{ borderColor: 'brand.500', boxShadow: '0 0 0 1px #514184' }} transition="border-color 120ms">
        <Backdrop text={value} scrollTop={scrollTop} />
        <Box as="textarea" ref={taRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
          onScroll={(e) => setScrollTop(e.target.scrollTop)} rows={1} disabled={disabled}
          placeholder="Reply to the customer" aria-label="Supervisor reply"
          display="block" w="100%" resize="none" bg="transparent" border="none" outline="none" position="relative"
          {...PAD} {...FONT} color="ink.600" minH="54px" sx={{ '&::placeholder': { color: '#a9a3b3' } }} />
        <Tooltip hasArrow placement="top"
          label={!voice.supported ? 'Voice input needs Chrome, Edge or Safari' : voice.listening ? 'Stop dictation' : 'Dictate reply'}>
          <Box position="absolute" right="125px" bottom="8px">
            <IconButton aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={voice.listening}
              icon={voice.listening ? <FiSquare /> : <FiMic />} onClick={voice.toggle} isDisabled={!voice.supported || disabled}
              w="36px" h="36px" minW="36px" borderRadius="10px" variant={voice.listening ? 'danger' : 'soft'}
              sx={voice.listening ? { animation: 'micPulse 1.4s ease-in-out infinite', '@keyframes micPulse': { '0%,100%': { boxShadow: '0 0 0 0 rgba(217,91,91,0.45)' }, '50%': { boxShadow: '0 0 0 6px rgba(217,91,91,0)' } } } : undefined} />
          </Box>
        </Tooltip>
        <Tooltip hasArrow isDisabled={canSend || !unresolved.length} label="Fill every highlighted variable to send">
          <Box position="absolute" right="15px" bottom="8px">
            <Button w="102px" h="36px" borderRadius="10px" fontSize="10px" onClick={send} isDisabled={!canSend} isLoading={sending}>
              Send reply
            </Button>
          </Box>
        </Tooltip>
      </Box>
      {voice.listening ? (
        <Flex align="center" gap="6px" mt="6px" role="status" aria-live="polite">
          <Box w="7px" h="7px" borderRadius="full" bg="tint.redBar" />
          <Text fontSize="9px" color="tint.redText" fontWeight={700}>Listening…</Text>
          <Text fontSize="9px" color="ink.400" noOfLines={1} fontStyle="italic">{voice.interim ? `“${voice.interim}”` : 'Speak now. Finished phrases are added to the reply.'}</Text>
        </Flex>
      ) : (
        <Text fontSize="9px" color="ink.200" mt="6px"><Kbd fontSize="8px">Enter</Kbd> to send · <Kbd fontSize="8px">Shift</Kbd>+<Kbd fontSize="8px">Enter</Kbd> for a new line · Mic to dictate</Text>
      )}
    </Box>
  );
});

export default ReplyComposer;
