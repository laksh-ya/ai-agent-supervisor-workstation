import React, { useMemo, useState } from 'react';
import { Box, Flex, Input, Text, VStack } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { InitialAvatar, Pill, SEVERITY, EmptyState, LoadingState } from '../ui';
import { clock } from '../../utils/format';
import useNow from '../../hooks/useNow';
import { useAppData } from '../../context/AppDataContext';

const ConversationList = ({ selectedId }) => {
  const { liveList, conversations, loading } = useAppData();
  const [q, setQ] = useState('');
  const now = useNow();
  const navigate = useNavigate();

  const items = useMemo(() => {
    const list = [...liveList];
    // Keep the open conversation visible even after it is resolved
    if (selectedId && conversations[selectedId] && !list.some((c) => c.id === selectedId)) list.unshift(conversations[selectedId]);
    const needle = q.trim().toLowerCase().replace(/^#/, '');
    if (!needle) return list;
    return list.filter((c) => c.customer?.name?.toLowerCase().includes(needle) || String(c.caseNumber).includes(needle)
      || c.issue?.toLowerCase().includes(needle) || (c.tags || []).some((t) => t.includes(needle)));
  }, [liveList, conversations, selectedId, q]);

  return (
    <Flex direction="column" w="264px" flexShrink={0} h="100%" minH={0}>
      <Text as="h1" fontSize="17px" fontWeight={500} color="ink.700" mt="9px" mb="12px">Customer Conversations</Text>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or case…" aria-label="Search customer or case"
        h="40px" bg="white" border="1px solid transparent" borderRadius="8px" fontSize="14px" mb="15px"
        _placeholder={{ color: '#c8c4d0' }} _hover={{ borderColor: 'line.300' }} />
      <VStack spacing="9px" align="stretch" overflowY="auto" flex="1" pr="2px" pb="8px" role="list" aria-label="Open conversations">
        {loading.conversations && !items.length && <LoadingState label="Loading open conversations" lines={4} h="70px" />}
        {!loading.conversations && !items.length && <EmptyState title={q ? `No match for “${q}”` : 'No open conversations'} hint={q ? 'Search by customer name, case number, issue or tag.' : 'New conversations appear here as customers write in.'} />}
        {items.map((c) => {
          const selected = c.id === selectedId;
          const sev = c.status === 'resolved' ? { tone: 'green', label: 'Resolved' } : SEVERITY[c.risk?.severity] || SEVERITY.stable;
          const human = c.humanIntervention?.active;
          const wait = c.status === 'resolved' && c.endTime ? (new Date(c.endTime) - new Date(c.startTime)) / 1000 : (now - new Date(c.startTime).getTime()) / 1000;
          return (
            <Box key={c.id} as="button" type="button" role="listitem" textAlign="left" onClick={() => navigate(`/conversation/${c.id}`)}
              aria-current={selected ? 'true' : undefined}
              bg="white" border="1.5px solid" borderColor={selected ? 'brand.300' : 'brand.200'} borderRadius="8px" px="12px" pt="10px" pb="9px"
              boxShadow={selected ? '0 0 0 2px rgba(81,65,132,0.12)' : 'none'} transition="border-color 150ms ease, box-shadow 150ms ease"
              _hover={{ borderColor: 'brand.300' }} _focusVisible={{ boxShadow: 'outline', outline: 'none' }} flexShrink={0}>
              <Flex gap="10px" align="center">
                <InitialAvatar name={c.customer?.name} size={26} />
                <Box minW={0} flex="1">
                  <Flex align="center" gap="6px">
                    <Text fontSize="11px" fontWeight={700} color="ink.800" noOfLines={1}>{c.customer?.name}</Text>
                    {human && <Box as="span" fontSize="8px" fontWeight={700} color="brand.500" bg="brand.100" px="5px" py="1px" borderRadius="6px">You</Box>}
                  </Flex>
                  <Text fontSize="9px" color="ink.300" mt="2px" noOfLines={1}>{c.issue || c.queueLabel}</Text>
                </Box>
              </Flex>
              <Flex justify="space-between" align="center" mt="13px">
                <Pill tone={sev.tone} h="22px" px="14px" borderRadius="11px">{sev.label}</Pill>
                <Text fontSize="9px" color="ink.500" sx={{ fontVariantNumeric: 'tabular-nums' }}>{clock(wait)}</Text>
              </Flex>
            </Box>
          );
        })}
      </VStack>
    </Flex>
  );
};

export default ConversationList;
