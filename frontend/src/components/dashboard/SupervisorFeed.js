import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Card, SectionTitle, LoadingState, LiveDot, EmptyState } from '../ui';
import { FiActivity } from 'react-icons/fi';
import { hhmmss } from '../../utils/format';
import * as api from '../../api';
import { useSocketEvent } from '../../context/WebSocketContext';
import { useSettings } from '../../context/SettingsContext';

const MAX = 6;

const SupervisorFeed = () => {
  const { autoRefresh, update } = useSettings();
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const autoRef = useRef(autoRefresh);
  autoRef.current = autoRefresh;

  const load = () => api.getActivity(MAX).then(setItems).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useSocketEvent('system_update', (m) => { if (m.data?.reset) load(); });
  useSocketEvent('activity', (m) => {
    if (autoRef.current) setItems((prev) => [m.data, ...prev].slice(0, MAX));
    else setPending((prev) => [m.data, ...prev].slice(0, 20));
  });

  const toggle = () => {
    if (!autoRefresh && pending.length) {
      setItems((prev) => [...pending, ...prev].slice(0, MAX));
      setPending([]);
    }
    update({ autoRefresh: !autoRefresh });
  };

  return (
    <Card px="16px" pt="18px" pb="14px" h="100%">
      <SectionTitle title="Live supervisor feed" subtitle="Takeovers, handoffs and model events" flexWrap="wrap" rowGap="8px">
        <Flex as="button" type="button" onClick={toggle} aria-pressed={autoRefresh} align="center" gap="7px" h="24px" px="12px"
          borderRadius="12px" bg={autoRefresh ? 'tint.green' : 'brand.100'} color={autoRefresh ? 'tint.greenText' : 'brand.500'}
          fontSize="10px" fontWeight={700} flexShrink={0} _focusVisible={{ boxShadow: 'outline', outline: 'none' }}
          title={autoRefresh ? 'Pause live updates' : 'Resume live updates'}>
          {autoRefresh ? <LiveDot color="#2e9e5b" /> : <Box w="8px" h="8px" borderRadius="2px" bg="brand.500" />}
          {autoRefresh ? 'Auto-refresh' : `Paused${pending.length ? ` · ${pending.length} new` : ''}`}
        </Flex>
      </SectionTitle>

      <Box position="relative" mt="16px" pl="4px">
        <Box position="absolute" left="8.5px" top="8px" bottom="14px" w="1px" bg="brand.200" />
        {loading && <LoadingState label="Loading recent activity" lines={5} ml="24px" />}
        {!loading && !items.length && <EmptyState icon={FiActivity} title="No activity yet" hint="Takeovers, deploys and alerts are logged here as they happen." />}
        {items.map((a, i) => {
          const critical = a.severity === 'critical';
          return (
            <Flex key={a._id || `${a.timestamp}-${i}`} as={a.conversationId ? 'button' : 'div'} type="button" textAlign="left" w="100%"
              onClick={a.conversationId ? () => navigate(`/conversation/${a.conversationId}`) : undefined}
              align="flex-start" h="48px" position="relative" borderRadius="6px" _focusVisible={{ boxShadow: 'outline', outline: 'none' }}
              sx={i === 0 ? { animation: 'feedIn 380ms cubic-bezier(0.22, 1, 0.36, 1)', '@keyframes feedIn': { from: { opacity: 0, transform: 'translateY(-6px)' }, to: { opacity: 1, transform: 'none' } } } : undefined}>
              <Box w="10px" h="10px" borderRadius="full" bg={critical ? '#d95b5b' : '#6e5ba5'} mt="4px" flexShrink={0} position="relative" boxShadow="0 0 0 3px white" />
              <Text w="58px" ml="12px" fontSize="9px" color="ink.300" pt="3px" flexShrink={0} sx={{ fontVariantNumeric: 'tabular-nums' }}>{hhmmss(a.timestamp)}</Text>
              <Box minW={0}>
                <Text fontSize="10px" fontWeight={700} color="ink.900" noOfLines={1}>{a.title}</Text>
                <Text fontSize="9px" color="ink.300" mt="3px" noOfLines={1}>{a.detail}</Text>
              </Box>
            </Flex>
          );
        })}
      </Box>
    </Card>
  );
};

export default SupervisorFeed;
