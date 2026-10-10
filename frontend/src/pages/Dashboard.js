// src/pages/Dashboard.js — Agent Monitoring Dashboard
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, Button, Menu, MenuButton, MenuList, MenuItemOption, MenuOptionGroup } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import { useAppData } from '../context/AppDataContext';
import { useSettings } from '../context/SettingsContext';
import KpiCard from '../components/dashboard/KpiCard';
import VolumeChart from '../components/dashboard/VolumeChart';
import QueueHealth from '../components/dashboard/QueueHealth';
import CriticalSignals from '../components/dashboard/CriticalSignals';
import PriorityQueue, { EMPTY_FILTERS, ACTION_LABELS } from '../components/dashboard/PriorityQueue';
import SupervisorFeed from '../components/dashboard/SupervisorFeed';
import { clock } from '../utils/format';
import { LiveDot } from '../components/ui';
import useNow from '../hooks/useNow';

const RANGES = [
  { id: '30m', label: 'Last 30 min' },
  { id: '2h', label: 'Last 2 hours' },
  { id: '24h', label: 'Last 24 hours' },
  { id: '7d', label: 'Last 7 days' }
];

const STREAM_INTERVAL_MS = 2000; // matches the server's SSE push cadence

const signed = (v, digits = 1, suffix = '') => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}${suffix}`;
const signedClock = (s) => `${s > 0 ? '+' : s < 0 ? '−' : '±'}${clock(Math.abs(s)).replace(/^0(?=\d:)/, '')}`;

// SSE state for the metrics stream: always visible so a stalled feed is never mistaken for a quiet floor
function StreamStatus({ stream }) {
  const now = useNow();
  const age = stream.at ? Math.max(0, Math.round((now - stream.at) / 1000)) : null;
  const stale = stream.status === 'live' && age !== null && age > 6;
  const view = {
    live: stale ? { dot: '#e1a43a', bg: 'tint.amber', fg: 'tint.amberText', text: `Stale · ${age}s` } : { dot: '#2e9e5b', bg: 'tint.green', fg: 'tint.greenText', text: `Live · ${age ?? 0}s ago`, pulse: true },
    connecting: { dot: '#e1a43a', bg: 'tint.amber', fg: 'tint.amberText', text: 'Connecting' },
    reconnecting: { dot: '#d95b5b', bg: 'tint.red', fg: 'tint.redText', text: 'Reconnecting' },
    paused: { dot: '#8a8394', bg: 'brand.100', fg: 'ink.400', text: 'Paused' }
  }[stream.status] || { dot: '#8a8394', bg: 'brand.100', fg: 'ink.400', text: 'Offline' };
  return (
    <Flex align="center" gap="6px" h="24px" px="10px" borderRadius="12px" bg={view.bg} color={view.fg} fontSize="10px" fontWeight={700}
      data-testid="metrics-stream-status" data-status={stream.status} role="status" aria-live="polite" className="tnum"
      title={stream.status === 'paused' ? 'Metrics stream paused. Turn on auto-refresh to resume.' : 'Dashboard metrics stream over SSE every 2 seconds'}>
      {view.pulse ? <LiveDot color={view.dot} /> : <Box w="8px" h="8px" borderRadius="full" bg={view.dot} />}
      {view.text}
    </Flex>
  );
}

const PillMenu = ({ value, options, onChange, label }) => (
  <Menu placement="bottom-end">
    <MenuButton as={Button} size="xs" variant="outline" h="24px" px="12px" fontSize="10px" borderRadius="12px" borderColor="white"
      bg="white" color="brand.500" aria-label={label} _hover={{ bg: 'brand.100' }} _active={{ bg: 'brand.100' }}>
      {options.find((o) => o.id === value)?.label}
    </MenuButton>
    <MenuList>
      <MenuOptionGroup type="radio" value={value} onChange={onChange}>
        {options.map((o) => <MenuItemOption key={o.id} value={o.id}>{o.label}</MenuItemOption>)}
      </MenuOptionGroup>
    </MenuList>
  </Menu>
);

function downloadCsv(dashboard, rows) {
  const k = dashboard.kpis;
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Supervisor report', new Date().toLocaleString()],
    ['Range', dashboard.range, 'Region', dashboard.region],
    [],
    ['Metric', 'Value', 'Change'],
    ['Active load', k.activeLoad.value, `${k.activeLoad.delta}%`],
    ['SLA at risk', k.slaAtRisk.value, k.slaAtRisk.delta],
    ['AI containment (resolution without handoff)', `${k.containment.value}%`, `${k.containment.delta} pts`],
    ['Avg handle time', clock(k.avgHandleTime.value), `${k.avgHandleTime.delta}s`],
    ['CSAT (0-10)', k.csat.value, k.csat.delta],
    ['Avg AI response time', `${k.avgResponseTime}s`, ''],
    ['Resolution rate (7d)', `${k.resolutionRate}%`, ''],
    [],
    ['Queue', 'Breach probability', 'Live conversations'],
    ...dashboard.queueHealth.map((q) => [q.label, `${q.probability}%`, q.conversations]),
    [],
    ['Case', 'Customer', 'Queue', 'AI owner', 'Risk', 'Status', 'Alert', 'Recommended action'],
    ...rows.map((c) => [c.caseNumber, c.customer?.name, c.queue, c.agent?.name, c.risk?.score, c.status, c.alertLevel, ACTION_LABELS[c.risk?.action] || ''])
  ];
  const blob = new Blob([lines.map((l) => l.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `supervisor-report-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const Dashboard = () => {
  const { liveList, notifyError } = useAppData();
  const { autoRefresh } = useSettings();
  const [range, setRange] = useState('30m');
  const [region, setRegion] = useState('all');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stream, setStream] = useState({ status: 'connecting', at: null });
  const navigate = useNavigate();
  const queueRef = useRef();

  const load = useCallback(() => {
    return api.getDashboard({ range, region })
      .then(setData)
      .catch((err) => notifyError('Dashboard failed to load', err))
      .finally(() => setLoading(false));
  }, [range, region, notifyError]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Live metrics: Server-Sent Events push KPIs, trend, queue health and signals every 2 seconds.
  // The WebSocket keeps driving the priority queue and supervisor feed in parallel.
  useEffect(() => {
    if (!autoRefresh || typeof EventSource === 'undefined') { setStream({ status: 'paused', at: null }); return undefined; }
    let es = null;
    setStream({ status: 'connecting', at: null });
    // The REST snapshot paints fresh numbers immediately; the stream takes over at the first 2-second
    // tick. Deferring the long-lived request also lets the page reach network-idle after load.
    const startTimer = setTimeout(() => {
      es = new EventSource(api.dashboardStreamUrl({ range, region }));
      es.addEventListener('metrics', (e) => {
        try {
          const metrics = JSON.parse(e.data);
          setData((prev) => ({ ...metrics, queue: prev?.queue || [] }));
          setLoading(false);
          setStream({ status: 'live', at: Date.now() });
        } catch { /* ignore malformed frame */ }
      });
      es.onerror = () => setStream((s) => ({ ...s, status: 'reconnecting' })); // EventSource retries on its own
    }, STREAM_INTERVAL_MS);
    return () => {
      clearTimeout(startTimer);
      if (es) es.close();
    };
  }, [range, region, autoRefresh]);

  const k = data?.kpis;
  const regions = [{ id: 'all', label: 'All regions' }, ...(data?.regions || []).map((r) => ({ id: r, label: r }))];

  const onSignal = (s) => {
    if (s.target.type === 'queue') setFilters({ ...EMPTY_FILTERS, queue: s.target.value });
    else if (s.target.type === 'region') setRegion(s.target.value);
    else if (s.target.type === 'agent') return navigate(`/agent-config?agent=${s.target.value}`);
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return undefined;
  };

  const exportRows = liveList.filter((c) => region === 'all' || c.region === region);
  const windowLabel = RANGES.find((r) => r.id === range)?.label.replace('Last ', '').toLowerCase();

  return (
    <Box pt="20px" pb="8px">
      <Flex justify="space-between" align={{ base: 'stretch', md: 'flex-start' }} direction={{ base: 'column', md: 'row' }} gap="14px" mb="22px">
        <Box>
          <Heading as="h1" fontSize={{ base: '22px', md: '26px' }} fontWeight={700} color="ink.900" letterSpacing="-0.01em" lineHeight="32px">Dashboard</Heading>
          <Text fontSize="11px" color="ink.400" mt="6px">
            {data ? `Live supervision across ${data.scope.queues} queues, ${data.scope.regions} regions and ${data.scope.agents} AI agents` : 'Connecting to live supervision data'}
          </Text>
        </Box>
        <Flex gap="12px" align="center" pt={{ base: 0, md: '6px' }} wrap="wrap">
          <StreamStatus stream={stream} />
          <PillMenu value={range} options={RANGES} onChange={setRange} label="Time range" />
          <PillMenu value={region} options={regions} onChange={setRegion} label="Region" />
          <Button size="lg" h="36px" w={{ base: 'auto', sm: '148px' }} flex={{ base: 1, sm: 'initial' }} fontSize="14px" ml={{ base: 0, sm: '4px' }} onClick={() => data && downloadCsv(data, exportRows)} isDisabled={!data}>
            Export report
          </Button>
        </Flex>
      </Flex>

      <Grid templateColumns={{ base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }} gap={{ base: '10px', md: '15px' }} mb="22px">
        <KpiCard loading={loading && !k} label="Active load" value={k?.activeLoad.value.toLocaleString()}
          delta={k && signed(k.activeLoad.delta, 1, '%')} good={null}
          caption={`Open now · vs ${windowLabel} ago`}
          tooltip="Open conversations: AI handling, waiting on the customer or escalated. Compared with the start of the selected window." />
        <KpiCard loading={loading && !k} label="SLA at risk" value={k?.slaAtRisk.value}
          delta={k && signed(k.slaAtRisk.delta, 0)} good={k ? k.slaAtRisk.delta <= 0 : null}
          caption="Risk 65+ or under 5 min to SLA"
          tooltip="Open conversations with a risk score of 65 or more, or less than 5 minutes left on the 15 minute chat resolution SLA." />
        <KpiCard loading={loading && !k} label="AI containment" value={k && `${k.containment.value.toFixed(1)}%`}
          delta={k && signed(k.containment.delta, 1, '%')} good={k ? k.containment.delta >= 0 : null}
          caption={k ? `Resolved without handoff · ${k.resolutionRate}% overall` : ''}
          tooltip={k ? `Share of conversations resolved by AI without a human handoff over 7 days. Overall resolution rate: ${k.resolutionRate}%.` : ''} />
        <KpiCard loading={loading && !k} label="Avg. handle time" value={k && clock(k.avgHandleTime.value)}
          delta={k && signedClock(k.avgHandleTime.delta)} good={k ? k.avgHandleTime.delta <= 0 : null}
          caption={k ? `AI first reply ${k.avgResponseTime}s` : ''}
          tooltip={k ? `Mean time to resolution over 7 days. Average AI response time right now: ${k.avgResponseTime}s.` : ''} />
        <KpiCard gridColumn={{ base: '1 / -1', md: 'auto' }} loading={loading && !k} label="CSAT" value={k?.csat.value.toFixed(1)}
          delta={k && signed(k.csat.delta, 1)} good={k ? k.csat.delta >= 0 : null}
          caption="0 to 10 · resolved cases"
          tooltip="Customer satisfaction on a 0 to 10 scale, from end of conversation sentiment on resolved cases." />
      </Grid>

      <Grid templateColumns={{ base: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))', xl: '559fr 303fr 255fr' }} gap="18px" h={{ base: 'auto', xl: '292px' }} mb="23px">
        <Box h={{ base: '280px', xl: '100%' }} gridColumn={{ lg: '1 / -1', xl: 'auto' }} minW={0}>
          <VolumeChart series={data?.series} loading={loading} />
        </Box>
        <QueueHealth items={data?.queueHealth} loading={loading} activeQueue={filters.queue}
          onSelect={(queue) => { setFilters((f) => ({ ...f, queue: queue || '' })); queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />
        <CriticalSignals signals={data?.signals} loading={loading} onSelect={onSignal} />
      </Grid>

      <Grid templateColumns={{ base: 'minmax(0, 1fr)', xl: '753fr 388fr' }} gap="14px" alignItems="start">
        <Box ref={queueRef} h={{ base: 'auto', xl: '316px' }} minW={0}>
          <PriorityQueue region={region} filters={filters} setFilters={setFilters} />
        </Box>
        <Box h={{ base: 'auto', xl: '375px' }} minW={0}>
          <SupervisorFeed />
        </Box>
      </Grid>
    </Box>
  );
};

export default Dashboard;
