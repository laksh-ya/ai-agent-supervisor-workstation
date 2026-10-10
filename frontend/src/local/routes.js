// src/local/routes.js
// The REST surface of backend/routes, answered from the in-memory collections.
// Each handler returns the same body and status code as its Express counterpart.
import mockLlm from './engine/mockLlm';
import copilot from './engine/copilot';
import evaluation from './engine/evaluation';
import templateUtils from './engine/templateUtils';
import {
  db, hub, oid, generateId, seed, SUPERVISOR, agentsById, present, presentMany, reassess, recordActivity,
  emitConversation, shortName, findConversation, findAgent
} from './state';
import * as analytics from './analytics';
import * as simulator from './simulator';

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.body = { message, ...extra };
  }
}

const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };
const reply = (data, status = 200, delay = 60) => ({ status, data, delay });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const time = (d) => (d ? new Date(d).getTime() : 0);
const list = (value) => String(value).split(',');
const matches = (rx, ...values) => values.flat().some((v) => v !== undefined && v !== null && rx.test(String(v)));

function conversationOr404(id) {
  return findConversation(id) || fail(404, 'Conversation not found');
}

function agentOr404(id) {
  return findAgent(id) || fail(404, 'Agent not found');
}

// ---- Conversations -------------------------------------------------------------------------
function listConversations(query) {
  const { page = 1, limit = 10, status, alertLevel, agentId, q, queue, region, sort = 'recent', view } = query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 10));
  const rx = q ? new RegExp(escapeRegex(String(q).trim().replace(/^#/, '')), 'i') : null;

  const docs = db.conversations.filter((c) => (!status || list(status).includes(c.status))
    && (!alertLevel || list(alertLevel).includes(c.alertLevel))
    && (!agentId || c.agent?.id === agentId)
    && (!queue || c.queue === queue)
    && (!region || c.region === region)
    && (!rx || matches(rx, c.customer?.name, c.caseNumber, c.tags, c.issue, c.id)));

  const presented = presentMany(docs, { summary: view === 'summary' });
  if (sort === 'risk') presented.sort((a, b) => b.risk.score - a.risk.score);
  else presented.sort((a, b) => time(b.startTime) - time(a.startTime));

  return reply({
    data: presented.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    pagination: { total: docs.length, page: pageNum, pages: Math.ceil(docs.length / limitNum), limit: limitNum }
  }, 200, 150);
}

function copilotDecision(id, { decision, actionLabel } = {}) {
  if (!['approve', 'escalate'].includes(decision)) fail(400, 'decision must be approve or escalate');
  const conversation = conversationOr404(id);
  const tag = decision === 'approve' ? 'override-approved' : 'policy-escalated';
  conversation.tags = [...new Set([...(conversation.tags || []), tag])];
  if (decision === 'escalate' && conversation.status !== 'resolved') conversation.status = 'escalated';
  reassess(conversation);
  emitConversation(conversation);
  recordActivity({
    type: decision === 'approve' ? 'override' : 'escalation',
    title: decision === 'approve' ? (actionLabel || 'Override approved') : 'Policy escalated',
    detail: `${shortName(conversation.customer?.name)} • by ${SUPERVISOR.short}`,
    severity: decision === 'approve' ? 'info' : 'critical',
    conversationId: conversation.id,
    agentId: conversation.agent?.id,
    actor: SUPERVISOR.id
  });
  return reply({ message: 'Decision recorded', tags: conversation.tags });
}

function addMessage(id, { sender, text, templateId } = {}) {
  if (!sender || !text || !String(text).trim()) fail(400, 'Sender and text are required');
  if (!['customer', 'agent', 'supervisor', 'system'].includes(sender)) fail(400, 'Invalid sender');
  const conversation = conversationOr404(id);

  const message = { sender, text: String(text).trim(), timestamp: new Date() };
  if (templateId) message.templateId = templateId;
  conversation.messages.push({ _id: oid(), ...message });

  if (sender === 'customer') {
    const s = mockLlm.calculateSentiment(message.text).score;
    const prev = conversation.metrics?.sentiment ?? 0.5;
    conversation.metrics = { ...conversation.metrics, sentiment: Number(Math.max(0.05, Math.min(0.98, prev * 0.65 + s * 0.35)).toFixed(2)) };
  }
  // A supervisor reply re-opens a conversation that had been marked resolved
  if (sender === 'supervisor' && conversation.status === 'resolved') {
    conversation.status = conversation.humanIntervention?.active ? 'escalated' : 'active';
    conversation.endTime = undefined;
  }

  reassess(conversation);
  hub.broadcast('message_update', { conversationId: conversation.id, message });
  emitConversation(conversation);

  if (templateId) {
    const template = db.templates.find((t) => t.id === templateId);
    if (template) {
      template.usageCount = (template.usageCount || 0) + 1;
      template.lastUsedAt = new Date();
      recordActivity({ type: 'template', title: 'Template inserted', detail: `${template.name} • ${shortName(conversation.customer?.name)}`, conversationId: conversation.id, actor: SUPERVISOR.id });
      hub.broadcast('template_updated', { data: { id: template.id, usageCount: template.usageCount, lastUsedAt: template.lastUsedAt } });
    }
  }
  return reply(message, 201);
}

function updateStatus(id, { status } = {}) {
  const allowed = ['active', 'waiting', 'resolved', 'escalated'];
  if (!status) fail(400, 'Status is required');
  if (!allowed.includes(status)) fail(400, `Status must be one of: ${allowed.join(', ')}`);
  const conversation = conversationOr404(id);

  const previous = conversation.status;
  conversation.status = status;
  if (status === 'resolved') {
    conversation.endTime = new Date();
    // Resolving closes any open takeover
    if (conversation.humanIntervention?.active) {
      conversation.humanIntervention = { ...conversation.humanIntervention, active: false, releasedAt: new Date() };
    }
  } else if (previous === 'resolved') {
    conversation.endTime = undefined;
  }

  reassess(conversation);
  emitConversation(conversation);

  if (status === 'resolved' && previous !== 'resolved') {
    recordActivity({ type: 'resolved', title: 'Case resolved', detail: `${shortName(conversation.customer?.name)} • by ${SUPERVISOR.short}`, conversationId: conversation.id, actor: SUPERVISOR.id });
  } else if (status === 'escalated' && previous !== 'escalated') {
    recordActivity({ type: 'escalation', title: 'Policy escalated', detail: `${shortName(conversation.customer?.name)} • to Ops Governance`, severity: 'critical', conversationId: conversation.id, actor: SUPERVISOR.id });
  }
  return reply({ message: 'Status updated', status });
}

function addTags(id, { tags } = {}) {
  if (!tags || !Array.isArray(tags)) fail(400, 'Tags array is required');
  const conversation = conversationOr404(id);
  const cleaned = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  conversation.tags = [...new Set([...(conversation.tags || []), ...cleaned])];
  emitConversation(conversation);
  return reply({ message: 'Tags added', tags: conversation.tags });
}

function saveFeedback(id, { notes = '', rating } = {}) {
  const conversation = conversationOr404(id);
  const hadNotes = !!conversation.feedback?.notes;
  conversation.feedback = {
    notes: String(notes).slice(0, 4000),
    rating: rating === undefined ? conversation.feedback?.rating : rating,
    updatedAt: new Date()
  };
  if (!hadNotes && conversation.feedback.notes.trim()) {
    recordActivity({ type: 'qa', title: 'Agent feedback logged', detail: `${conversation.agent?.name} • ${shortName(conversation.customer?.name)}`, conversationId: conversation.id, agentId: conversation.agent?.id, actor: SUPERVISOR.id });
  }
  hub.broadcast('feedback_updated', { conversationId: conversation.id, feedback: conversation.feedback });
  return reply({ message: 'Feedback saved', feedback: conversation.feedback });
}

// ---- Intervention --------------------------------------------------------------------------
function takeOver({ conversationId, supervisorId, notes } = {}) {
  if (!conversationId || !supervisorId) fail(400, 'Conversation ID and supervisor ID are required');
  const conversation = conversationOr404(conversationId);

  const alreadyActive = conversation.humanIntervention?.active;
  conversation.humanIntervention = { occurred: true, active: true, supervisorId, timestamp: new Date(), notes: notes || '' };
  // "escalated" means a human owns the conversation; the AI stops replying
  conversation.status = 'escalated';
  conversation.endTime = undefined;
  if (!alreadyActive) {
    conversation.messages.push({ _id: oid(), sender: 'system', text: `${SUPERVISOR.name} took over from ${conversation.agent?.name || 'the AI agent'}`, timestamp: new Date() });
  }

  reassess(conversation);
  emitConversation(conversation);
  if (!alreadyActive) {
    recordActivity({
      type: 'takeover', title: 'Takeover approved', severity: 'critical',
      detail: `${shortName(conversation.customer?.name)} • by ${SUPERVISOR.short}`,
      conversationId, agentId: conversation.agent?.id, actor: supervisorId
    });
  }
  return reply({ message: 'Intervention recorded', intervention: conversation.humanIntervention }, 200, 200);
}

function release({ conversationId, supervisorNotes } = {}) {
  if (!conversationId) fail(400, 'Conversation ID is required');
  const conversation = conversationOr404(conversationId);
  // Only an active takeover can be released, so a repeated release never appends a second handoff note
  if (!conversation.humanIntervention?.active) {
    if (!conversation.humanIntervention?.occurred) fail(400, 'No active intervention to release');
    fail(409, 'Control has already been returned to the AI agent');
  }

  conversation.humanIntervention = { ...conversation.humanIntervention, active: false, releasedAt: new Date() };
  conversation.status = 'active';
  if (supervisorNotes) conversation.supervisorNotes = supervisorNotes;
  conversation.messages.push({
    _id: oid(),
    sender: 'system',
    text: supervisorNotes
      ? `Control returned to ${conversation.agent?.name || 'AI agent'} with guidance: “${supervisorNotes}”`
      : `Control returned to ${conversation.agent?.name || 'AI agent'}`,
    timestamp: new Date()
  });

  reassess(conversation);
  emitConversation(conversation);
  recordActivity({
    type: 'release', title: 'Returned to AI',
    detail: `${shortName(conversation.customer?.name)} • ${conversation.agent?.name || 'agent'} resumed`,
    conversationId, agentId: conversation.agent?.id, actor: SUPERVISOR.id
  });
  return reply({ message: 'Intervention released, control returned to agent' }, 200, 200);
}

// ---- Agents --------------------------------------------------------------------------------
const RANGES = {
  temperature: [0, 1],
  top_p: [0, 1],
  empathy: [0, 1],
  max_tokens: [16, 4000],
  lowConfidence: [0, 1],
  negativeSentiment: [0, 1],
  responseTime: [5, 3600],
  refundValue: [0, 10000000]
};

function validateConfig({ parameters, escalationThresholds, capabilities, knowledgeBases }) {
  const errors = [];
  const check = (group, obj) => Object.entries(obj || {}).forEach(([key, value]) => {
    if (!RANGES[key]) return;
    const n = Number(value);
    const [min, max] = RANGES[key];
    if (!Number.isFinite(n) || n < min || n > max) errors.push(`${group}.${key} must be between ${min} and ${max}`);
  });
  check('parameters', parameters);
  check('escalationThresholds', escalationThresholds);
  [['capabilities', capabilities], ['knowledgeBases', knowledgeBases]].forEach(([name, items]) => {
    if (items !== undefined && (!Array.isArray(items) || items.some((i) => !i || typeof i.id !== 'string'))) {
      errors.push(`${name} must be an array of { id, enabled }`);
    }
  });
  return errors;
}

function configOf(agent) {
  return {
    version: agent.version,
    parameters: agent.parameters,
    capabilities: (agent.capabilities || []).map(({ id, enabled }) => ({ id, enabled })),
    knowledgeBases: (agent.knowledgeBases || []).map(({ id, enabled }) => ({ id, enabled })),
    escalationThresholds: agent.escalationThresholds
  };
}

function bumpVersion(version = 'v1.0') {
  const m = /^v(\d+)\.(\d+)$/.exec(version);
  return m ? `v${m[1]}.${Number(m[2]) + 1}` : `${version}.1`;
}

function updateAgentConfig(id, body = {}) {
  const { parameters, capabilities, knowledgeBases, escalationThresholds, changeRequest } = body;
  const errors = validateConfig(body);
  if (errors.length) fail(400, 'Invalid configuration', { errors });
  const agent = agentOr404(id);

  const before = JSON.parse(JSON.stringify(configOf(agent)));
  const changed = [];

  if (parameters) {
    Object.entries(parameters).forEach(([k, v]) => {
      if (RANGES[k] && Number(agent.parameters?.[k]) !== Number(v)) changed.push(`parameters.${k}`);
    });
    agent.parameters = { ...agent.parameters, ...parameters };
  }
  const toggle = (group, items) => (items || []).forEach((item) => {
    const existing = (agent[group] || []).find((x) => x.id === item.id);
    if (existing && existing.enabled !== !!item.enabled) {
      existing.enabled = !!item.enabled;
      changed.push(`${group}.${item.id}`);
    }
  });
  toggle('capabilities', capabilities);
  toggle('knowledgeBases', knowledgeBases);
  if (escalationThresholds) {
    Object.entries(escalationThresholds).forEach(([k, v]) => {
      if (RANGES[k] && Number(agent.escalationThresholds?.[k]) !== Number(v)) changed.push(`escalationThresholds.${k}`);
    });
    agent.escalationThresholds = { ...agent.escalationThresholds, ...escalationThresholds };
  }

  let deployment = null;
  if (changeRequest && changed.length) {
    agent.changeRequestSeq = (agent.changeRequestSeq || 1841) + 1;
    const oldVersion = agent.version;
    const newVersion = bumpVersion(oldVersion);
    agent.previous = before;
    agent.version = newVersion;
    agent.routing = (agent.routing || []).map((row) => (
      row.model === oldVersion ? { ...row, model: newVersion, failover: row.failover === 'Human' ? 'Human' : oldVersion } : row
    ));
    deployment = {
      id: `CR-${agent.changeRequestSeq}`,
      fieldsChanged: changed,
      notes: changeRequest.notes || '',
      from: oldVersion,
      to: newVersion,
      owner: SUPERVISOR.name,
      deployedAt: new Date()
    };
  }

  hub.broadcast('agent_update', { agentId: agent.id, data: agent });
  if (deployment) {
    recordActivity({
      type: 'deploy', title: 'Agent version routed',
      detail: `${agent.name} ${deployment.to} • ${deployment.id} • ${changed.length} field${changed.length === 1 ? '' : 's'}`,
      agentId: agent.id, actor: SUPERVISOR.id
    });
  }
  return reply({ message: 'Agent configuration updated', agent, changed, deployment }, 200, 200);
}

function evaluateAgent(id, body = {}) {
  const agent = agentOr404(id);
  const result = evaluation.runSuite({ ...configOf(agent), ...(body.config || {}) }, db.knowledgeBases);
  if (!body.config) agent.evaluation = result;
  return reply(result, 200, 900);
}

function storedEvaluation(id) {
  const agent = agentOr404(id);
  if (agent.evaluation?.results?.length) return reply(agent.evaluation);
  return reply(evaluation.runSuite(configOf(agent), db.knowledgeBases));
}

function simulateAgent(id, { index = 17, config, compare = false, currency } = {}) {
  const agent = agentOr404(id);
  const current = { ...configOf(agent), ...(config || {}) };
  const result = { current: evaluation.simulate(current, index, { versionLabel: agent.version, currency }) };
  if (compare && agent.previous) {
    const prev = {
      ...configOf(agent),
      ...agent.previous,
      parameters: { ...agent.parameters, ...(agent.previous.parameters || {}) },
      escalationThresholds: { ...agent.escalationThresholds, ...(agent.previous.escalationThresholds || {}) }
    };
    result.previous = evaluation.simulate(prev, index, { versionLabel: agent.previous.version, currency });
  }
  return reply(result, 200, 500);
}

// ---- Presets -------------------------------------------------------------------------------
function createPreset({ name, description, sourceAgentId, config } = {}) {
  if (!name || !String(name).trim()) fail(400, 'name is required');
  if (!config || typeof config !== 'object') fail(400, 'config is required');
  if (db.presets.some((p) => p.name === String(name).trim())) fail(409, 'A preset with this name already exists');
  const preset = {
    id: generateId('preset'),
    name: String(name).trim(),
    description,
    sourceAgentId,
    createdBy: SUPERVISOR.id,
    config: {
      parameters: config.parameters,
      capabilities: (config.capabilities || []).map(({ id, enabled }) => ({ id, enabled })),
      knowledgeBases: (config.knowledgeBases || []).map(({ id, enabled }) => ({ id, enabled })),
      escalationThresholds: config.escalationThresholds
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
  db.presets.push(preset);
  hub.broadcast('preset_created', { data: preset });
  return reply(preset, 201);
}

function deletePreset(id) {
  const index = db.presets.findIndex((p) => p.id === id);
  if (index < 0) fail(404, 'Preset not found');
  db.presets.splice(index, 1);
  hub.broadcast('preset_deleted', { data: { id } });
  return reply({ message: 'Preset deleted' });
}

// ---- Templates -----------------------------------------------------------------------------
const EDITABLE = ['name', 'description', 'category', 'channels', 'content', 'variables', 'ctaLabel', 'isShared', 'starred'];

// Strip anything that is not simple formatting. Templates are rendered as HTML in previews.
function sanitize(html = '') {
  return String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function listTemplates({ shared, q, category, channel, scope, sort = 'usage' } = {}) {
  const rx = q ? new RegExp(escapeRegex(String(q)), 'i') : null;
  const recentSince = Date.now() - 14 * 86400000;
  const name = (a, b) => String(a.name).localeCompare(String(b.name));
  const order = {
    usage: (a, b) => (b.usageCount || 0) - (a.usageCount || 0) || name(a, b),
    recent: (a, b) => time(b.lastUsedAt) - time(a.lastUsedAt) || time(b.updatedAt) - time(a.updatedAt),
    updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
    name
  }[sort] || ((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

  return reply(db.templates
    .filter((t) => (shared !== 'true' && shared !== 'false' ? true : t.isShared === (shared === 'true'))
      && (scope !== 'team' || t.isShared)
      && (scope !== 'recent' || time(t.lastUsedAt) >= recentSince)
      && (!category || String(t.category).toLowerCase() === String(category).toLowerCase())
      && (!channel || (t.channels || []).includes(channel))
      && (!rx || matches(rx, t.name, t.description, t.content, t.category, t.channels)))
    .sort(order));
}

function createTemplate(body = {}) {
  const { name, category, content } = body;
  if (!name || !String(name).trim() || !category || !content || !String(content).trim()) fail(400, 'name, category and content are required');
  const fields = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k)));
  fields.content = sanitize(fields.content);
  fields.variables = templateUtils.syncVariables(fields.content, fields.variables);
  if (fields.channels && !Array.isArray(fields.channels)) fields.channels = [fields.channels];

  const template = {
    channels: ['Chat'],
    isShared: false,
    starred: false,
    usageCount: 0,
    ...fields,
    name: String(name).trim(),
    id: generateId('template'),
    createdBy: body.createdBy || SUPERVISOR.id,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  db.templates.push(template);
  hub.broadcast('template_created', { data: template });
  return reply(template, 201);
}

function templateOr404(id) {
  return db.templates.find((t) => t.id === id) || fail(404, 'Template not found');
}

function updateTemplate(id, body = {}) {
  const template = templateOr404(id);
  if (body.name !== undefined && !String(body.name).trim()) fail(400, 'name cannot be empty');
  EDITABLE.forEach((key) => {
    if (body[key] !== undefined) template[key] = body[key];
  });
  if (body.content !== undefined) template.content = sanitize(template.content);
  if (body.content !== undefined || body.variables !== undefined) {
    template.variables = templateUtils.syncVariables(template.content, body.variables || template.variables);
  }
  if (template.channels && !Array.isArray(template.channels)) template.channels = [template.channels];
  template.updatedAt = new Date();
  hub.broadcast('template_updated', { data: template });
  return reply(template);
}

function deleteTemplate(id) {
  const index = db.templates.findIndex((t) => t.id === id);
  if (index < 0) fail(404, 'Template not found');
  db.templates.splice(index, 1);
  hub.broadcast('template_deleted', { data: { id } });
  return reply({ message: 'Template deleted successfully' });
}

function renderTemplate(id, body = {}) {
  const template = templateOr404(id);
  const conversation = body.conversationId ? findConversation(body.conversationId) : null;
  const values = { ...templateUtils.contextValues(conversation), ...(body.variables || {}) };
  return reply({ templateId: template.id, ...templateUtils.render(template.content, values) });
}

// ---- Feed, search and runtime controls -----------------------------------------------------
function activity({ limit } = {}) {
  const max = Math.min(100, Number(limit) || 20);
  return reply([...db.activities].sort((a, b) => time(b.timestamp) - time(a.timestamp)).slice(0, max));
}

function search({ q: raw } = {}) {
  const q = String(raw || '').trim().replace(/^#/, '');
  if (q.length < 2) return reply({ conversations: [], agents: [], templates: [] });
  const rx = new RegExp(escapeRegex(q), 'i');
  return reply({
    conversations: db.conversations
      .filter((c) => matches(rx, c.customer?.name, c.caseNumber, c.tags, c.issue))
      .sort((a, b) => String(a.status).localeCompare(String(b.status)) || time(b.startTime) - time(a.startTime))
      .slice(0, 6)
      .map((c) => ({ id: c.id, caseNumber: c.caseNumber, customer: c.customer?.name, issue: c.issue, status: c.status, alertLevel: c.alertLevel, queue: c.queue })),
    agents: db.agents.filter((a) => matches(rx, a.name, a.description, a.id)).slice(0, 4)
      .map((a) => ({ id: a.id, name: a.name, version: a.version, status: a.status })),
    templates: db.templates.filter((t) => matches(rx, t.name, t.description, t.category)).slice(0, 4)
      .map((t) => ({ id: t.id, name: t.name, category: t.category }))
  });
}

function setSimulation({ enabled } = {}) {
  if (enabled) simulator.start();
  else simulator.stop();
  hub.broadcast('system_update', { data: { simulation: simulator.isRunning() } });
  return reply({ simulation: simulator.isRunning() });
}

function reset() {
  seed();
  analytics.captureSnapshot();
  hub.broadcast('system_update', { data: { reset: true } });
  return reply({ message: 'Demo data restored' });
}

// ---- Router --------------------------------------------------------------------------------
const ROUTES = [
  ['GET', '/api/conversations', ({ query }) => listConversations(query)],
  ['GET', '/api/conversations/:id', ({ params }) => reply(present(conversationOr404(params.id)), 200, 100)],
  ['GET', '/api/conversations/:id/copilot', ({ params, query }) => {
    const conversation = conversationOr404(params.id);
    return reply(copilot.recommend(conversation, agentsById().get(conversation.agent?.id), { currency: query.currency === 'USD' ? 'USD' : 'INR' }));
  }],
  ['POST', '/api/conversations/:id/copilot/decision', ({ params, body }) => copilotDecision(params.id, body)],
  ['POST', '/api/conversations/:id/messages', ({ params, body }) => addMessage(params.id, body)],
  ['PATCH', '/api/conversations/:id/status', ({ params, body }) => updateStatus(params.id, body)],
  ['POST', '/api/conversations/:id/tags', ({ params, body }) => addTags(params.id, body)],
  ['PUT', '/api/conversations/:id/feedback', ({ params, body }) => saveFeedback(params.id, body)],

  ['POST', '/api/intervene', ({ body }) => takeOver(body)],
  ['POST', '/api/intervene/release', ({ body }) => release(body)],

  ['GET', '/api/agents', () => reply([...db.agents].sort((a, b) => a.id.localeCompare(b.id)), 200, 100)],
  ['GET', '/api/agents/:id', ({ params }) => reply(agentOr404(params.id), 200, 100)],
  ['PATCH', '/api/agents/:id/config', ({ params, body }) => updateAgentConfig(params.id, body)],
  ['GET', '/api/agents/:id/metrics', ({ params }) => reply(agentOr404(params.id).metrics || { conversations: 0, avgResponseTime: 0, satisfaction: 0, escalationRate: 0, topIssues: [] }, 200, 100)],
  ['GET', '/api/agents/:id/performance', ({ params, query }) => reply(analytics.agentPerformance(agentOr404(params.id), query.range || '7d'))],
  ['POST', '/api/agents/:id/evaluate', ({ params, body }) => evaluateAgent(params.id, body)],
  ['GET', '/api/agents/:id/evaluation', ({ params }) => storedEvaluation(params.id)],
  ['POST', '/api/agents/:id/simulate', ({ params, body }) => simulateAgent(params.id, body)],

  ['GET', '/api/presets', () => reply([...db.presets].sort((a, b) => time(b.createdAt) - time(a.createdAt)))],
  ['POST', '/api/presets', ({ body }) => createPreset(body)],
  ['DELETE', '/api/presets/:id', ({ params }) => deletePreset(params.id)],

  ['GET', '/api/templates', ({ query }) => listTemplates(query)],
  ['POST', '/api/templates', ({ body }) => createTemplate(body)],
  ['GET', '/api/templates/:id', ({ params }) => reply(templateOr404(params.id))],
  ['PATCH', '/api/templates/:id', ({ params, body }) => updateTemplate(params.id, body)],
  ['DELETE', '/api/templates/:id', ({ params }) => deleteTemplate(params.id)],
  ['POST', '/api/templates/:id/render', ({ params, body }) => renderTemplate(params.id, body)],

  ['GET', '/api/knowledge-base', () => reply([...db.knowledgeBases].sort((a, b) => a.name.localeCompare(b.name)))],

  ['GET', '/api/analytics/dashboard', ({ query }) => reply(analytics.dashboard({ range: query.range, region: query.region }))],
  ['GET', '/api/analytics/overview', ({ query }) => reply(analytics.overview({ timeRange: query.timeRange }))],
  ['GET', '/api/analytics', ({ query }) => reply(analytics.overview({ timeRange: query.timeRange }))],
  ['GET', '/api/activity', ({ query }) => activity(query)],
  ['GET', '/api/search', ({ query }) => search(query)],
  ['GET', '/api/system/status', () => reply({ simulation: simulator.isRunning(), clients: hub.clientCount(), supervisor: SUPERVISOR })],
  ['POST', '/api/system/simulation', ({ body }) => setSimulation(body)],
  ['POST', '/api/system/reset', () => reset()]
].map(([method, pattern, handler]) => ({
  method,
  handler,
  keys: (pattern.match(/:\w+/g) || []).map((k) => k.slice(1)),
  regex: new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}/?$`)
}));

/** @returns {{ status: number, data: any, delay: number }} */
export function handle(method, path, query = {}, body = {}) {
  try {
    for (const route of ROUTES) {
      if (route.method !== method) continue;
      const match = route.regex.exec(path);
      if (!match) continue;
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      return route.handler({ params, query, body: body || {} });
    }
    return { status: 404, data: { message: 'Not found' }, delay: 30 };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, data: err.body, delay: 60 };
    console.error('[local] request failed:', err);
    return { status: 500, data: { message: 'Internal server error' }, delay: 30 };
  }
}
