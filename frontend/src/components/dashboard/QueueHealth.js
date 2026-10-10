import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Card, SectionTitle, Bar, LoadingState, EmptyState } from '../ui';

function toneFor(p) {
  if (p >= 80) return { color: '#d95b5b', text: 'tint.redText', label: '' };
  if (p >= 65) return { color: '#e1a43a', text: '#c98a1c', label: '(Watch) ' };
  if (p >= 50) return { color: '#638cc7', text: 'tint.blueText', label: '(Watch)' };
  return { color: '#4e9a68', text: 'tint.greenText', label: '(Healthy) ' };
}

const QueueHealth = ({ items, loading, activeQueue, onSelect }) => (
  <Card px="16px" pt="18px" pb="16px" h="100%">
    <SectionTitle title="Queue health" subtitle="Prioritized by breach probability" />
    <Box mt="14px">
      {loading && !items?.length && <LoadingState label="Calculating breach probability" lines={4} />}
      {!loading && !items?.length && <EmptyState title="No open queues" hint="Queues appear when conversations are open." />}
      {(items || []).slice(0, 4).map((q) => {
        const t = toneFor(q.probability);
        const active = activeQueue === q.queue;
        return (
          <Box key={q.queue} as="button" type="button" w="100%" textAlign="left" mb="20px" onClick={() => onSelect(active ? null : q.queue)}
            aria-pressed={active} title={`${q.conversations} open conversation${q.conversations === 1 ? '' : 's'}. Select to filter the queue.`}
            borderRadius="6px" _focusVisible={{ boxShadow: 'outline', outline: 'none' }} data-group>
            <Flex justify="space-between" align="center" mb="10px">
              <Text fontSize="11px" color="ink.600" fontWeight={active ? 700 : 400} _groupHover={{ color: 'ink.900' }}>{q.label}</Text>
              <Text fontSize="10px" fontWeight={500} color={t.text} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {t.label}{q.probability}%
              </Text>
            </Flex>
            <Bar value={q.probability / 100} color={t.color} h="6px" label={`${q.label} breach probability`} />
          </Box>
        );
      })}
    </Box>
  </Card>
);

export default QueueHealth;
