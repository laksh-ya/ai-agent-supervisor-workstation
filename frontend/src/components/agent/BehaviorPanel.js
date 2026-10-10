import React, { useState } from 'react';
import {
  Box, Flex, Text, Slider, SliderTrack, SliderFilledTrack, SliderThumb, Switch, Button, Tooltip, Input,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, NumberInput, NumberInputField, Grid
} from '@chakra-ui/react';
import { Pill, Divider, StatLabel, Bar } from '../ui';
import {
  speedFromTokens, tokensFromSpeed, stabilityFromTemperature, temperatureFromStability, speedLabel, empathyLabel,
  formatThreshold, THRESHOLD_LABELS
} from './config';
import { currencySymbol, toDisplayCurrency, fromDisplayCurrency, timeAgo } from '../../utils/format';
import PresetsMenu from './PresetsMenu';

const TabPill = ({ active, children, onClick, w }) => (
  <Button role="tab" aria-selected={active} onClick={onClick} h="24px" w={w} px={0} fontSize="10px" borderRadius="12px"
    bg={active ? 'brand.500' : '#f4f1f8'} color={active ? 'white' : '#615879'} _hover={{ bg: active ? 'brand.600' : 'brand.100' }}>
    {children}
  </Button>
);

function BehaviorSlider({ label, value, display, left, right, onChange, hint }) {
  return (
    <Box w="100%">
      <Flex justify="space-between" fontSize="10px" fontWeight={700}>
        <Text color="ink.600">{label}</Text>
        <Tooltip label={hint} hasArrow isDisabled={!hint} placement="top-end"><Text color="brand.500" cursor={hint ? 'help' : 'default'}>{display}</Text></Tooltip>
      </Flex>
      <Flex justify="space-between" fontSize="8px" color="ink.200" mt="11px"><Text>{left}</Text><Text>{right}</Text></Flex>
      <Slider aria-label={label} value={value} min={0} max={1} step={0.01} onChange={onChange} mt="6px" focusThumbOnChange={false}>
        <SliderTrack h="6px" bg="brand.100" borderRadius="full"><SliderFilledTrack bg="brand.500" /></SliderTrack>
        <SliderThumb boxSize="14px" bg="brand.500" boxShadow="0 0 0 3px white" _focusVisible={{ boxShadow: '0 0 0 3px white, 0 0 0 6px rgba(81,65,132,0.35)' }} />
      </Slider>
    </Box>
  );
}

// Exact numeric control of the raw model parameters (temperature, max tokens, top-p)
function RawParams({ p, setParam }) {
  const field = (key, label, min, max, step, precision) => (
    <Box>
      <Text fontSize="9px" color="ink.300" mb="3px">{label}</Text>
      <NumberInput size="xs" value={p[key]} min={min} max={max} step={step} precision={precision}
        onChange={(_, n) => { if (!Number.isNaN(n)) setParam(key, Math.min(max, Math.max(min, n))); }}>
        <NumberInputField borderRadius="8px" fontSize="11px" aria-label={label} />
      </NumberInput>
    </Box>
  );
  return (
    <Popover placement="bottom-start" isLazy>
      <PopoverTrigger>
        <Flex as="button" type="button" mt="2px" w="100%" align="center" justify="space-between" bg="#faf8fc" border="1px solid" borderColor="#ece8f3"
          borderRadius="10px" px="10px" py="6px" fontFamily="mono" fontSize="9px" color="ink.400" _hover={{ borderColor: 'line.400' }}
          aria-label="Edit exact model parameters">
          <Text>temperature <b>{p.temperature.toFixed(2)}</b> · max_tokens <b>{p.max_tokens}</b> · top_p <b>{p.top_p.toFixed(2)}</b></Text>
          <Text fontFamily="body" color="brand.500" fontWeight={700}>Edit</Text>
        </Flex>
      </PopoverTrigger>
      <PopoverContent w="300px" borderRadius="12px" boxShadow="pop">
        <PopoverBody p="12px">
          <Text fontSize="11px" fontWeight={700} color="ink.900" mb="8px">Model parameters</Text>
          <Grid templateColumns="1fr 1fr 1fr" gap="8px">
            {field('temperature', 'Temperature', 0, 1, 0.01, 2)}
            {field('max_tokens', 'Max tokens', 16, 4000, 10, 0)}
            {field('top_p', 'Top-p', 0, 1, 0.01, 2)}
          </Grid>
          <Text fontSize="9px" color="ink.300" mt="8px">Stability = 1 − temperature · Response speed maps 400→100 max tokens.</Text>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function ThresholdInput({ k, value, onChange, currency }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const toEdit = () => {
    if (k === 'negativeSentiment') return (value * 2 - 1).toFixed(2);
    if (k === 'refundValue') return String(toDisplayCurrency(value, currency));
    if (k === 'lowConfidence') return Number(value).toFixed(2);
    return String(Math.round(value));
  };
  const commit = () => {
    setEditing(false);
    const n = Number(String(text).replace(/[^0-9.\-−]/g, '').replace('−', '-'));
    if (!Number.isFinite(n)) return;
    if (k === 'negativeSentiment') onChange(Number(((Math.max(-1, Math.min(1, n)) + 1) / 2).toFixed(3)));
    else if (k === 'refundValue') onChange(Math.max(0, fromDisplayCurrency(n, currency)));
    else if (k === 'lowConfidence') onChange(Math.max(0, Math.min(1, n)));
    else onChange(Math.max(5, Math.min(3600, Math.round(n))));
  };
  const hint = {
    responseTime: 'Seconds a customer message may wait for an AI reply',
    negativeSentiment: `Signed sentiment (−1 to 1)`,
    refundValue: `Refund amount in ${currencySymbol(currency)}`,
    lowConfidence: 'AI confidence (0 to 1)'
  }[k];
  return (
    <Tooltip label={hint} hasArrow placement="left" openDelay={400}>
      <Input
        value={editing ? text : formatThreshold(k, value, currency)}
        onFocus={() => { setEditing(true); setText(toEdit()); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEditing(false); e.currentTarget.blur(); } }}
        aria-label={THRESHOLD_LABELS[k]}
        w="72px" h="32px" px="8px" textAlign="center" bg="#faf8fc" border="1px solid" borderColor="#ded8e7" borderRadius="12px"
        fontSize="10px" fontWeight={700} color="brand.500" _hover={{ borderColor: 'line.400' }}
        _focusVisible={{ borderColor: 'brand.500', boxShadow: '0 0 0 1px #514184', bg: 'white' }}
      />
    </Tooltip>
  );
}

const BehaviorPanel = ({
  agent, draft, setDraft, dirty, diff, risk, currency, knowledgeCatalog, presets, onApplyPreset, onSavePreset, onDeletePreset
}) => {
  const [tab, setTab] = useState('parameters');
  const p = draft.parameters;
  const setParam = (key, v) => setDraft((d) => ({ ...d, parameters: { ...d.parameters, [key]: key === 'max_tokens' ? Math.round(v) : Number(Number(v).toFixed(2)) } }));
  const setThreshold = (key, v) => setDraft((d) => ({ ...d, escalationThresholds: { ...d.escalationThresholds, [key]: v } }));
  const toggle = (list, id) => setDraft((d) => ({ ...d, [list]: d[list].map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) }));
  const speed = speedFromTokens(p.max_tokens);
  const stability = stabilityFromTemperature(p.temperature);

  return (
    <Box as="form" data-testid="agent-config-form" onSubmit={(e) => e.preventDefault()} bg="white" border="1px solid" borderColor="line.300" borderRadius="12px"
      px="20px" pt="15px" pb="16px" h="100%" overflowY="auto" aria-label="Behavior configuration">
      <Flex justify="space-between" align="center" gap="8px">
        <Text as="h2" fontSize="15px" fontWeight={700} color="ink.900" whiteSpace="nowrap">Behavior configuration</Text>
        <Flex gap="6px" align="center">
          <PresetsMenu presets={presets} onApply={onApplyPreset} onSave={onSavePreset} onDelete={onDeletePreset} />
          {dirty ? <Pill tone="amber" w="94px">Draft changes</Pill> : <Pill tone="green" px="10px">Live · {agent.version}</Pill>}
        </Flex>
      </Flex>

      <Flex gap="8px" mt="18px" role="tablist" aria-label="Configuration sections">
        <TabPill w="82px" active={tab === 'parameters'} onClick={() => setTab('parameters')}>Parameters</TabPill>
        <TabPill w="92px" active={tab === 'capabilities'} onClick={() => setTab('capabilities')}>Capabilities</TabPill>
        <TabPill w="100px" active={tab === 'knowledge'} onClick={() => setTab('knowledge')}>Knowledge</TabPill>
      </Flex>

      <Box mt="18px" minH="296px" role="tabpanel">
        {tab === 'parameters' && (
          <Flex direction="column" gap="19px">
            <BehaviorSlider label="Creativity / Top-p" value={p.top_p} display={p.top_p.toFixed(2)} left="Precise" right="Exploratory"
              onChange={(v) => setParam('top_p', v)} hint="Nucleus sampling (top_p)" />
            <BehaviorSlider label="Response speed" value={speed} display={speedLabel(speed)} left="Measured" right="Fast"
              onChange={(v) => setParam('max_tokens', tokensFromSpeed(v))} hint={`max_tokens ${p.max_tokens}`} />
            <BehaviorSlider label="Empathy" value={p.empathy} display={empathyLabel(p.empathy)} left="Neutral" right="High"
              onChange={(v) => setParam('empathy', v)} hint={`empathy ${p.empathy.toFixed(2)}`} />
            <BehaviorSlider label="Stability" value={stability} display={stability.toFixed(2)} left="Adaptive" right="Stable"
              onChange={(v) => setParam('temperature', temperatureFromStability(v))} hint={`temperature ${p.temperature.toFixed(2)}`} />
            <RawParams p={p} setParam={setParam} />
          </Flex>
        )}
        {tab === 'capabilities' && (
          <Flex direction="column" gap="4px">
            {agent.capabilities.map((c) => {
              const on = draft.capabilities.find((x) => x.id === c.id)?.enabled;
              return (
                <Flex key={c.id} as="label" justify="space-between" align="center" gap="12px" py="9px" borderBottom="1px solid" borderColor="line.200" cursor="pointer">
                  <Box>
                    <Text fontSize="11px" fontWeight={700} color="ink.600">{c.name}</Text>
                    <Text fontSize="9px" color="ink.300" mt="2px">{c.description || c.id}</Text>
                  </Box>
                  <Switch size="sm" isChecked={!!on} onChange={() => toggle('capabilities', c.id)} aria-label={c.name} />
                </Flex>
              );
            })}
          </Flex>
        )}
        {tab === 'knowledge' && (
          <Flex direction="column" gap="4px">
            {agent.knowledgeBases.map((k) => {
              const on = draft.knowledgeBases.find((x) => x.id === k.id)?.enabled;
              const meta = knowledgeCatalog.find((x) => x.id === k.id);
              const age = meta?.lastUpdated ? (Date.now() - new Date(meta.lastUpdated)) / 86400000 : 180;
              const freshness = Math.max(0.2, Math.min(1, 1 - age / 520));
              return (
                <Flex key={k.id} as="label" justify="space-between" align="center" gap="12px" py="9px" borderBottom="1px solid" borderColor="line.200" cursor="pointer">
                  <Box flex="1" minW={0}>
                    <Text fontSize="11px" fontWeight={700} color="ink.600">{k.name}</Text>
                    <Text fontSize="9px" color="ink.300" mt="2px">
                      {meta ? `${meta.documentCount.toLocaleString()} docs · updated ${timeAgo(meta.lastUpdated)}` : k.id}
                    </Text>
                    <Tooltip label={`Freshness ${Math.round(freshness * 100)}%`} hasArrow placement="bottom-start">
                      <Box w="140px" mt="6px"><Bar value={freshness} tone={freshness >= 0.85 ? 'green' : freshness >= 0.7 ? 'amber' : 'red'} h="4px" /></Box>
                    </Tooltip>
                  </Box>
                  <Switch size="sm" isChecked={!!on} onChange={() => toggle('knowledgeBases', k.id)} aria-label={k.name} />
                </Flex>
              );
            })}
          </Flex>
        )}
      </Box>

      <Divider my="18px" />

      <Text as="h3" fontSize="14px" fontWeight={700} color="ink.900">Escalation policy</Text>
      <Text fontSize="10px" color="ink.300" mt="5px">Trigger supervisor takeover when any threshold is met</Text>
      <Flex direction="column" gap="12px" mt="16px">
        {Object.keys(THRESHOLD_LABELS).map((k) => (
          <Flex key={k} justify="space-between" align="center">
            <Text fontSize="10px" color="ink.500">{THRESHOLD_LABELS[k]}</Text>
            <ThresholdInput k={k} value={draft.escalationThresholds[k]} onChange={(v) => setThreshold(k, v)} currency={currency} />
          </Flex>
        ))}
      </Flex>

      <Divider my="18px" />

      <Box>
        <StatLabel>Change request</StatLabel>
        <Text fontSize="11px" fontWeight={700} color="#332f3b" mt="11px">
          CR-{(agent.changeRequestSeq || 1841) + 1} • {diff.length ? `${diff.length} field${diff.length === 1 ? '' : 's'} modified` : 'No changes yet'}
        </Text>
        <Text fontSize="9px" color="ink.400" mt="11px">Owner: Neha Prasad • Reviewer: Ops Governance</Text>
        <Pill tone={risk.tone} mt="12px" px="12px">Risk: {risk.level}</Pill>
      </Box>
    </Box>
  );
};

export default BehaviorPanel;
