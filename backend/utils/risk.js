// utils/risk.js
// Single source of truth for how "risky" a conversation is. Everything the supervisor sees —
// alert levels, the priority queue, SLA countdowns, case diagnostics, critical signals —
// is derived here so the dashboard, conversation view and simulator never disagree.

// Customer Service Guidelines § Response Time Expectations: chat "Resolution or action plan: Within 15 minutes"
const SLA_TARGET_SECONDS = 15 * 60;

const QUEUE_LABELS = {
  Refund: 'Returns & refunds',
  Delivery: 'Order tracking',
  Product: 'Product support',
  Account: 'Account access',
  Billing: 'Billing & payments',
  General: 'General enquiries'
};

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// Sentiment is stored 0..1 (API contract); supervisors read it on a signed −1..1 scale.
const toSignedSentiment = (s) => Number((clamp(s ?? 0.5) * 2 - 1).toFixed(2));
const fromSignedSentiment = (v) => Number(((Number(v) + 1) / 2).toFixed(3));

const RISK_WEIGHTS = {
  sentiment: 36,
  confidence: 24,
  sla: 16,
  policy: 10,
  vip: 6,
  repeat: 6,
  human: 12,
  // Fitted so the design's reference cases land on their mocked scores (96/84/72/58/47)
  midpoint: 28.4,
  spread: 17.4
};

const DEFAULT_THRESHOLDS = {
  lowConfidence: 0.6,
  negativeSentiment: 0.3,
  responseTime: 90,
  refundValue: 5000
};

function lastMessageBy(conversation, senders) {
  const messages = conversation.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (senders.includes(messages[i].sender)) return messages[i];
  }
  return null;
}

function transcript(conversation) {
  return (conversation.messages || []).map((m) => m.text || '').join(' ').toLowerCase();
}

function waitSeconds(conversation, now = Date.now()) {
  const start = new Date(conversation.startTime || now).getTime();
  const end = conversation.status === 'resolved' && conversation.endTime
    ? new Date(conversation.endTime).getTime()
    : now;
  return Math.max(0, Math.round((end - start) / 1000));
}

// Seconds the customer's latest message has gone without any reply
function pendingReplySeconds(conversation, now = Date.now()) {
  const messages = conversation.messages || [];
  const last = messages[messages.length - 1];
  if (!last || last.sender !== 'customer') return 0;
  return Math.max(0, Math.round((now - new Date(last.timestamp).getTime()) / 1000));
}

function requestedHuman(conversation) {
  const tags = conversation.tags || [];
  if (tags.includes('escalation-requested')) return true;
  const lastCustomer = lastMessageBy(conversation, ['customer']);
  return !!lastCustomer && /(human|supervisor|manager|real person|representative)/i.test(lastCustomer.text);
}

function hasPolicyException(conversation, thresholds) {
  const tags = conversation.tags || [];
  if (tags.includes('policy-exception')) return true;
  if ((conversation.refundValue || 0) >= thresholds.refundValue) return true;
  return /(approval limit|exceeds my|override|policy exception)/i.test(transcript(conversation));
}

/**
 * Case diagnostics shown in "Customer intelligence" (all 0..1).
 */
function diagnostics(conversation, thresholds = DEFAULT_THRESHOLDS) {
  const contactCount = conversation.customer?.contactCount || 1;
  const sentiment = conversation.metrics?.sentiment ?? 0.5;
  const text = transcript(conversation);

  const repeatContact = clamp(0.32 + 0.3 * (contactCount - 1), 0.05, 0.99);
  const negativeSentiment = clamp(1 - sentiment, 0.01, 0.99);

  let policyException = 0.15;
  if ((conversation.refundValue || 0) >= thresholds.refundValue) policyException += 0.35;
  if (/(approval limit|exceeds my|override|policy)/.test(text)) policyException += 0.16;
  policyException = clamp(policyException, 0.05, 0.99);

  const vip = /vip|platinum/i.test(conversation.customer?.tier || '');
  const churnPropensity = clamp(
    0.22 + negativeSentiment * 0.28 + (contactCount - 1) * 0.06 + (vip ? 0.02 : 0.06),
    0.05, 0.97
  );

  return {
    repeatContact: Number(repeatContact.toFixed(2)),
    negativeSentiment: Number(negativeSentiment.toFixed(2)),
    policyException: Number(policyException.toFixed(2)),
    churnPropensity: Number(churnPropensity.toFixed(2))
  };
}

function severityFor(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'watch';
  return 'stable';
}

/**
 * Full risk assessment for one conversation.
 * @param {object} conversation plain conversation object
 * @param {object} [agent] owning agent (for its escalation thresholds)
 * @param {object} [opts] { now, templateCategories: Set of categories with at least one template }
 */
function assess(conversation, agent, opts = {}) {
  const now = opts.now || Date.now();
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(agent?.escalationThresholds || {}) };
  Object.keys(DEFAULT_THRESHOLDS).forEach((k) => {
    if (thresholds[k] === undefined || thresholds[k] === null) thresholds[k] = DEFAULT_THRESHOLDS[k];
  });

  const metrics = conversation.metrics || {};
  const sentiment = metrics.sentiment ?? 0.5;
  const confidence = metrics.confidenceScore ?? 0.8;
  const wait = waitSeconds(conversation, now);
  const pending = pendingReplySeconds(conversation, now);
  const closed = conversation.status === 'resolved';
  const humanActive = !!conversation.humanIntervention?.active;
  const vip = /vip|platinum/i.test(conversation.customer?.tier || '');
  const contactCount = conversation.customer?.contactCount || 1;
  const policyException = hasPolicyException(conversation, thresholds);
  const wantsHuman = requestedHuman(conversation);

  // Weighted evidence, then a logistic curve so the score reads as a breach probability (0..100)
  let raw = 0;
  raw += (1 - sentiment) * RISK_WEIGHTS.sentiment;                 // how upset the customer is
  raw += (1 - confidence) * RISK_WEIGHTS.confidence;               // how unsure the AI is
  raw += clamp(wait / SLA_TARGET_SECONDS) * RISK_WEIGHTS.sla;      // SLA exposure
  raw += policyException ? RISK_WEIGHTS.policy : 0;                // needs authority above the AI
  raw += vip ? RISK_WEIGHTS.vip : 0;                               // value at stake
  raw += Math.min(2, contactCount - 1) * RISK_WEIGHTS.repeat;      // repeat contact
  raw += wantsHuman ? RISK_WEIGHTS.human : 0;                      // explicit escalation request
  const score = Math.round(100 / (1 + Math.exp(-(raw - RISK_WEIGHTS.midpoint) / RISK_WEIGHTS.spread)));

  // Threshold breaches from the agent's escalation policy
  const breaches = [];
  if (sentiment <= thresholds.negativeSentiment) breaches.push(`Sentiment ${toSignedSentiment(sentiment)} ≤ ${toSignedSentiment(thresholds.negativeSentiment)}`);
  if (confidence <= thresholds.lowConfidence) breaches.push(`AI confidence ${confidence.toFixed(2)} ≤ ${Number(thresholds.lowConfidence).toFixed(2)}`);
  if (!humanActive && pending >= thresholds.responseTime) breaches.push(`No agent response for ${pending}s`);
  if ((conversation.refundValue || 0) >= thresholds.refundValue) breaches.push('Refund value above autonomous limit');
  if (wantsHuman) breaches.push('Customer asked for a human');

  let alertLevel = 'low';
  if (score >= 80 || breaches.length >= 2 || wantsHuman) alertLevel = 'high';
  else if (score >= 60 || breaches.length === 1) alertLevel = 'medium';
  if (closed) alertLevel = 'low';

  const slaRemaining = SLA_TARGET_SECONDS - wait;

  // Recommended supervisor action for the priority queue
  let action = 'monitor';
  if (closed) action = 'none';
  else if (humanActive) action = 'reply';
  else if (score >= 90 || wantsHuman) action = 'take_over';
  else if (policyException) action = 'approve_override';
  else if (confidence < 0.7) action = 'review_evidence';
  else if (score < 50 && sentiment < 0.6 && opts.templateCategories && opts.templateCategories.has(conversation.queue)) action = 'send_template';

  // Short human-readable reason for banners
  let headline = null;
  if (!closed && slaRemaining > 0 && slaRemaining <= 5 * 60) headline = `SLA breach likely in ${formatClock(slaRemaining)}`;
  else if (!closed && slaRemaining <= 0) headline = `SLA breached ${formatClock(-slaRemaining)} ago`;
  else if (breaches.length) headline = breaches[0];

  let cause = null;
  if (confidence < 0.7 && policyException) cause = 'AI confidence fell after policy exception request';
  else if (confidence < 0.7) cause = `AI confidence at ${Math.round(confidence * 100)}%. Evidence needs review`;
  else if (sentiment < 0.35) cause = 'Customer sentiment is deteriorating';
  else if (wantsHuman) cause = 'Customer asked to speak with a human';

  return {
    score,
    severity: severityFor(score),
    alertLevel,
    breaches,
    action,
    waitSeconds: wait,
    pendingReplySeconds: pending,
    slaTargetSeconds: SLA_TARGET_SECONDS,
    slaRemainingSeconds: slaRemaining,
    headline,
    cause,
    policyException,
    requestedHuman: wantsHuman,
    thresholds,
    diagnostics: diagnostics(conversation, thresholds)
  };
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = {
  SLA_TARGET_SECONDS,
  QUEUE_LABELS,
  DEFAULT_THRESHOLDS,
  clamp,
  toSignedSentiment,
  fromSignedSentiment,
  waitSeconds,
  pendingReplySeconds,
  diagnostics,
  assess,
  severityFor,
  formatClock
};
