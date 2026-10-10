import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, Grid, Text, Button, Textarea, IconButton, Tooltip } from '@chakra-ui/react';
import { FiThumbsUp, FiThumbsDown } from 'react-icons/fi';
import { InitialAvatar, StatLabel, Bar, Divider } from '../ui';
import { compactMoney, formatSigned } from '../../utils/format';
import * as api from '../../api';

const DIAGNOSTICS = [
  { key: 'repeatContact', label: 'Repeat contact', color: '#d95b5b' },
  { key: 'negativeSentiment', label: 'Negative sentiment', color: '#e1a43a' },
  { key: 'policyException', label: 'Policy exception', color: '#638cc7' },
  { key: 'churnPropensity', label: 'Churn propensity', color: '#6e5ba5' }
];

const Stat = ({ label, value, color = 'ink.700' }) => (
  <Box>
    <StatLabel>{label}</StatLabel>
    <Text fontSize="18px" fontWeight={700} color={color} mt="8px" lineHeight="22px" sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
  </Box>
);

function FeedbackNotes({ conversation }) {
  const [notes, setNotes] = useState(conversation.feedback?.notes || '');
  const [rating, setRating] = useState(conversation.feedback?.rating ?? null);
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const first = useRef(true);
  const id = conversation.id;

  useEffect(() => {
    setNotes(conversation.feedback?.notes || '');
    setRating(conversation.feedback?.rating ?? null);
    first.current = true;
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    setState('saving');
    const t = setTimeout(() => {
      api.saveFeedback(id, { notes, rating })
        .then(() => setState('saved'))
        .catch(() => setState('error'));
    }, 700);
    return () => clearTimeout(t);
  }, [notes, rating, id]);

  const rate = (v) => setRating((r) => (r === v ? null : v));

  return (
    <Flex direction="column" flex="1" minH="160px">
      <Flex justify="space-between" align="center" mb="8px">
        <Text as="label" htmlFor="feedback-notes" fontSize="11px" color="#b0abb8">Feedback Notes</Text>
        <Flex align="center" gap="2px">
          <Text fontSize="9px" color={state === 'error' ? 'tint.redText' : 'ink.200'} mr="6px" aria-live="polite">
            {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved. Retrying on next edit' : ''}
          </Text>
          <Tooltip label="AI handled this well" hasArrow>
            <IconButton aria-label="Rate AI handling as good" aria-pressed={rating === 1} icon={<FiThumbsUp />} size="xs" variant="ghost"
              color={rating === 1 ? 'tint.greenText' : 'ink.200'} bg={rating === 1 ? 'tint.green' : 'transparent'} onClick={() => rate(1)} />
          </Tooltip>
          <Tooltip label="AI needs improvement here" hasArrow>
            <IconButton aria-label="Rate AI handling as poor" aria-pressed={rating === -1} icon={<FiThumbsDown />} size="xs" variant="ghost"
              color={rating === -1 ? 'tint.redText' : 'ink.200'} bg={rating === -1 ? 'tint.red' : 'transparent'} onClick={() => rate(-1)} />
          </Tooltip>
        </Flex>
      </Flex>
      <Textarea id="feedback-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What should the AI do differently on cases like this?"
        flex="1" bg="#ffeba2" border="none" borderRadius="10px" p="16px" fontSize="11px" color="#5c4a14" resize="none"
        _placeholder={{ color: '#b39d5c' }} _focusVisible={{ boxShadow: '0 0 0 2px #e1a43a' }} />
    </Flex>
  );
}

const CustomerIntel = ({ conversation, currency, onResolve, resolving }) => {
  const c = conversation;
  const risk = c.risk || {};
  const d = risk.diagnostics || {};
  const sentiment = c.sentimentScore ?? 0;
  const resolved = c.status === 'resolved';
  return (
    <Flex direction="column" w="340px" flexShrink={0} bg="white" border="1px solid" borderColor="line.300" borderRadius="8px" px="20px" pt="20px" pb="20px" h="100%" minH={0} overflowY="auto">
      <Text as="h2" fontSize="15px" fontWeight={700} color="ink.900">Customer intelligence</Text>
      <Flex gap="18px" align="center" mt="22px">
        <InitialAvatar name={c.customer?.name} size={28} />
        <Box minW={0}>
          <Text fontSize="15px" fontWeight={700} color="ink.900" noOfLines={1}>{c.customer?.name} · Case #{c.caseNumber}</Text>
          <Text fontSize="10px" color="ink.300" mt="4px">
            {[c.customer?.tier, c.customer?.tenureYears != null ? `${c.customer.tenureYears} years` : null, c.customer?.city].filter(Boolean).join(' • ')}
          </Text>
        </Box>
      </Flex>
      <Divider my="18px" />
      <Grid templateColumns="1fr 1fr" rowGap="22px" columnGap="16px">
        <Stat label="Lifetime value" value={compactMoney(c.customer?.lifetimeValue, currency)} />
        <Stat label="Orders" value={c.customer?.orders ?? 'n/a'} />
        <Stat label="Return rate" value={c.customer?.returnRate != null ? `${(c.customer.returnRate * 100).toFixed(1)}%` : 'n/a'} />
        <Stat label="Sentiment" value={formatSigned(sentiment)} color={sentiment < -0.2 ? 'tint.redText' : sentiment > 0.2 ? 'tint.greenText' : 'ink.700'} />
      </Grid>
      <Divider my="20px" />
      <Text as="h3" fontSize="14px" fontWeight={700} color="ink.900">Case diagnostics</Text>
      <Text fontSize="10px" color="ink.300" mt="3px" mb="14px">Signals contributing to risk</Text>
      {DIAGNOSTICS.map((x) => (
        <Box key={x.key} mb="14px">
          <Flex justify="space-between" mb="7px">
            <Text fontSize="9px" color="ink.600">{x.label}</Text>
            <Text fontSize="9px" fontWeight={700} color="ink.600">{Math.round((d[x.key] || 0) * 100)}%</Text>
          </Flex>
          <Bar value={d[x.key] || 0} color={x.color} h="5px" label={x.label} />
        </Box>
      ))}
      <Divider mt="6px" mb="18px" />
      <FeedbackNotes conversation={c} />
      <Button mt="18px" h="40px" w="100%" flexShrink={0} fontSize="14px" fontWeight={500} borderRadius="12px"
        variant={resolved ? 'outline' : 'solid'} onClick={onResolve} isLoading={resolving}>
        {resolved ? 'Reopen conversation' : 'Mark as Resolved'}
      </Button>
    </Flex>
  );
};

export default CustomerIntel;
