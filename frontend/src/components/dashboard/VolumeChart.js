import React, { useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, SectionTitle, LoadingState, EmptyState } from '../ui';
import { hhmm } from '../../utils/format';

const SERIES = [
  { key: 'live', label: 'Live', color: '#56469a', bg: 'brand.100', fg: 'brand.500', dash: undefined },
  { key: 'slaExposure', label: 'SLA exposure', color: '#e1a43a', bg: 'tint.amber', fg: 'tint.amberText', dash: '7 7' }
];

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Box bg="white" border="1px solid" borderColor="line.300" borderRadius="10px" boxShadow="pop" px="10px" py="8px" fontSize="11px">
      <Text fontWeight={700} color="ink.900" mb="4px">{hhmm(p.t)}</Text>
      <Text color="#56469a">Live load: <b>{p.live}</b></Text>
      <Text color="ink.300">Forecast: <b>{p.forecast}</b></Text>
      <Text color="tint.amberText">SLA exposure: <b>{p.slaExposure}</b></Text>
    </Box>
  );
}

const VolumeChart = ({ series, loading }) => {
  const [hidden, setHidden] = useState({});
  const points = (series?.points || []).map((p) => ({ ...p, t: new Date(p.t).getTime() }));
  return (
    <Card borderRadius="12px" px="16px" pt="18px" pb="16px" display="flex" flexDirection="column" h="100%">
      <SectionTitle title="Conversation volume & SLA exposure" subtitle={`Live vs forecast • ${series?.resolutionMinutes || 5}-minute resolution`} />
      <Box flex="1" minH="170px" mt="14px" ml="-4px">
        {!loading && !points.length ? (
          <EmptyState title="No volume history yet" hint="Snapshots are recorded every minute." h="100%" />
        ) : loading && !points.length ? (
          <LoadingState label="Loading volume history" lines={4} h="20px" mt="12px" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#efedf3" />
              <XAxis dataKey="t" hide type="number" domain={['dataMin', 'dataMax']} />
              <YAxis hide domain={[(min) => Math.max(0, Math.floor(min * 0.7)), (max) => Math.ceil(max * 1.1)]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#dad8e4', strokeWidth: 1 }} />
              {SERIES.map((s) => (
                <Line key={s.key} type="linear" dataKey={s.key} stroke={s.color} strokeWidth={s.dash ? 2.5 : 3}
                  strokeDasharray={s.dash} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} hide={!!hidden[s.key]}
                  isAnimationActive={false} strokeLinejoin="round" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>
      <Flex gap="10px" mt="10px">
        {SERIES.map((s) => (
          <Flex key={s.key} as="button" type="button" onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}
            aria-pressed={!hidden[s.key]} align="center" gap="6px" h="20px" px="10px" borderRadius="10px" bg={s.bg}
            color={s.fg} fontSize="10px" fontWeight={700} opacity={hidden[s.key] ? 0.45 : 1} transition="opacity 150ms"
            minW="74px" _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
            <Box w="7px" h="7px" borderRadius="full" bg={s.color} />
            {s.label}
          </Flex>
        ))}
      </Flex>
    </Card>
  );
};

export default VolumeChart;
