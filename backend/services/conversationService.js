// services/conversationService.js
// Shared helpers for turning stored conversations into what supervisors see, and for
// keeping alert levels, the activity feed and WebSocket clients in sync after any change.
const Agent = require('../models/agent');
const Activity = require('../models/activity');
const ResponseTemplate = require('../models/responseTemplate');
const { assess, QUEUE_LABELS, toSignedSentiment } = require('../utils/risk');
const hub = require('../websocket/hub');

const SUPERVISOR = { id: 'supervisor-001', name: 'Neha Prasad', short: 'Neha P.' };

// Template categories → the queue whose conversations they are written for
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

let agentCache = { at: 0, map: new Map() };
let templateQueueCache = { at: 0, set: new Set() };

async function agentsById() {
  if (Date.now() - agentCache.at < 5000) return agentCache.map;
  const agents = await Agent.find().lean();
  agentCache = { at: Date.now(), map: new Map(agents.map((a) => [a.id, a])) };
  return agentCache.map;
}

function invalidateAgents() {
  agentCache.at = 0;
}

async function templateQueues() {
  if (Date.now() - templateQueueCache.at < 10000) return templateQueueCache.set;
  const categories = await ResponseTemplate.distinct('category');
  const set = new Set(categories.map((c) => CATEGORY_TO_QUEUE[String(c).toLowerCase()]).filter(Boolean));
  templateQueueCache = { at: Date.now(), set };
  return set;
}

function invalidateTemplates() {
  templateQueueCache.at = 0;
}

/**
 * Plain object for API responses / broadcasts, enriched with the live risk assessment.
 * The API contract fields (id, customer, agent, status, alertLevel, startTime, metrics,
 * messages, tags, humanIntervention) are untouched; extra fields are additive.
 */
async function present(conversation, { summary = false } = {}) {
  const conv = typeof conversation.toObject === 'function' ? conversation.toObject() : { ...conversation };
  const agents = await agentsById();
  const agent = agents.get(conv.agent?.id);
  const risk = assess(conv, agent, { templateCategories: await templateQueues() });
  const messages = conv.messages || [];
  const lastMessage = messages[messages.length - 1] || null;

  const out = {
    ...conv,
    queueLabel: QUEUE_LABELS[conv.queue] || conv.queue,
    agentVersion: agent?.version,
    sentimentScore: toSignedSentiment(conv.metrics?.sentiment),
    messageCount: messages.length,
    lastMessage,
    risk
  };
  delete out._id;
  delete out.__v;
  if (summary) delete out.messages;
  return out;
}

async function presentMany(conversations, opts) {
  return Promise.all(conversations.map((c) => present(c, opts)));
}

/**
 * Re-score a conversation document in place (does not save).
 * @returns {{ risk, previousLevel, changed }}
 */
async function reassess(doc) {
  const agents = await agentsById();
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const risk = assess(plain, agents.get(plain.agent?.id), { templateCategories: await templateQueues() });
  const previousLevel = doc.alertLevel;
  doc.alertLevel = risk.alertLevel;
  doc.alertReasons = risk.breaches;
  return { risk, previousLevel, changed: previousLevel !== risk.alertLevel };
}

async function recordActivity(entry) {
  const activity = await Activity.create({ timestamp: new Date(), ...entry });
  const data = activity.toObject();
  delete data.__v;
  hub.broadcast('activity', { data }, { channel: 'activity' });
  return data;
}

async function emitConversation(doc) {
  const data = await present(doc, { summary: true });
  hub.broadcast('conversation_updated', { data }, { channel: 'conversations', agentId: data.agent?.id });
  return data;
}

function shortName(fullName = '') {
  const [first, last] = fullName.split(' ');
  return last ? `${first} ${last[0]}.` : first;
}

module.exports = {
  SUPERVISOR,
  agentsById,
  invalidateAgents,
  templateQueues,
  invalidateTemplates,
  present,
  presentMany,
  reassess,
  recordActivity,
  emitConversation,
  shortName
};
