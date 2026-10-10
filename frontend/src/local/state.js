// src/local/state.js
// In-memory collections for the browser data source. Mirrors what the API keeps in MongoDB:
// the same seed dataset, the same risk model and the same derived conversation fields.
import seedData from './engine/seedData';
import risk from './engine/risk';

export const SUPERVISOR = { id: 'supervisor-001', name: 'Neha Prasad', short: 'Neha P.' };
export const LIVE_STATUSES = ['active', 'waiting', 'escalated'];

// Template categories and the queue whose conversations they are written for
const CATEGORY_TO_QUEUE = {
  billing: 'Billing',
  transaction: 'Refund',
  returns: 'Refund',
  refund: 'Refund',
  shipping: 'Delivery',
  delivery: 'Delivery',
  account: 'Account',
  engagement: 'Product',
  product: 'Product'
};

export const db = { conversations: [], agents: [], knowledgeBases: [], templates: [], presets: [], activities: [], snapshots: [] };

let sequence = 0;
export const oid = () => `${Date.now().toString(16)}${(sequence++).toString(16).padStart(8, '0')}`;
export const generateId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ---- Real-time fan-out (the WebSocket hub) -------------------------------------------------
const sockets = new Set();
export const hub = {
  add: (socket) => sockets.add(socket),
  remove: (socket) => sockets.delete(socket),
  clientCount: () => sockets.size,
  broadcast(type, payload = {}) {
    const frame = JSON.stringify({ type, ...payload, timestamp: new Date() });
    sockets.forEach((socket) => socket.deliver(frame));
  }
};

// ---- Seed ----------------------------------------------------------------------------------
function conversationDefaults(c, now) {
  return {
    queue: 'General',
    channel: 'Web chat',
    region: 'North America',
    status: 'active',
    alertLevel: 'low',
    alertReasons: [],
    tags: [],
    ...c,
    customer: { tier: 'Standard', locale: 'EN-US', contactCount: 1, ...c.customer },
    humanIntervention: { occurred: false, active: false, ...(c.humanIntervention || {}) },
    messages: (c.messages || []).map((m) => ({ _id: oid(), ...m })),
    createdAt: new Date(now),
    updatedAt: new Date(now)
  };
}

export function seed() {
  const now = Date.now();
  const data = seedData.buildSeed(now);

  // Store alert levels consistent with the risk model so filters work immediately
  const agents = new Map(data.agents.map((a) => [a.id, a]));
  data.conversations.forEach((c) => {
    if (c.status === 'resolved') return;
    const r = risk.assess(c, agents.get(c.agent.id));
    c.alertLevel = r.alertLevel;
    c.alertReasons = r.breaches;
    if (r.alertLevel === 'high' && r.breaches.length && c.status === 'active' && c.tags.includes('escalation-requested')) c.status = 'escalated';
  });

  db.agents = data.agents;
  db.knowledgeBases = data.knowledgeBases;
  db.conversations = data.conversations.map((c) => conversationDefaults(c, now));
  db.templates = data.templates.map((t) => ({ channels: ['Chat'], isShared: false, starred: false, usageCount: 0, variables: [], ...t }));
  db.presets = data.presets.map((p) => ({ createdAt: new Date(now), updatedAt: new Date(now), ...p }));
  db.activities = data.activities.map((a) => ({ _id: oid(), severity: 'info', ...a }));
  db.snapshots = data.snapshots;
}

// ---- Conversation presentation -------------------------------------------------------------
export const agentsById = () => new Map(db.agents.map((a) => [a.id, a]));

export function templateQueues() {
  return new Set(db.templates.map((t) => CATEGORY_TO_QUEUE[String(t.category).toLowerCase()]).filter(Boolean));
}

/** Conversation as the API returns it, enriched with the live risk assessment. */
export function present(conversation, { summary = false } = {}) {
  const conv = { ...conversation };
  const agent = agentsById().get(conv.agent?.id);
  const assessment = risk.assess(conv, agent, { templateCategories: templateQueues() });
  const messages = conv.messages || [];
  const out = {
    ...conv,
    queueLabel: risk.QUEUE_LABELS[conv.queue] || conv.queue,
    agentVersion: agent?.version,
    sentimentScore: risk.toSignedSentiment(conv.metrics?.sentiment),
    messageCount: messages.length,
    lastMessage: messages[messages.length - 1] || null,
    risk: assessment
  };
  if (summary) delete out.messages;
  return out;
}

export const presentMany = (conversations, opts) => conversations.map((c) => present(c, opts));

/** Re-score a conversation in place. */
export function reassess(conv) {
  const assessment = risk.assess(conv, agentsById().get(conv.agent?.id), { templateCategories: templateQueues() });
  const previousLevel = conv.alertLevel;
  conv.alertLevel = assessment.alertLevel;
  conv.alertReasons = assessment.breaches;
  conv.updatedAt = new Date();
  return { risk: assessment, previousLevel, changed: previousLevel !== assessment.alertLevel };
}

export function recordActivity(entry) {
  const activity = { _id: oid(), severity: 'info', timestamp: new Date(), ...entry };
  db.activities.push(activity);
  hub.broadcast('activity', { data: activity });
  return activity;
}

export function emitConversation(conv) {
  const data = present(conv, { summary: true });
  hub.broadcast('conversation_updated', { data });
  return data;
}

export function shortName(fullName = '') {
  const [first, last] = fullName.split(' ');
  return last ? `${first} ${last[0]}.` : first;
}

export const findConversation = (id) => db.conversations.find((c) => c.id === id);
export const findAgent = (id) => db.agents.find((a) => a.id === id);
