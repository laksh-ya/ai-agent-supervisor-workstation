// services/copilot.js
// Produces the "Co-pilot recommendation" for a conversation: a concrete next action,
// the customer-facing reply that carries it out, evidence and a calibrated confidence.
// Grounded in the Customer Service Guidelines via the mock knowledge retriever.
const { determineIntent, retrieveKnowledge } = require('../mockLlmApi');
const { assess } = require('../utils/risk');
const { formatMoney: money } = require('../utils/money');

function firstName(conversation) {
  return (conversation.customer?.name || 'there').split(' ')[0];
}

function lastCustomerText(conversation) {
  const msgs = conversation.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].sender === 'customer') return msgs[i].text;
  return '';
}

const PLAYBOOKS = {
  // ctx: { thresholds, formatMoney }
  Refund: (c, ctx) => {
    const amount = c.refundValue || 0;
    const overLimit = amount >= ctx.thresholds.refundValue;
    return {
      title: overLimit
        ? `Approve expedited refund of ${ctx.formatMoney(amount)} and waive the standard review period.`
        : `Release the refund of ${ctx.formatMoney(amount)} to the original payment method.`,
      reply: `Hi ${firstName(c)}, I've reviewed the return evidence and approved an expedited refund of ${ctx.formatMoney(amount)}. You'll see it on your original payment method within 3–5 business days, and I've added a note so you won't need to contact us again about this.`,
      evidence: ['return scan received', 'item category eligible', `customer lifetime value: ${(c.customer?.lifetimeValue || 0) > 80000 ? 'high' : 'standard'}`],
      actionLabel: overLimit ? 'Refund override approved' : 'Refund released',
      query: 'refund methods original payment method return'
    };
  },
  Account: (c) => ({
    title: 'Verify identity with two methods, then unlock the account and send a secure reset link.',
    reply: `Hi ${firstName(c)}, thanks for your patience. I've verified your identity and unlocked your account. A secure password reset link is on its way to your registered email; for extra protection I'd recommend turning on two-factor authentication once you're back in.`,
    evidence: ['2 verification methods passed', 'no fraud flags on account', 'lockout caused by failed attempts'],
    actionLabel: 'Account unlock approved',
    query: 'password reset verify identity two verification methods'
  }),
  Delivery: (c) => ({
    title: 'Offer a 10% shipping refund and free expedited shipping on the replacement.',
    reply: `Hi ${firstName(c)}, I'm sorry your delivery hit an exception. I've arranged an expedited replacement at no cost and refunded 10% of your shipping charges. You'll get a new tracking link by email within the hour.`,
    evidence: ['carrier exception > 3 business days', 'guideline: delayed shipments', 'replacement stock available'],
    actionLabel: 'Delivery remedy approved',
    query: 'delays exceeding 3 business days refund shipping costs expedited'
  }),
  Product: (c) => ({
    title: 'Process a no-fee replacement and flag the SKU for quality review.',
    reply: `Hi ${firstName(c)}, I'm sorry the product isn't working as it should. I've set up a free replacement with no restocking fee and a prepaid return label for the faulty unit. I've also flagged this to our quality team.`,
    evidence: ['defect reported within 90 days', 'troubleshooting attempted', 'repeat defect pattern on SKU'],
    actionLabel: 'Replacement approved',
    query: 'defective products replacement refund quality'
  }),
  Billing: (c) => ({
    title: 'Refund the duplicate charge and add goodwill store credit.',
    reply: `Hi ${firstName(c)}, I've confirmed the duplicate charge and refunded it; you'll receive a confirmation email with the transaction reference, and funds typically arrive in 3–5 business days. I've also added store credit to your account for the trouble.`,
    evidence: ['duplicate transaction confirmed', 'same amount within 2 minutes', 'guideline: double charges'],
    actionLabel: 'Duplicate charge refunded',
    query: 'double charges refund transaction reference store credit'
  }),
  General: (c) => ({
    title: 'Summarise the issue, confirm ownership and set a clear follow-up time.',
    reply: `Hi ${firstName(c)}, I'm taking ownership of this for you. Here's what I'll do next, and I'll follow up within 24 hours with an update.`,
    evidence: ['intent unclear to AI', 'customer awaiting next step'],
    actionLabel: 'Follow-up committed',
    query: 'customer service guidelines ownership follow up'
  })
};

function recommend(conversation, agent, { currency = 'INR' } = {}) {
  const formatMoney = (amount) => money(amount, currency);
  const risk = assess(conversation, agent);
  const queue = PLAYBOOKS[conversation.queue] ? conversation.queue : 'General';
  const play = PLAYBOOKS[queue](conversation, { thresholds: risk.thresholds, formatMoney });

  const enabledKbs = (agent?.knowledgeBases || []).filter((k) => k.enabled).map((k) => k.id);
  const citations = retrieveKnowledge(play.query, enabledKbs.length ? enabledKbs : undefined, 2)
    .map(({ text, source, section, relevance }) => ({ text, source, section, relevance }));

  const intent = determineIntent(lastCustomerText(conversation));
  // Confidence rises with grounding and with a clear, matched intent; falls with anger.
  const grounding = citations.length ? Math.max(...citations.map((c) => c.relevance)) : 0.3;
  const intentMatch = (queue === 'Refund' && intent === 'returns') || (queue === 'Delivery' && intent === 'shipping') ? 0.06 : 0;
  const confidence = Math.min(0.97, Math.max(0.52,
    0.62 + grounding * 0.22 + intentMatch - (1 - (conversation.metrics?.sentiment ?? 0.5)) * 0.05
  ));

  return {
    title: play.title,
    reply: play.reply,
    evidence: play.evidence,
    actionLabel: play.actionLabel,
    confidence: Number(confidence.toFixed(2)),
    basis: 'Generated from policy, customer tier, and conversation sentiment',
    citations,
    intent
  };
}

module.exports = { recommend };
