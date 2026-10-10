// services/analytics.js
// Every number on the dashboard is computed here from conversations, agents and metric
// snapshots — nothing on the monitoring screens is hard-coded.
const Conversation = require('../models/conversation');
const Agent = require('../models/agent');
const MetricSnapshot = require('../models/metricSnapshot');
const svc = require('./conversationService');
const hub = require('../websocket/hub');
const { QUEUE_LABELS, toSignedSentiment } = require('../utils/risk');

const LIVE_STATUSES = ['active', 'waiting', 'escalated'];
const RANGE_MS = { '30m': 30 * 60000, '2h': 2 * 3600000, '24h': 24 * 3600000, '7d': 7 * 86400000 };
const TIME_RANGE_MS = { today: 24 * 3600000, week: 7 * 86400000, month: 30 * 86400000, year: 365 * 86400000 };
const QUEUE_SHORT = { Refund: 'Returns', Delivery: 'Delivery', Product: 'Product', Account: 'Account', Billing: 'Billing', General: 'General' };

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

async function liveConversations(region) {
  const filter = { status: { $in: LIVE_STATUSES } };
  if (region && region !== 'all') filter.region = region;
  const docs = await Conversation.find(filter).lean();
  return svc.presentMany(docs, { summary: true });
}

async function resolvedSince(since, region, agentId) {
  const filter = { status: 'resolved', endTime: { $gte: new Date(since) } };
  if (region && region !== 'all') filter.region = region;
  if (agentId) filter['agent.id'] = agentId;
  return Conversation.find(filter, { messages: 0 }).lean();
}

function outcomeStats(resolved) {
  const contained = resolved.filter((c) => !c.humanIntervention?.occurred).length;
  const handle = resolved.filter((c) => c.endTime).map((c) => (new Date(c.endTime) - new Date(c.startTime)) / 1000);
  return {
    samples: resolved.length,
    containment: resolved.length ? contained / resolved.length : null,
    avgHandleSeconds: handle.length ? avg(handle) : null,
    csat: resolved.length ? avg(resolved.map((c) => (c.metrics?.sentiment ?? 0.8) * 10)) : null
  };
}

async function liveKpis(region) {
  const live = await liveConversations(region);
  const resolved = await resolvedSince(Date.now() - RANGE_MS['7d'], region);
  const stats = outcomeStats(resolved);
  const slaAtRisk = live.filter((c) => c.risk.score >= 65 || c.risk.slaRemainingSeconds < 300).length;
  return {
    live,
    resolved,
    activeLoad: live.length,
    slaAtRisk,
    containment: stats.containment ?? 0,
    avgHandleSeconds: stats.avgHandleSeconds ?? 0,
    csat: stats.csat ?? 0,
    avgResponseTime: avg(live.map((c) => c.metrics?.responseTime || 0)),
    // Share of the last 7 days' conversations that reached resolution
    resolutionRate: resolved.length / Math.max(1, resolved.length + live.length)
  };
}

async function captureSnapshot() {
  const k = await liveKpis();
  const recent = await MetricSnapshot.find().sort({ timestamp: -1 }).limit(6).lean();
  const forecast = recent.length ? Math.round(avg(recent.map((s) => s.activeLoad)) * 1.02) : k.activeLoad;
  const snapshot = await MetricSnapshot.create({
    timestamp: new Date(),
    activeLoad: k.activeLoad,
    forecast,
    slaAtRisk: k.slaAtRisk,
    containment: round(k.containment, 3),
    avgHandleSeconds: Math.round(k.avgHandleSeconds),
    avgResponseTime: round(k.avgResponseTime),
    csat: round(k.csat)
  });
  await MetricSnapshot.deleteMany({ timestamp: { $lt: new Date(Date.now() - 48 * 3600000) } });
  hub.broadcast('analytics_update', { data: { timestamp: snapshot.timestamp } }, { channel: 'analytics' });
  return snapshot;
}

function signalsFor(live, agents) {
  const signals = [];

  // 1. SLA breach cluster — several conversations in one queue about to breach
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

  // 2. Sentiment anomaly — the region trailing the global mood the most
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

  // 3. Agent degradation — fallback rate above 20%
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

async function series(range) {
  const windowMs = Math.max(RANGE_MS[range] || RANGE_MS['30m'], 3600000);
  const bucketMs = windowMs > 2 * 3600000 ? 30 * 60000 : 5 * 60000;
  const snaps = await MetricSnapshot.find({ timestamp: { $gte: new Date(Date.now() - windowMs) } }).sort({ timestamp: 1 }).lean();
  const buckets = new Map();
  snaps.forEach((s) => {
    const key = Math.floor(new Date(s.timestamp).getTime() / bucketMs) * bucketMs;
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

async function snapshotAt(ts) {
  return MetricSnapshot.findOne({ timestamp: { $lte: new Date(ts) } }).sort({ timestamp: -1 }).lean()
    || MetricSnapshot.findOne().sort({ timestamp: 1 }).lean();
}

async function dashboard({ range = '30m', region = 'all' } = {}) {
  const [k, agents, allRegions, allQueues] = await Promise.all([
    liveKpis(region),
    Agent.find().lean(),
    Conversation.distinct('region'),
    Conversation.distinct('queue')
  ]);
  const baseline = await snapshotAt(Date.now() - (RANGE_MS[range] || RANGE_MS['30m']));
  const regionShare = region === 'all' ? 1 : k.activeLoad / Math.max(1, (await Conversation.countDocuments({ status: { $in: LIVE_STATUSES } })));
  const baseLoad = baseline ? baseline.activeLoad * regionShare : k.activeLoad;
  const baseSla = baseline ? Math.round(baseline.slaAtRisk * regionShare) : k.slaAtRisk;

  const kpis = {
    activeLoad: { value: k.activeLoad, delta: baseLoad ? round(((k.activeLoad - baseLoad) / baseLoad) * 100) : 0, unit: 'percent' },
    slaAtRisk: { value: k.slaAtRisk, delta: k.slaAtRisk - baseSla, unit: 'count' },
    containment: { value: round(k.containment * 100), delta: baseline ? round((k.containment - baseline.containment) * 100) : 0, unit: 'points' },
    avgHandleTime: { value: Math.round(k.avgHandleSeconds), delta: baseline ? Math.round(k.avgHandleSeconds - baseline.avgHandleSeconds) : 0, unit: 'seconds' },
    csat: { value: round(k.csat), delta: baseline ? round(k.csat - baseline.csat) : 0, unit: 'score' },
    // Required metrics that the design folds into tooltips
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
    series: await series(range),
    queueHealth: queueHealth(k.live),
    signals: signalsFor(k.live, agents),
    queue
  };
}

// ---- API-contract analytics (docs: /api/analytics/overview|agents|issues) -----------------

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function overview({ timeRange = 'week' } = {}) {
  const since = Date.now() - (TIME_RANGE_MS[timeRange] || TIME_RANGE_MS.week);
  const docs = await Conversation.find({ startTime: { $gte: new Date(since) } }, { messages: 0 }).lean();
  const live = docs.filter((c) => LIVE_STATUSES.includes(c.status));
  const byDay = {};
  docs.forEach((c) => {
    const k = dayKey(c.startTime);
    const d = (byDay[k] = byDay[k] || { count: 0, rt: [], s: [], esc: 0 });
    d.count += 1;
    d.rt.push(c.metrics?.responseTime || 0);
    d.s.push(c.metrics?.sentiment ?? 0.5);
    if (c.humanIntervention?.occurred || c.status === 'escalated') d.esc += 1;
  });
  const days = Object.keys(byDay).sort();
  return {
    activeConversations: live.length,
    avgResponseTime: round(avg(docs.map((c) => c.metrics?.responseTime || 0))),
    avgSentiment: round(avg(docs.map((c) => c.metrics?.sentiment ?? 0.5)), 2),
    escalationRate: round(docs.filter((c) => c.humanIntervention?.occurred || c.status === 'escalated').length / Math.max(1, docs.length), 2),
    trends: {
      conversations: days.map((d) => ({ date: d, count: byDay[d].count })),
      responseTime: days.map((d) => ({ date: d, value: round(avg(byDay[d].rt)) })),
      sentiment: days.map((d) => ({ date: d, value: round(avg(byDay[d].s), 2) })),
      escalations: days.map((d) => ({ date: d, value: round(byDay[d].esc / byDay[d].count, 2) }))
    }
  };
}

async function agentsAnalytics({ timeRange = 'week', agentId } = {}) {
  const since = Date.now() - (TIME_RANGE_MS[timeRange] || TIME_RANGE_MS.week);
  const agents = await Agent.find(agentId ? { id: agentId } : {}).lean();
  const docs = await Conversation.find({ startTime: { $gte: new Date(since) }, ...(agentId ? { 'agent.id': agentId } : {}) }, { messages: 0 }).lean();
  const trendsConv = {};
  const trendsRt = {};
  docs.forEach((c) => {
    const k = dayKey(c.startTime);
    (trendsConv[k] = trendsConv[k] || { date: k })[c.agent.id] = (trendsConv[k][c.agent.id] || 0) + 1;
    const r = (trendsRt[k] = trendsRt[k] || { date: k, _n: {} });
    r._n[c.agent.id] = (r._n[c.agent.id] || []).concat(c.metrics?.responseTime || 0);
  });
  return {
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      conversations: a.metrics?.conversations,
      avgResponseTime: a.metrics?.avgResponseTime,
      satisfaction: a.metrics?.satisfaction,
      escalationRate: a.metrics?.escalationRate,
      topIssues: a.metrics?.topIssues || []
    })),
    trends: {
      conversations: Object.values(trendsConv).sort((a, b) => a.date.localeCompare(b.date)),
      responseTime: Object.values(trendsRt).sort((a, b) => a.date.localeCompare(b.date)).map(({ date, _n }) => ({
        date, ...Object.fromEntries(Object.entries(_n).map(([id, v]) => [id, round(avg(v))]))
      }))
    }
  };
}

async function issues({ timeRange = 'week' } = {}) {
  const since = Date.now() - (TIME_RANGE_MS[timeRange] || TIME_RANGE_MS.week);
  const docs = await Conversation.find({ startTime: { $gte: new Date(since) } }, { messages: 0 }).lean();
  const counts = {};
  const categories = {};
  docs.forEach((c) => {
    const issue = c.issue || 'Other';
    counts[issue] = (counts[issue] || 0) + 1;
    const cat = (categories[c.queue] = categories[c.queue] || { count: 0, issues: {} });
    cat.count += 1;
    cat.issues[issue] = (cat.issues[issue] || 0) + 1;
  });
  const total = Math.max(1, docs.length);
  return {
    topIssues: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count, percentage: round((count / total) * 100) })),
    categories: Object.fromEntries(Object.entries(categories).map(([queue, v]) => [queue.toLowerCase(), {
      label: QUEUE_LABELS[queue] || queue,
      count: v.count,
      percentage: round((v.count / total) * 100),
      issues: Object.entries(v.issues).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
    }]))
  };
}

// ---- Control Room performance --------------------------------------------------------------

async function agentPerformance(agent, range = '7d') {
  const windowMs = RANGE_MS[range] || RANGE_MS['7d'];
  const now = Date.now();
  const current = outcomeStats(await resolvedSince(now - windowMs, null, agent.id));
  const previousDocs = (await resolvedSince(now - 2 * windowMs, null, agent.id))
    .filter((c) => new Date(c.endTime).getTime() < now - windowMs);
  const previous = outcomeStats(previousDocs);
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

module.exports = {
  captureSnapshot,
  dashboard,
  overview,
  agentsAnalytics,
  issues,
  agentPerformance,
  liveConversations,
  toSignedSentiment
};
