// src/local/simulator.js
// Traffic simulator for the browser data source. Same behaviour as
// backend/services/simulator.js: it advances live conversations with each agent's current
// configuration, opens new ones, resolves quiet ones and records metric snapshots.
import mockLlm from './engine/mockLlm';
import seedData from './engine/seedData';
import risk from './engine/risk';
import { db, hub, oid, agentsById, reassess, present, emitConversation, recordActivity, shortName, LIVE_STATUSES } from './state';
import { captureSnapshot } from './analytics';

const { determineIntent, generateResponse, calculateSentiment } = mockLlm;
const { SCRIPTS, FIRST, LAST, REGIONS, QUEUE_AGENT } = seedData;
const { clamp } = risk;

const TICK_MS = 6000;
const MAX_LIVE = 30;
const FALLBACK_CONFIDENCE = 0.7;

const FOLLOW_UPS = {
  negative: [
    'This is taking far too long.',
    "I've already explained this twice.",
    "That doesn't answer my question.",
    'Can someone actually fix this today?',
    "I'm really disappointed with how this is going."
  ],
  neutral: [
    'Okay, what happens next?',
    'How long will that take?',
    'Can you confirm that by email?',
    'Is there anything I need to do on my side?',
    'Could you check again please?'
  ],
  positive: [
    'Thank you, that helps!',
    'Great, appreciate the quick help.',
    "Perfect, that's exactly what I needed.",
    'Thanks, really helpful.'
  ],
  toSupervisor: [
    'Thanks for stepping in.',
    'Okay, thank you for looking into it personally.',
    'That would be great, how soon will I see it?',
    'Appreciate it. Anything else you need from me?'
  ]
};

const HOLDING = "I've flagged this for a supervisor, who will join shortly. Thanks for your patience.";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let timer = null;
let tickCount = 0;
let spawnSeq = 0;
const lastFallbackAt = new Map();

export const isRunning = () => !!timer;

export function start() {
  if (timer) return;
  timer = setInterval(() => {
    try { tick(); } catch (err) { console.error('[simulator] tick failed:', err.message); }
  }, TICK_MS);
}

export function stop() {
  clearInterval(timer);
  timer = null;
}

function tick() {
  tickCount += 1;
  const live = db.conversations.filter((c) => LIVE_STATUSES.includes(c.status));
  const agents = agentsById();

  if (live.length) {
    const target = pick(live);
    advance(target, agents.get(target.agent?.id));
  }

  if (tickCount % 7 === 0 && live.length < MAX_LIVE) spawn();
  if (tickCount % 8 === 0) resolveOne(live);
  if (tickCount % 10 === 0) captureSnapshot();
}

function advance(conv, agent) {
  const last = conv.messages[conv.messages.length - 1];
  const humanActive = conv.humanIntervention?.active;
  const awaitingSupervisor = conv.status === 'escalated' && !humanActive;

  if (humanActive) {
    // AI is paused; the customer occasionally replies to the supervisor
    if (last && last.sender !== 'customer' && Math.random() < 0.35) addMessage(conv, 'customer', pick(FOLLOW_UPS.toSupervisor), agent);
    return;
  }

  if (last && last.sender === 'customer') {
    if (awaitingSupervisor) {
      if (!conv.messages.some((m) => m.text === HOLDING)) addMessage(conv, 'agent', HOLDING, agent);
      return;
    }
    const intent = determineIntent(last.text);
    const reply = generateResponse(intent, last.text, agent?.parameters, (agent?.knowledgeBases || []).filter((k) => k.enabled).map((k) => k.id));
    addMessage(conv, 'agent', reply, agent, { intent });
  } else {
    const s = conv.metrics?.sentiment ?? 0.5;
    const mood = s < 0.35 ? (Math.random() < 0.7 ? 'negative' : 'neutral') : s > 0.65 ? (Math.random() < 0.6 ? 'positive' : 'neutral') : pick(['negative', 'neutral', 'neutral', 'positive']);
    addMessage(conv, 'customer', pick(FOLLOW_UPS[mood]), agent);
  }
}

function addMessage(conv, sender, text, agent, { intent } = {}) {
  const message = { sender, text, timestamp: new Date() };
  conv.messages.push({ _id: oid(), ...message });

  const metrics = { ...(conv.metrics || {}) };
  if (sender === 'customer') {
    const s = calculateSentiment(text).score;
    metrics.sentiment = Number(clamp((metrics.sentiment ?? 0.5) * 0.65 + s * 0.35, 0.05, 0.98).toFixed(2));
  } else if (sender === 'agent') {
    const p = agent?.parameters || {};
    const kbOn = (agent?.knowledgeBases || []).some((k) => k.enabled);
    const intentBonus = intent && intent !== 'general' ? 0.05 : -0.04;
    const fresh = clamp(0.9 - (p.temperature ?? 0.7) * 0.22 + intentBonus + (kbOn ? 0 : -0.15) + (Math.random() - 0.5) * 0.1, 0.3, 0.99);
    metrics.confidenceScore = Number(((metrics.confidenceScore ?? 0.8) * 0.6 + fresh * 0.4).toFixed(2));
    const tokenFactor = Math.pow((p.max_tokens || 150) / 150, 0.35);
    const latency = (agent?.metrics?.avgResponseTime || 11) * tokenFactor * (0.8 + Math.random() * 0.4);
    metrics.responseTime = Number(((metrics.responseTime ?? latency) * 0.7 + latency * 0.3).toFixed(1));
    trackFallback(conv, agent, fresh);
  }
  conv.metrics = metrics;

  const { risk: assessment, previousLevel, changed } = reassess(conv);

  // Escalation policy: breaching thresholds hands the conversation to the supervisor queue
  if (!conv.humanIntervention?.active && conv.status === 'active' && assessment.alertLevel === 'high' && assessment.breaches.length) {
    conv.status = 'escalated';
  }

  hub.broadcast('message_update', { conversationId: conv.id, message });
  hub.broadcast('metrics_update', { conversationId: conv.id, metrics: conv.metrics });
  emitConversation(conv);

  if (changed && assessment.alertLevel === 'high' && previousLevel !== 'high') {
    const reason = assessment.breaches[0] || assessment.cause || 'Risk above 80';
    recordActivity({ type: 'alert', title: 'Escalation threshold met', detail: `${shortName(conv.customer?.name)} • ${reason}`, severity: 'critical', conversationId: conv.id, agentId: conv.agent?.id });
    hub.broadcast('alert', { data: { conversationId: conv.id, customer: conv.customer?.name, caseNumber: conv.caseNumber, level: 'high', reason } });
  }
}

function trackFallback(conv, agent, confidence) {
  if (!agent) return;
  // A fallback is a reply the model was not confident in (generic or ungrounded answer)
  const fellBack = confidence < FALLBACK_CONFIDENCE;
  const rate = clamp((agent.metrics?.fallbackRate ?? 0.1) * 0.95 + (fellBack ? 0.05 : 0), 0, 1);
  agent.metrics = { ...(agent.metrics || {}), fallbackRate: Number(rate.toFixed(3)) };
  if (fellBack && Date.now() - (lastFallbackAt.get(agent.id) || 0) > 180000) {
    lastFallbackAt.set(agent.id, Date.now());
    recordActivity({ type: 'fallback', title: 'Knowledge fallback', detail: `${agent.name} • policy gap`, severity: 'critical', agentId: agent.id, conversationId: conv.id });
  }
}

function spawn() {
  const queue = pick(Object.keys(QUEUE_AGENT));
  const [issue, turns] = pick(SCRIPTS[queue]);
  const [region, cities] = pick(REGIONS);
  const now = new Date();
  const conv = {
    id: `conv-${Date.now()}`,
    caseNumber: String(84300 + ((Date.now() % 100000) + spawnSeq++) % 9000),
    customer: {
      id: `cust-${1000 + Math.floor(Math.random() * 9000)}`, name: `${pick(FIRST)} ${pick(LAST)}`, tier: Math.random() > 0.85 ? 'VIP' : 'Standard', city: pick(cities),
      locale: 'EN-US', tenureYears: Number((Math.random() * 5).toFixed(1)), lifetimeValue: Math.round(6000 + Math.random() * 80000), orders: 1 + Math.floor(Math.random() * 25),
      returnRate: Number((Math.random() * 0.08).toFixed(3)), contactCount: Math.random() > 0.8 ? 2 : 1
    },
    agent: QUEUE_AGENT[queue], queue, channel: 'Web chat', region, issue,
    refundValue: queue === 'Refund' ? Math.round(800 + Math.random() * 7000) : undefined,
    status: 'active', alertLevel: 'low', alertReasons: [], startTime: now,
    metrics: { sentiment: Number((0.4 + Math.random() * 0.45).toFixed(2)), responseTime: Number((6 + Math.random() * 8).toFixed(1)), confidenceScore: Number((0.72 + Math.random() * 0.25).toFixed(2)) },
    messages: [{ _id: oid(), sender: 'customer', text: turns[0][1], timestamp: now }],
    tags: [queue.toLowerCase(), issue.toLowerCase().replace(/\s+/g, '-')],
    humanIntervention: { occurred: false, active: false },
    createdAt: now, updatedAt: now
  };
  reassess(conv);
  db.conversations.push(conv);
  hub.broadcast('new_conversation', { data: present(conv, { summary: true }) });
}

function resolveOne(live) {
  const candidates = live.filter((conv) => {
    if (conv.humanIntervention?.active || conv.status === 'escalated') return false;
    const { risk: assessment } = reassess(conv);
    const old = Date.now() - new Date(conv.startTime).getTime() > 25 * 60000;
    return (assessment.score < 45 && conv.messages.length >= 3) || (old && assessment.score < 70);
  });
  if (!candidates.length) return;
  const conv = pick(candidates);
  conv.messages.push({ _id: oid(), sender: 'agent', text: 'Glad I could help. Is there anything else I can do for you today?', timestamp: new Date() });
  conv.status = 'resolved';
  conv.endTime = new Date();
  conv.alertLevel = 'low';
  emitConversation(conv);
}
