// src/local/analytics.js
// Dashboard and Control Room numbers, computed from the in-memory collections with the same
// formulas as backend/services/analytics.js.
import risk from './engine/risk';
import { db, hub, presentMany, LIVE_STATUSES } from './state';

const { QUEUE_LABELS } = risk;
const RANGE_MS = { '30m': 30 * 60000, '2h': 2 * 3600000, '24h': 24 * 3600000, '7d': 7 * 86400000 };
const TIME_RANGE_MS = { today: 24 * 3600000, week: 7 * 86400000, month: 30 * 86400000, year: 365 * 86400000 };
const QUEUE_SHORT = { Refund: 'Returns', Delivery: 'Delivery', Product: 'Product', Account: 'Account', Billing: 'Billing', General: 'General' };

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const time = (d) => new Date(d).getTime();
const distinct = (key) => [...new Set(db.conversations.map((c) => c[key]).filter(Boolean))];

export function liveConversations(region) {
  const docs = db.conversations.filter((c) => LIVE_STATUSES.includes(c.status) && (!region || region === 'all' || c.region === region));
  return presentMany(docs, { summary: true });
}

function resolvedSince(since, region, agentId) {
  return db.conversations.filter((c) => c.status === 'resolved' && c.endTime && time(c.endTime) >= since
    && (!region || region === 'all' || c.region === region)
    && (!agentId || c.agent?.id === agentId));
}

function outcomeStats(resolved) {
  const contained = resolved.filter((c) => !c.humanIntervention?.occurred).length;
  const handle = resolved.filter((c) => c.endTime).map((c) => (time(c.endTime) - time(c.startTime)) / 1000);
  return {
    samples: resolved.length,
    containment: resolved.length ? contained / resolved.length : null,
    avgHandleSeconds: handle.length ? avg(handle) : null,
    csat: resolved.length ? avg(resolved.map((c) => (c.metrics?.sentiment ?? 0.8) * 10)) : null
  };
}

function liveKpis(region) {
  const live = liveConversations(region);
  const resolved = resolvedSince(Date.now() - RANGE_MS['7d'], region);
  const stats = outcomeStats(resolved);
  return {
    live,
    activeLoad: live.length,
    slaAtRisk: live.filter((c) => c.risk.score >= 65 || c.risk.slaRemainingSeconds < 300).length,
    containment: stats.containment ?? 0,
    avgHandleSeconds: stats.avgHandleSeconds ?? 0,
    csat: stats.csat ?? 0,
    avgResponseTime: avg(live.map((c) => c.metrics?.responseTime || 0)),
    // Share of the last 7 days' conversations that reached resolution
    resolutionRate: resolved.length / Math.max(1, resolved.length + live.length)
  };
}

export function captureSnapshot() {
  const k = liveKpis();
  const recent = db.snapshots.slice(-6);
  const snapshot = {
    timestamp: new Date(),
    activeLoad: k.activeLoad,
    forecast: recent.length ? Math.round(avg(recent.map((s) => s.activeLoad)) * 1.02) : k.activeLoad,
    slaAtRisk: k.slaAtRisk,
    containment: round(k.containment, 3),
    avgHandleSeconds: Math.round(k.avgHandleSeconds),
    avgResponseTime: round(k.avgResponseTime),
    csat: round(k.csat)
  };
  db.snapshots.push(snapshot);
  const cutoff = Date.now() - 48 * 3600000;
  db.snapshots = db.snapshots.filter((s) => time(s.timestamp) >= cutoff);
  hub.broadcast('analytics_update', { data: { timestamp: snapshot.timestamp } });
  return snapshot;
}

function signalsFor(live, agents) {
  const signals = [];

  // 1. SLA breach cluster: several conversations in one queue about to breach
  const byQueue = {};
  live.forEach((c) => {
    if (c.risk.slaRemainingSeconds < 300 || c.risk.score >= 80) (byQueue[c.queue] = byQueue[c.queue] || []).push(c);
  });
  Object.entries(byQueue)
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 1)
    .forEach(([queue, list]) => signals.push({
      id: `sla-${queue}`, severity: 'critical', title: 'SLA breach cluster',
      detail: `${QUEUE_SHORT[queue] || queue} queue • ${list.length} conversations`,
      target: { type: 'queue', value: queue }
    }));

  // 2. Sentiment anomaly: the region trailing the global mood the most
  const global = avg(live.map((c) => c.metrics?.sentiment ?? 0.5));
  const byRegion = {};
  live.forEach((c) => (byRegion[c.region] = byRegion[c.region] || []).push(c.metrics?.sentiment ?? 0.5));
  const worst = Object.entries(byRegion)
    .filter(([, v]) => v.length >= 2)
    .map(([region, v]) => ({ region, drop: global ? (avg(v) - global) / global : 0 }))
    .sort((a, b) => a.drop - b.drop)[0];
  if (worst && worst.drop <= -0.1) {
    signals.push({
      id: `sentiment-${worst.region}`, severity: 'warning', title: 'Sentiment anomaly',
      detail: `${worst.region} • −${Math.round(Math.abs(worst.drop) * 100)}% vs baseline`,
      target: { type: 'region', value: worst.region }
    });
  }

  // 3. Agent degradation: fallback rate above 20%
  agents
    .filter((a) => (a.metrics?.fallbackRate ?? 0) >= 0.2)
    .sort((a, b) => b.metrics.fallbackRate - a.metrics.fallbackRate)
    .slice(0, 2)
    .forEach((a) => signals.push({
      id: `agent-${a.id}`, severity: 'warning', title: 'Agent degradation',
      detail: `${a.name} ${a.version} • Fallback rate ${Math.round(a.metrics.fallbackRate * 100)}%`,
      target: { type: 'agent', value: a.id }
    }));

  return signals;
}

function queueHealth(live) {
  const groups = {};
  live.forEach((c) => (groups[c.queue] = groups[c.queue] || []).push(c.risk.score));
  return Object.entries(groups)
    .map(([queue, scores]) => {
      // One near-certain breach dominates a queue; the median keeps a single outlier from saturating it
      const sorted = scores.sort((a, b) => b - a);
      const median = sorted[Math.floor(sorted.length / 2)];
      const probability = Math.round(sorted[0] * 0.65 + median * 0.35);
      return {
        queue,
        label: QUEUE_LABELS[queue] || queue,
        probability,
        conversations: scores.length,
        status: probability >= 80 ? 'critical' : probability >= 50 ? 'watch' : 'healthy'
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

function series(range) {
  const windowMs = Math.max(RANGE_MS[range] || RANGE_MS['30m'], 3600000);
  const bucketMs = windowMs > 2 * 3600000 ? 30 * 60000 : 5 * 60000;
  const since = Date.now() - windowMs;
  const buckets = new Map();
  db.snapshots
    .filter((s) => time(s.timestamp) >= since)
    .sort((a, b) => time(a.timestamp) - time(b.timestamp))
    .forEach((s) => {
      const key = Math.floor(time(s.timestamp) / bucketMs) * bucketMs;
      const b = buckets.get(key) || { t: key, live: [], forecast: [], sla: [] };
      b.live.push(s.activeLoad); b.forecast.push(s.forecast ?? s.activeLoad); b.sla.push(s.slaAtRisk);
      buckets.set(key, b);
    });
  return {
    resolutionMinutes: bucketMs / 60000,
    points: [...buckets.values()].map((b) => ({
      t: new Date(b.t),
      live: Math.round(avg(b.live)),
      forecast: Math.round(avg(b.forecast)),
      slaExposure: Math.round(avg(b.sla))
    }))
  };
}

function snapshotAt(ts) {
  const earlier = db.snapshots.filter((s) => time(s.timestamp) <= ts);
  return earlier.length ? earlier.reduce((a, b) => (time(b.timestamp) > time(a.timestamp) ? b : a)) : null;
}

export function dashboard({ range = '30m', region = 'all' } = {}) {
  const k = liveKpis(region);
  const agents = db.agents;
  const allRegions = distinct('region');
  const allQueues = distinct('queue');
  const baseline = snapshotAt(Date.now() - (RANGE_MS[range] || RANGE_MS['30m']));
  const liveTotal = db.conversations.filter((c) => LIVE_STATUSES.includes(c.status)).length;
  const regionShare = region === 'all' ? 1 : k.activeLoad / Math.max(1, liveTotal);
  const baseLoad = baseline ? baseline.activeLoad * regionShare : k.activeLoad;
  const baseSla = baseline ? Math.round(baseline.slaAtRisk * regionShare) : k.slaAtRisk;

  const kpis = {
    activeLoad: { value: k.activeLoad, delta: baseLoad ? round(((k.activeLoad - baseLoad) / baseLoad) * 100) : 0, unit: 'percent' },
    slaAtRisk: { value: k.slaAtRisk, delta: k.slaAtRisk - baseSla, unit: 'count' },
    containment: { value: round(k.containment * 100), delta: baseline ? round((k.containment - baseline.containment) * 100) : 0, unit: 'points' },
    avgHandleTime: { value: Math.round(k.avgHandleSeconds), delta: baseline ? Math.round(k.avgHandleSeconds - baseline.avgHandleSeconds) : 0, unit: 'seconds' },
    csat: { value: round(k.csat), delta: baseline ? round(k.csat - baseline.csat) : 0, unit: 'score' },
    avgResponseTime: round(k.avgResponseTime),
    resolutionRate: round(k.resolutionRate * 100)
  };

  const queue = [...k.live].sort((a, b) => b.risk.score - a.risk.score).map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    customer: c.customer,
    queue: c.queue,
    queueLabel: c.queueLabel,
    agent: c.agent,
    agentVersion: c.agentVersion,
    status: c.status,
    alertLevel: c.alertLevel,
    region: c.region,
    tags: c.tags,
    humanIntervention: c.humanIntervention,
    startTime: c.startTime,
    lastMessage: c.lastMessage,
    risk: { score: c.risk.score, severity: c.risk.severity, action: c.risk.action, waitSeconds: c.risk.waitSeconds, headline: c.risk.headline }
  }));

  return {
    generatedAt: new Date(),
    range,
    region,
    scope: { queues: allQueues.length, regions: allRegions.length, agents: agents.length },
    regions: allRegions.sort(),
    kpis,
    series: series(range),
    queueHealth: queueHealth(k.live),
    signals: signalsFor(k.live, agents),
    queue
  };
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export function overview({ timeRange = 'week' } = {}) {
  const since = Date.now() - (TIME_RANGE_MS[timeRange] || TIME_RANGE_MS.week);
  const docs = db.conversations.filter((c) => time(c.startTime) >= since);
  const escalated = (c) => c.humanIntervention?.occurred || c.status === 'escalated';
  const byDay = {};
  docs.forEach((c) => {
    const d = (byDay[dayKey(c.startTime)] = byDay[dayKey(c.startTime)] || { count: 0, rt: [], s: [], esc: 0 });
    d.count += 1;
    d.rt.push(c.metrics?.responseTime || 0);
    d.s.push(c.metrics?.sentiment ?? 0.5);
    if (escalated(c)) d.esc += 1;
  });
  const days = Object.keys(byDay).sort();
  return {
    activeConversations: docs.filter((c) => LIVE_STATUSES.includes(c.status)).length,
    avgResponseTime: round(avg(docs.map((c) => c.metrics?.responseTime || 0))),
    avgSentiment: round(avg(docs.map((c) => c.metrics?.sentiment ?? 0.5)), 2),
    escalationRate: round(docs.filter(escalated).length / Math.max(1, docs.length), 2),
    trends: {
      conversations: days.map((d) => ({ date: d, count: byDay[d].count })),
      responseTime: days.map((d) => ({ date: d, value: round(avg(byDay[d].rt)) })),
      sentiment: days.map((d) => ({ date: d, value: round(avg(byDay[d].s), 2) })),
      escalations: days.map((d) => ({ date: d, value: round(byDay[d].esc / byDay[d].count, 2) }))
    }
  };
}

export function agentPerformance(agent, range = '7d') {
  const windowMs = RANGE_MS[range] || RANGE_MS['7d'];
  const now = Date.now();
  const current = outcomeStats(resolvedSince(now - windowMs, null, agent.id));
  const previous = outcomeStats(resolvedSince(now - 2 * windowMs, null, agent.id).filter((c) => time(c.endTime) < now - windowMs));
  const stored = agent.metrics || {};
  const storedPrev = agent.metricsPrevious || {};
  const enough = (s) => s.samples >= 5;

  const containment = enough(current) ? current.containment : stored.containment;
  const containmentPrev = enough(previous) ? previous.containment : storedPrev.containment;
  const csat = enough(current) ? current.csat : (stored.satisfaction ?? 0.85) * 10;
  const csatPrev = enough(previous) ? previous.csat : (storedPrev.satisfaction ?? 0.85) * 10;

  const metric = (value, prev, scale = 1, digits = 1) => ({
    value: value == null ? null : round(value * scale, digits),
    delta: value == null || prev == null ? null : round((value - prev) * scale, digits)
  });

  return {
    range,
    samples: current.samples,
    containment: metric(containment, containmentPrev, 100),
    csat: metric(csat, csatPrev, 1),
    fallback: metric(stored.fallbackRate, storedPrev.fallbackRate, 100),
    hallucination: metric(stored.hallucinationRate, storedPrev.hallucinationRate, 100)
  };
}
