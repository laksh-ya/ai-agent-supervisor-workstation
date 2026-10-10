import React from 'react';
import { Box, Flex, Grid, Text, Menu, MenuButton, MenuList, MenuOptionGroup, MenuItemOption, Button, Skeleton, Tooltip } from '@chakra-ui/react';
import { Pill, Divider, StatLabel } from '../ui';
import { timeAgo } from '../../utils/format';

const STATUS = {
  pass: { tone: 'green', label: 'Pass', bar: '#4e9a68' },
  review: { tone: 'amber', label: 'Review', bar: '#e1a43a' },
  risk: { tone: 'red', label: 'Risk', bar: '#d95b5b' }
};

function Tile({ label, metric, suffix = '', decimals = 1, lowerIsBetter, loading }) {
  const d = metric?.delta;
  const good = d == null ? null : lowerIsBetter ? d <= 0 : d >= 0;
  return (
    <Box bg="#f8f6fb" borderRadius="12px" h="70px" pl="14px" pr="16px" pt="12px">
      <StatLabel>{label}</StatLabel>
      <Flex justify="space-between" align="center" mt="7px">
        {loading ? <Skeleton h="22px" w="70px" /> : (
          <Text fontSize="20px" fontWeight={700} color="#302b38" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {metric?.value == null ? 'n/a' : `${Number(metric.value).toFixed(decimals)}${suffix}`}
          </Text>
        )}
        {d != null && (
          <Text fontSize="9px" fontWeight={700} color={good ? 'tint.greenText' : 'tint.redText'}>
            {d > 0 ? '+' : d < 0 ? '−' : '±'}{Math.abs(d).toFixed(1)}{suffix}
          </Text>
        )}
      </Flex>
    </Box>
  );
}

const RANGES = [{ id: '7d', label: 'Last 7 days' }, { id: '24h', label: 'Last 24 hours' }];

const PerformancePanel = ({ agent, performance, perfLoading, range, setRange, evaluation, evalRunning, evalIsDraft, evalStale }) => (
  <Box bg="white" border="1px solid" borderColor="line.300" borderRadius="20px" px="20px" pt="15px" pb="24px" h="100%" overflowY="auto">
    <Flex justify="space-between" align="center">
      <Text as="h2" fontSize="15px" fontWeight={700} color="ink.900">Performance &amp; guardrails</Text>
      <Menu placement="bottom-end">
        <MenuButton as={Button} h="24px" w="110px" fontSize="10px" borderRadius="12px" bg="#f5f2f9" color="brand.500" _hover={{ bg: 'brand.100' }} _active={{ bg: 'brand.100' }}
          aria-label="Performance range">
          {RANGES.find((r) => r.id === range)?.label}
        </MenuButton>
        <MenuList>
          <MenuOptionGroup type="radio" value={range} onChange={setRange}>
            {RANGES.map((r) => <MenuItemOption key={r.id} value={r.id}>{r.label}</MenuItemOption>)}
          </MenuOptionGroup>
        </MenuList>
      </Menu>
    </Flex>

    <Grid templateColumns="1fr 1fr" gap="16px 20px" mt="25px">
      <Tile label="Containment" metric={performance?.containment} suffix="%" loading={perfLoading} />
      <Tile label="CSAT" metric={performance?.csat} loading={perfLoading} />
      <Tile label="Fallback" metric={performance?.fallback} suffix="%" lowerIsBetter loading={perfLoading} />
      <Tile label="Hallucination" metric={performance?.hallucination} suffix="%" lowerIsBetter loading={perfLoading} />
    </Grid>

    <Flex justify="space-between" align="flex-start" mt="33px">
      <Box>
        <Text as="h3" fontSize="14px" fontWeight={700} color="ink.900">Evaluation suite</Text>
        <Text fontSize="10px" color="ink.300" mt="5px">{evaluation?.scenarios || 124} scenarios across policy, tone, safety, and task completion</Text>
      </Box>
      <Flex direction="column" align="flex-end" gap="4px" pt="2px">
        {evalIsDraft && <Pill tone="amber" h="18px" fontSize="9px" px="8px">Draft config</Pill>}
        {evalStale && !evalRunning && <Tooltip label="The draft changed since this run" hasArrow><Pill tone="neutral" h="18px" fontSize="9px" px="8px">Stale. Run evals</Pill></Tooltip>}
        {evaluation?.ranAt && <Text fontSize="9px" color="ink.200">Ran {timeAgo(evaluation.ranAt)}</Text>}
      </Flex>
    </Flex>

    <Flex direction="column" gap="19px" mt="19px" opacity={evalRunning ? 0.55 : 1} transition="opacity 200ms" aria-busy={evalRunning}>
      {(evaluation?.results || Array.from({ length: 5 }).map((_, i) => ({ id: i }))).map((r) => {
        const s = STATUS[r.status] || STATUS.review;
        return (
          <Flex key={r.id} align="center" gap="16px">
            {r.name
              ? <Text fontSize="10px" color="#4e4755" w="103px" flexShrink={0}>{r.name}</Text>
              : <Skeleton h="10px" w="103px" flexShrink={0} />}
            <Box flex="1" h="8px" bg="brand.100" borderRadius="full" overflow="hidden">
              <Box h="100%" w={`${(r.score || 0) * 100}%`} bg={s.bar} borderRadius="full" transition="width 700ms cubic-bezier(0.22,1,0.36,1)" />
            </Box>
            <Flex w="95px" justify="flex-end" align="center" gap="4px" flexShrink={0}>
              <Text fontSize="9px" fontWeight={700} color="#5b5463" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.score != null ? `${Math.round(r.score * 100)}%` : ''}</Text>
              {r.status && <Pill tone={s.tone} w="58px" px={0}>{s.label}</Pill>}
            </Flex>
          </Flex>
        );
      })}
    </Flex>

    <Divider my="33px" />

    <Text as="h3" fontSize="14px" fontWeight={700} color="ink.900">Routing matrix</Text>
    <Text fontSize="10px" color="ink.300" mt="5px">Traffic split by intent and customer tier</Text>
    <Box as="table" w="100%" mt="14px" sx={{ borderCollapse: 'collapse', tableLayout: 'fixed' }} aria-label="Routing matrix">
      <Box as="thead">
        <Box as="tr" borderBottom="1px solid" borderColor="line.200">
          {['Intent', 'Model', 'Tier', 'Traffic', 'Failover'].map((h, i) => (
            <Box as="th" key={h} textAlign="left" fontSize="8px" fontWeight={700} color="ink.200" textTransform="uppercase" pb="13px"
              w={['24%', '22%', '18%', '18%', '18%'][i]}>{h}</Box>
          ))}
        </Box>
      </Box>
      <Box as="tbody">
        {(agent.routing || []).map((r, i) => (
          <Box as="tr" key={i} borderBottom="1px solid" borderColor="line.200" h="37px">
            <Box as="td" fontSize="9px" color="#413b49">{r.intent}</Box>
            <Box as="td" fontSize="9px" color="#5f5868">{r.model}</Box>
            <Box as="td" fontSize="9px" color="#5f5868">{r.tier}</Box>
            <Box as="td" fontSize="9px" color="#5f5868">{r.traffic}%</Box>
            <Box as="td" fontSize="9px" color="#5f5868">{r.failover}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);

export default PerformancePanel;
