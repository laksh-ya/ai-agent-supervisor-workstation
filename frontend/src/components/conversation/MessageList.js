import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex, Text, Button } from '@chakra-ui/react';
import { FiCpu, FiUser, FiShield, FiRepeat, FiMessageSquare, FiArrowDown } from 'react-icons/fi';
import { hhmm, initials } from '../../utils/format';
import { EmptyState } from '../ui';

const GROUP_WINDOW_MS = 3 * 60 * 1000;

const STYLES = {
  customer: {
    side: 'left', bg: '#f3f1f7', color: 'ink.700', meta: 'ink.300',
    avatar: { bg: '#e9cdb2', color: '#5b3f2c' }, radius: '4px 16px 16px 16px'
  },
  agent: {
    side: 'right', bg: '#ece8f8', color: 'ink.700', meta: '#6e5ba5',
    avatar: { bg: '#dad4f1', color: '#514184', icon: FiCpu }, radius: '16px 4px 16px 16px'
  },
  supervisor: {
    side: 'right', bg: 'brand.500', color: 'white', meta: 'brand.500',
    avatar: { bg: 'brand.600', color: 'white' }, radius: '16px 4px 16px 16px'
  }
};

function SystemEvent({ message }) {
  const returned = /returned to/i.test(message.text);
  const Icon = returned ? FiRepeat : FiShield;
  return (
    <Flex justify="center" my="6px">
      <Flex align="center" gap="6px" maxW="86%" bg="white" border="1px solid" borderColor="line.300" borderRadius="999px" px="12px" py="5px" boxShadow="soft">
        <Box color={returned ? 'tint.greenText' : 'brand.500'} flexShrink={0}><Icon size={11} /></Box>
        <Text fontSize="10px" color="ink.500" textAlign="center">{message.text}</Text>
        <Text fontSize="9px" color="ink.200" flexShrink={0} className="tnum">{hhmm(message.timestamp)}</Text>
      </Flex>
    </Flex>
  );
}

function Avatar({ sender, name, customerName }) {
  const s = STYLES[sender];
  const Icon = s.avatar.icon || (sender === 'customer' ? null : FiUser);
  const label = sender === 'customer' ? initials(customerName) : sender === 'supervisor' ? initials(name) : null;
  return (
    <Flex w="26px" h="26px" borderRadius="full" bg={s.avatar.bg} color={s.avatar.color} align="center" justify="center"
      fontSize="9px" fontWeight={700} flexShrink={0} aria-hidden>
      {label || (Icon ? <Icon size={12} /> : null)}
    </Flex>
  );
}

function Bubble({ message, first, supervisorName, customerName, isNew }) {
  const s = STYLES[message.sender] || STYLES.customer;
  const right = s.side === 'right';
  const who = message.sender === 'supervisor' ? supervisorName : message.sender === 'agent' ? 'AI agent' : customerName;
  return (
    <Flex direction={right ? 'row-reverse' : 'row'} align="flex-end" gap="8px" w="100%" mt={first ? '10px' : '2px'}
      sx={isNew ? { animation: 'msgIn 280ms cubic-bezier(0.22, 1, 0.36, 1)', '@keyframes msgIn': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } } } : undefined}>
      <Box w="26px" flexShrink={0}>{first && <Avatar sender={message.sender} name={supervisorName} customerName={customerName} />}</Box>
      <Flex direction="column" align={right ? 'flex-end' : 'flex-start'} maxW="66%" minW={0}>
        {first && (
          <Flex gap="6px" align="baseline" mb="4px" px="2px" direction={right ? 'row-reverse' : 'row'}>
            <Text fontSize="10px" fontWeight={700} color={s.meta}>{who}</Text>
            <Text fontSize="9px" color="ink.200" className="tnum">{hhmm(message.timestamp)}</Text>
            {message.templateId && <Text fontSize="9px" color="ink.300" bg="brand.100" px="5px" borderRadius="6px">Template</Text>}
          </Flex>
        )}
        <Box bg={s.bg} color={s.color} borderRadius={first ? s.radius : '16px'} px="13px" py="9px"
          boxShadow={message.sender === 'supervisor' ? '0 2px 8px rgba(81, 65, 132, 0.25)' : 'none'}
          title={first ? undefined : hhmm(message.timestamp)}>
          <Text fontSize="11px" lineHeight="1.5" whiteSpace="pre-wrap" wordBreak="break-word">{message.text}</Text>
        </Box>
      </Flex>
    </Flex>
  );
}

const MessageList = ({ messages = [], supervisorName, customerName = 'Customer', children }) => {
  const ref = useRef();
  const stick = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const seen = useRef(messages.length);

  const onScroll = () => {
    const el = ref.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (stick.current) setUnseen(0);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (messages.length > seen.current) setUnseen((n) => n + (messages.length - seen.current));
    seen.current = messages.length;
  }, [messages.length]);

  useEffect(() => { stick.current = true; }, []);

  const jump = () => {
    ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
    setUnseen(0);
  };

  const firstDate = messages[0] ? new Date(messages[0].timestamp) : null;
  const dayLabel = firstDate && firstDate.toDateString() === new Date().toDateString()
    ? 'Today'
    : firstDate?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Box position="relative" flex="1" minH={0}>
      <Flex ref={ref} onScroll={onScroll} direction="column" h="100%" overflowY="auto" px="12px" pt="12px" pb="12px"
        data-testid="message-list" className="conversation-messages" role="log" aria-live="polite" aria-label="Conversation history">
        <Box flex="1" />
        {!messages.length ? (
          <EmptyState icon={FiMessageSquare} title="No messages yet" hint="The transcript fills in as the customer and AI agent reply." />
        ) : (
          <Flex direction="column">
            {dayLabel && (
              <Flex align="center" gap="10px" my="6px" aria-hidden>
                <Box flex="1" h="1px" bg="line.200" />
                <Text fontSize="9px" fontWeight={700} color="ink.200" textTransform="uppercase" letterSpacing="0.06em">{dayLabel}</Text>
                <Box flex="1" h="1px" bg="line.200" />
              </Flex>
            )}
            {children}
            {messages.map((m, i) => {
              if (m.sender === 'system') return <SystemEvent key={m._id || `${m.timestamp}-${i}`} message={m} />;
              const prev = messages[i - 1];
              const first = !prev || prev.sender !== m.sender || new Date(m.timestamp) - new Date(prev.timestamp) > GROUP_WINDOW_MS;
              return (
                <Bubble key={m._id || `${m.timestamp}-${i}`} message={m} first={first} supervisorName={supervisorName}
                  customerName={customerName} isNew={i === messages.length - 1 && i > 0} />
              );
            })}
          </Flex>
        )}
      </Flex>
      {unseen > 0 && (
        <Button size="xs" position="absolute" bottom="10px" left="50%" transform="translateX(-50%)" borderRadius="12px" boxShadow="pop"
          onClick={jump} rightIcon={<FiArrowDown />}>
          {unseen} new message{unseen > 1 ? 's' : ''}
        </Button>
      )}
    </Box>
  );
};

export default MessageList;
