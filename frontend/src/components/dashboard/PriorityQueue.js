import React, { useMemo, useState } from 'react';
import {
  Box, Flex, Text, Table, Thead, Tbody, Tr, Th, Td, Popover, PopoverTrigger, PopoverContent, PopoverBody,
  Select, Button, IconButton, Tooltip, useToast
} from '@chakra-ui/react';
import { FiArrowUpRight, FiChevronRight, FiInbox } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { Card, SectionTitle, riskTone, TONES, EmptyState, LoadingState, InitialAvatar } from '../ui';
import { clock } from '../../utils/format';
import useNow from '../../hooks/useNow';
import { useAppData } from '../../context/AppDataContext';

export const ACTION_LABELS = {
  take_over: 'Take over',
  approve_override: 'Approve override',
  review_evidence: 'Review evidence',
  monitor: 'Monitor',
  send_template: 'Send template',
  reply: 'Reply'
};

const SLA_SECONDS = 15 * 60;

const SORTS = [
  { id: 'risk', label: 'risk', fn: (a, b) => b.risk.score - a.risk.score },
  { id: 'wait', label: 'wait', fn: (a, b) => new Date(a.startTime) - new Date(b.startTime) },
  { id: 'name', label: 'customer', fn: (a, b) => a.customer.name.localeCompare(b.customer.name) }
];

const EMPTY_FILTERS = { queue: '', status: '', alertLevel: '', agentId: '' };

function FilterPopover({ filters, setFilters, queues, agents }) {
  const active = Object.values(filters).filter(Boolean).length;
  const label = filters.queue ? `${queues.find((q) => q.value === filters.queue)?.label || filters.queue}` : 'All queues';
  const field = (name, placeholder, options) => (
    <Box>
      <Text fontSize="10px" fontWeight={700} color="ink.300" textTransform="uppercase" letterSpacing="0.04em" mb="4px">{placeholder}</Text>
      <Select size="sm" fontSize="12px" borderRadius="10px" value={filters[name]} onChange={(e) => setFilters((f) => ({ ...f, [name]: e.target.value }))}
        aria-label={`Filter by ${placeholder.toLowerCase()}`}>
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Box>
  );
  return (
    <Popover placement="bottom-end" isLazy>
      <PopoverTrigger>
        <Button size="xs" variant="soft" h="24px" px="12px" fontSize="10px" borderRadius="12px" aria-label="Filter conversations">
          {label}{active > (filters.queue ? 1 : 0) ? ` · +${active - (filters.queue ? 1 : 0)}` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent w="260px" borderRadius="12px" boxShadow="pop" borderColor="line.300" _focus={{ outline: 'none' }}>
        <PopoverBody p="14px" display="grid" gap="10px">
          {field('queue', 'Queue', queues)}
          {field('status', 'Status', [
            { value: 'active', label: 'AI handling' },
            { value: 'waiting', label: 'Waiting on customer' },
            { value: 'escalated', label: 'Escalated or human-owned' }
          ])}
          {field('alertLevel', 'Alert level', [
            { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }
          ])}
          {field('agentId', 'AI owner', agents.map((a) => ({ value: a.id, label: a.name })))}
          <Button size="sm" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)} isDisabled={!active}>Clear filters</Button>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function waitColor(seconds) {
  if (seconds >= SLA_SECONDS) return 'tint.redText';
  if (seconds >= SLA_SECONDS - 5 * 60) return '#b07d16';
  return 'ink.500';
}

const PriorityQueue = ({ region, filters, setFilters }) => {
  const { liveList, agents, loading, takeOver, notifyError } = useAppData();
  const [sort, setSort] = useState(0);
  const [busy, setBusy] = useState(null);
  const now = useNow();
  const navigate = useNavigate();
  const toast = useToast();

  const queues = useMemo(() => {
    const map = new Map();
    liveList.forEach((c) => map.set(c.queue, c.queueLabel || c.queue));
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [liveList]);

  const rows = useMemo(() => {
    return liveList
      .filter((c) => (region === 'all' || c.region === region)
        && (!filters.queue || c.queue === filters.queue)
        && (!filters.status || c.status === filters.status)
        && (!filters.alertLevel || c.alertLevel === filters.alertLevel)
        && (!filters.agentId || c.agent?.id === filters.agentId))
      .sort(SORTS[sort].fn);
  }, [liveList, region, filters, sort]);

  const runAction = async (c) => {
    const action = c.risk?.action;
    if (action === 'take_over') {
      setBusy(c.id);
      try {
        await takeOver(c.id, 'Taken over from priority queue');
        toast({ status: 'success', title: `You own ${c.customer.name}'s conversation`, description: `${c.agent?.name || 'The AI agent'} is paused until you return control.` });
        navigate(`/conversation/${c.id}`);
      } catch (err) {
        notifyError('Takeover failed', err);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (action === 'send_template') return navigate(`/conversation/${c.id}?templates=open`);
    if (action === 'approve_override') return navigate(`/conversation/${c.id}?focus=copilot`);
    return navigate(`/conversation/${c.id}`);
  };

  const filtered = Object.values(filters).some(Boolean) || region !== 'all';

  return (
    <Card px="16px" pt="18px" pb="10px" h="100%" display="flex" flexDirection="column">
      <SectionTitle title="Priority conversation queue" subtitle="Ranked by breach risk, customer value and wait time" flexWrap="wrap" rowGap="10px">
        <Flex gap="8px" align="center" flexShrink={0}>
          <FilterPopover filters={filters} setFilters={setFilters} queues={queues} agents={agents} />
          <Button size="xs" variant="soft" h="24px" px="12px" fontSize="10px" borderRadius="12px"
            onClick={() => setSort((s) => (s + 1) % SORTS.length)} aria-label={`Sort by ${SORTS[(sort + 1) % SORTS.length].label}`}>
            Sort: {SORTS[sort].label}
          </Button>
          <Tooltip label="Open conversation workspace" hasArrow>
            <IconButton aria-label="Open conversation workspace" icon={<FiArrowUpRight size={16} />} size="xs" h="26px" w="50px"
              bg="brand.200" color="ink.700" borderRadius="12px" _hover={{ bg: 'brand.300' }} onClick={() => navigate('/conversations')} />
          </Tooltip>
        </Flex>
      </SectionTitle>

      <Box mt="12px" flex="1" overflowY="auto" overflowX="auto" maxH={{ base: '380px', xl: '232px' }} data-testid="conversation-list">
        {loading.conversations && !liveList.length ? (
          <LoadingState label="Loading live conversations" lines={5} h="24px" mt="10px" />
        ) : rows.length ? (
          <Table size="sm" variant="unstyled" aria-label="Priority conversation queue" minW="640px">
            <Thead position="sticky" top={0} bg="white" zIndex={1}>
              <Tr>
                {['Customer / case', 'Queue', 'AI owner', 'Risk', 'Wait', 'Next step'].map((h, i) => (
                  <Th key={h} px={0} pl={i === 0 ? '12px' : 0} py="8px" fontSize="8px" fontWeight={700} color="ink.200" letterSpacing="0.05em"
                    textTransform="uppercase" borderBottom="1px solid" borderColor="line.200" fontFamily="body">{h}</Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((c) => {
                const tone = TONES[riskTone(c.risk.score)];
                const wait = (now - new Date(c.startTime).getTime()) / 1000;
                const human = c.humanIntervention?.active;
                const isTakeover = c.risk.action === 'take_over';
                return (
                  <Tr key={c.id} h="46px" borderBottom="1px solid" borderColor="line.200" cursor="pointer" position="relative"
                    transition="background 120ms ease" _hover={{ bg: '#faf9fc' }} onClick={() => navigate(`/conversation/${c.id}`)}>
                    <Td px={0} pl="12px" position="relative">
                      <Box position="absolute" left={0} top="9px" bottom="9px" w="3px" borderRadius="full" bg={tone.dot} aria-hidden />
                      <Flex align="center" gap="8px" minW={0}>
                        <InitialAvatar name={c.customer.name} size={22} fontSize="9px" />
                        <Box minW={0}>
                          <Flex align="center" gap="6px">
                            <Text fontSize="10px" fontWeight={700} color="ink.800" whiteSpace="nowrap">{c.customer.name} · #{c.caseNumber}</Text>
                            {human && <Box as="span" fontSize="8px" fontWeight={700} color="brand.500" bg="brand.100" px="5px" py="1px" borderRadius="6px">You</Box>}
                          </Flex>
                          <Text fontSize="9px" color="ink.300" noOfLines={1} maxW="190px">{c.issue || c.queueLabel}</Text>
                        </Box>
                      </Flex>
                    </Td>
                    <Td px={0} fontSize="10px" color="ink.500">{c.queue}</Td>
                    <Td px={0} fontSize="10px" color="ink.500" whiteSpace="nowrap">{c.agent?.name}</Td>
                    <Td px={0}>
                      <Flex w="46px" h="18px" align="center" justify="center" borderRadius="9px" bg={tone.bg} color={tone.fg} fontSize="10px" fontWeight={700} className="tnum"
                        aria-label={`Risk ${c.risk.score} of 100`}>
                        {c.risk.score}
                      </Flex>
                    </Td>
                    <Td px={0} fontSize="10px" fontWeight={wait >= SLA_SECONDS - 300 ? 700 : 400} color={waitColor(wait)} className="tnum"
                      title={wait >= SLA_SECONDS ? 'Past the 15 minute resolution SLA' : undefined}>{clock(wait)}</Td>
                    <Td px={0} pr="4px">
                      {isTakeover && !human ? (
                        <Button size="xs" h="24px" px="10px" fontSize="10px" borderRadius="8px" onClick={(e) => { e.stopPropagation(); runAction(c); }}
                          isLoading={busy === c.id} isDisabled={!!busy} aria-label={`Take over from AI for ${c.customer.name}`}>
                          Take over
                        </Button>
                      ) : (
                        <Button variant="link" fontSize="10px" fontWeight={700} color="brand.800" minW={0} h="24px" rightIcon={<FiChevronRight />} iconSpacing="2px"
                          onClick={(e) => { e.stopPropagation(); runAction(c); }} isDisabled={!!busy}
                          aria-label={`${ACTION_LABELS[c.risk.action] || 'Open'} for ${c.customer.name}`}>
                          {human ? 'Reply' : ACTION_LABELS[c.risk.action] || 'Open'}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ) : (
          <EmptyState icon={FiInbox}
            title={filtered ? 'No conversations match these filters' : 'Queue is clear'}
            hint={filtered ? 'Widen the queue, status or region filter.' : 'New conversations appear here as customers write in.'}
            action={filtered ? <Button size="xs" variant="soft" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button> : null} />
        )}
      </Box>
    </Card>
  );
};

export { EMPTY_FILTERS };
export default PriorityQueue;
