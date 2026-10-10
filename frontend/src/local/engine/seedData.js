/* eslint-disable */
// Generated from backend/utils/seedData.js by scripts/sync-engine.js. Do not edit here.
// utils/seedData.js
// Demo dataset for the supervisor workstation. Everything is generated relative to `now`
// so SLA timers, wait clocks and trend charts look live whenever the database is seeded.
// Includes three reference conversations with their original wording.

const SEED_VERSION = 5;

// Deterministic PRNG so every seed produces the same dataset
function mulberry32(a) {
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const minutes = (n) => n * 60000;
const seconds = (n) => n * 1000;

const AGENTS = {
  logistics: { id: 'agent-cs-1', name: 'CSR-Logistics' },
  tech: { id: 'agent-cs-2', name: 'CSR-Tech' },
  returns: { id: 'agent-cs-3', name: 'CSR-Returns' },
  identity: { id: 'agent-cs-4', name: 'CSR-Identity' },
  finance: { id: 'agent-cs-5', name: 'CSR-Finance' }
};

const QUEUE_AGENT = {
  Refund: AGENTS.returns,
  Delivery: AGENTS.logistics,
  Product: AGENTS.tech,
  Account: AGENTS.identity,
  Billing: AGENTS.finance
};

function buildKnowledgeBases(now) {
  const daysAgo = (d) => new Date(now - d * 86400000);
  return [
    { id: 'kb-cs-general', name: 'Customer Service Guidelines', description: 'General customer service policies and procedures', documentCount: 45, lastUpdated: daysAgo(25) },
    { id: 'kb-product-catalog', name: 'Product Catalog', description: 'Complete product listings with details and pricing', documentCount: 1243, lastUpdated: daysAgo(8) },
    { id: 'kb-shipping-policy', name: 'Shipping Policy', description: 'Shipping options, timelines, and costs', documentCount: 12, lastUpdated: daysAgo(105) },
    { id: 'kb-return-policy', name: 'Return Policy', description: 'Return and exchange procedures and limitations', documentCount: 18, lastUpdated: daysAgo(40) },
    { id: 'kb-product-specs', name: 'Technical Specifications', description: 'Detailed technical information for all products', documentCount: 842, lastUpdated: daysAgo(60) },
    { id: 'kb-product-faq', name: 'Product FAQs', description: 'Frequently asked questions about products', documentCount: 367, lastUpdated: daysAgo(20) },
    { id: 'kb-warranty-info', name: 'Warranty Information', description: 'Warranty terms and claim procedures', documentCount: 29, lastUpdated: daysAgo(175) },
    { id: 'kb-account-security', name: 'Account & Security', description: 'Identity verification, lockouts and account recovery', documentCount: 31, lastUpdated: daysAgo(15) },
    { id: 'kb-billing', name: 'Billing & Payments', description: 'Charges, invoices, refunds and payment failures', documentCount: 54, lastUpdated: daysAgo(30) }
  ];
}

const CAP = {
  order_lookup: ['Order Lookup', 'Read order, shipment and payment status'],
  return_processing: ['Return Processing', 'Create return labels and RMAs'],
  refund_calculator: ['Refund Calculator', 'Compute eligible refund amounts under policy'],
  shipping_calculator: ['Shipping Calculator', 'Quote carrier options and delivery dates'],
  discount_manager: ['Discount Manager', 'Issue store credit and goodwill discounts'],
  product_info: ['Product Information', 'Answer catalog and specification questions'],
  product_comparison: ['Product Comparison', 'Compare products on key differentiators'],
  technical_support: ['Technical Support', 'Guided troubleshooting flows'],
  identity_verification: ['Identity Verification', 'Two-factor identity checks before account changes'],
  account_unlock: ['Account Unlock', 'Unlock accounts after verification'],
  payment_refund: ['Payment Refund', 'Reverse duplicate or failed charges'],
  invoice_access: ['Invoice Access', 'Retrieve and resend invoices'],
  carrier_escalation: ['Carrier Escalation', 'Open investigations with shipping carriers']
};

const caps = (spec) => Object.entries(spec).map(([id, enabled]) => ({ id, name: CAP[id][0], description: CAP[id][1], enabled }));
const kbs = (catalog, spec) => Object.entries(spec).map(([id, enabled]) => ({ id, name: catalog.find((k) => k.id === id).name, enabled }));

function buildAgents(catalog) {
  return [
    {
      ...AGENTS.logistics,
      model: 'gpt-3.5-turbo',
      version: 'v4.1',
      description: 'General customer service agent for shipping, tracking and delivery issues',
      parameters: { temperature: 0.7, max_tokens: 150, top_p: 1.0, empathy: 0.62 },
      capabilities: caps({ order_lookup: true, return_processing: true, product_info: true, shipping_calculator: false, discount_manager: false, carrier_escalation: true }),
      knowledgeBases: kbs(catalog, { 'kb-cs-general': true, 'kb-product-catalog': true, 'kb-shipping-policy': true, 'kb-return-policy': true }),
      escalationThresholds: { lowConfidence: 0.4, negativeSentiment: 0.3, responseTime: 120, refundValue: 5000 },
      routing: [
        { intent: 'Order status', model: 'v4.1', tier: 'All', traffic: 100, failover: 'v4.0' },
        { intent: 'Delivery exception', model: 'v4.1', tier: 'VIP', traffic: 100, failover: 'Human' },
        { intent: 'Lost package', model: 'Human', tier: 'All', traffic: 100, failover: 'None' }
      ],
      status: 'active',
      metrics: { conversations: 2456, avgResponseTime: 12.7, satisfaction: 0.86, escalationRate: 0.16, containment: 0.71, fallbackRate: 0.24, hallucinationRate: 0.011,
        topIssues: [{ name: 'Shipping Delays', count: 587 }, { name: 'Order Status', count: 423 }, { name: 'Payment Issues', count: 312 }] },
      metricsPrevious: { containment: 0.73, satisfaction: 0.85, fallbackRate: 0.19, hallucinationRate: 0.012, avgResponseTime: 12.1 },
      previous: { version: 'v4.0', parameters: { temperature: 0.8, max_tokens: 150, top_p: 1.0, empathy: 0.5 } }
    },
    {
      ...AGENTS.tech,
      model: 'gpt-4o',
      version: 'v4.3',
      description: 'Specialized agent for product information and technical questions',
      parameters: { temperature: 0.5, max_tokens: 200, top_p: 0.9, empathy: 0.58 },
      capabilities: caps({ order_lookup: false, return_processing: false, product_info: true, product_comparison: true, technical_support: true }),
      knowledgeBases: kbs(catalog, { 'kb-product-catalog': true, 'kb-product-specs': true, 'kb-product-faq': true, 'kb-warranty-info': false }),
      escalationThresholds: { lowConfidence: 0.6, negativeSentiment: 0.4, responseTime: 90, refundValue: 5000 },
      routing: [
        { intent: 'Product info', model: 'v4.3', tier: 'All', traffic: 20, failover: 'v4.2' },
        { intent: 'Product info', model: 'v4.2', tier: 'All', traffic: 80, failover: 'Human' },
        { intent: 'Defect', model: 'v4.2', tier: 'All', traffic: 100, failover: 'Human' }
      ],
      status: 'active',
      metrics: { conversations: 1879, avgResponseTime: 14.2, satisfaction: 0.91, escalationRate: 0.08, containment: 0.82, fallbackRate: 0.09, hallucinationRate: 0.004,
        topIssues: [{ name: 'Product Features', count: 542 }, { name: 'Compatibility', count: 389 }, { name: 'Technical Specs', count: 298 }] },
      metricsPrevious: { containment: 0.8, satisfaction: 0.9, fallbackRate: 0.1, hallucinationRate: 0.006, avgResponseTime: 14.8 },
      previous: { version: 'v4.2', parameters: { temperature: 0.6, max_tokens: 220, top_p: 0.95, empathy: 0.5 } }
    },
    {
      ...AGENTS.returns,
      model: 'claude-3-haiku',
      version: 'v4.3',
      description: 'Specialized agent for handling returns and refunds',
      parameters: { temperature: 0.18, max_tokens: 160, top_p: 0.68, empathy: 0.84 },
      capabilities: caps({ order_lookup: true, return_processing: true, refund_calculator: true, shipping_calculator: true, discount_manager: false }),
      knowledgeBases: kbs(catalog, { 'kb-return-policy': true, 'kb-shipping-policy': true, 'kb-warranty-info': true, 'kb-cs-general': false }),
      // Design: no response 90 sec · sentiment ≤ −0.55 · refund ≥ ₹5,000 · confidence ≤ 0.64
      escalationThresholds: { lowConfidence: 0.64, negativeSentiment: 0.225, responseTime: 90, refundValue: 5000 },
      routing: [
        { intent: 'Returns', model: 'v4.3', tier: 'VIP', traffic: 100, failover: 'Human' },
        { intent: 'Returns', model: 'v4.3', tier: 'Standard', traffic: 80, failover: 'v4.2' },
        { intent: 'Damaged item', model: 'v4.2', tier: 'All', traffic: 100, failover: 'Human' },
        { intent: 'Policy exception', model: 'Human', tier: 'All', traffic: 100, failover: 'None' }
      ],
      status: 'active',
      metrics: { conversations: 1456, avgResponseTime: 11.5, satisfaction: 0.88, escalationRate: 0.19, containment: 0.746, fallbackRate: 0.112, hallucinationRate: 0.007,
        topIssues: [{ name: 'Return Eligibility', count: 412 }, { name: 'Refund Status', count: 376 }, { name: 'Exchange Process', count: 289 }] },
      metricsPrevious: { containment: 0.714, satisfaction: 0.84, fallbackRate: 0.133, hallucinationRate: 0.01, avgResponseTime: 12.4 },
      previous: {
        version: 'v4.2',
        parameters: { temperature: 0.35, max_tokens: 150, top_p: 0.8, empathy: 0.55 },
        escalationThresholds: { lowConfidence: 0.55, negativeSentiment: 0.25, responseTime: 120, refundValue: 7500 }
      },
      changeRequestSeq: 1841
    },
    {
      ...AGENTS.identity,
      model: 'gpt-4o-mini',
      version: 'v3.8',
      description: 'Account access, identity verification and security lockouts',
      parameters: { temperature: 0.2, max_tokens: 140, top_p: 0.8, empathy: 0.66 },
      capabilities: caps({ identity_verification: true, account_unlock: false, order_lookup: true }),
      knowledgeBases: kbs(catalog, { 'kb-account-security': true, 'kb-cs-general': true }),
      escalationThresholds: { lowConfidence: 0.7, negativeSentiment: 0.3, responseTime: 60, refundValue: 5000 },
      routing: [
        { intent: 'Password reset', model: 'v3.8', tier: 'All', traffic: 100, failover: 'Human' },
        { intent: 'Account unlock', model: 'Human', tier: 'All', traffic: 100, failover: 'None' }
      ],
      status: 'active',
      metrics: { conversations: 964, avgResponseTime: 9.8, satisfaction: 0.83, escalationRate: 0.22, containment: 0.66, fallbackRate: 0.14, hallucinationRate: 0.003,
        topIssues: [{ name: 'Account Locked', count: 301 }, { name: 'Password Reset', count: 288 }, { name: '2FA Issues', count: 117 }] },
      metricsPrevious: { containment: 0.64, satisfaction: 0.82, fallbackRate: 0.15, hallucinationRate: 0.004, avgResponseTime: 10.2 },
      previous: { version: 'v3.7', parameters: { temperature: 0.3, max_tokens: 140, top_p: 0.85, empathy: 0.6 } }
    },
    {
      ...AGENTS.finance,
      model: 'gpt-4o-mini',
      version: 'v4.0',
      description: 'Billing, invoices, duplicate charges and payment failures',
      parameters: { temperature: 0.25, max_tokens: 170, top_p: 0.85, empathy: 0.7 },
      capabilities: caps({ order_lookup: true, payment_refund: true, invoice_access: true, discount_manager: true }),
      knowledgeBases: kbs(catalog, { 'kb-billing': true, 'kb-cs-general': true }),
      escalationThresholds: { lowConfidence: 0.6, negativeSentiment: 0.3, responseTime: 90, refundValue: 5000 },
      routing: [
        { intent: 'Duplicate charge', model: 'v4.0', tier: 'All', traffic: 100, failover: 'Human' },
        { intent: 'Invoice request', model: 'v4.0', tier: 'All', traffic: 100, failover: 'v3.9' }
      ],
      status: 'active',
      metrics: { conversations: 1188, avgResponseTime: 10.4, satisfaction: 0.87, escalationRate: 0.12, containment: 0.78, fallbackRate: 0.08, hallucinationRate: 0.005,
        topIssues: [{ name: 'Double Charges', count: 244 }, { name: 'Payment Failures', count: 198 }, { name: 'Invoices', count: 131 }] },
      metricsPrevious: { containment: 0.77, satisfaction: 0.86, fallbackRate: 0.09, hallucinationRate: 0.006, avgResponseTime: 10.9 },
      previous: { version: 'v3.9', parameters: { temperature: 0.3, max_tokens: 170, top_p: 0.9, empathy: 0.6 } }
    }
  ];
}

// ---------------------------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------------------------

function thread(start, turns) {
  // turns: [sender, text, offsetSeconds]
  return turns.map(([sender, text, offset]) => ({ sender, text, timestamp: new Date(start + seconds(offset)) }));
}

function designConversations(now) {
  const list = [];

  // Elena Vasquez · Case #84291, the conversation shown on the Conversation Screen
  let start = now - seconds(12 * 60 + 42);
  list.push({
    id: 'conv-84291', caseNumber: '84291',
    customer: { id: 'cust-2291', name: 'Elena Vasquez', email: 'elena.vasquez@example.com', tier: 'VIP', tenureYears: 3.8, city: 'Madrid', locale: 'EN-US', lifetimeValue: 124000, orders: 38, returnRate: 0.052, contactCount: 3 },
    agent: AGENTS.returns, queue: 'Refund', channel: 'Web chat', region: 'Western Europe', issue: 'Refund blocked', refundValue: 8420,
    status: 'active', startTime: new Date(start),
    metrics: { sentiment: 0.19, responseTime: 14.2, confidenceScore: 0.46 },
    messages: thread(start, [
      ['customer', 'I returned the item last week, but the refund is still blocked.', 0],
      ['agent', 'I found the return receipt and carrier confirmation. I’m checking the refund policy now.', 58],
      ['customer', 'I need the refund today. This is the second time I’m contacting support.', 190],
      ['agent', 'The amount exceeds my approval limit. I’ve prepared the evidence for supervisor review.', 250]
    ]),
    tags: ['refund', 'policy-exception', 'vip', 'repeat-contact']
  });

  // Marcus Lee · #84275, account locked, needs an override
  start = now - seconds(9 * 60 + 18);
  list.push({
    id: 'conv-84275', caseNumber: '84275',
    customer: { id: 'cust-2275', name: 'Marcus Lee', email: 'marcus.lee@example.com', tier: 'Gold', tenureYears: 2.1, city: 'Toronto', locale: 'EN-CA', lifetimeValue: 58000, orders: 17, returnRate: 0.03, contactCount: 2 },
    agent: AGENTS.identity, queue: 'Account', channel: 'Web chat', region: 'North America', issue: 'Account locked',
    status: 'active', startTime: new Date(start),
    metrics: { sentiment: 0.27, responseTime: 9.1, confidenceScore: 0.61 },
    messages: thread(start, [
      ['customer', 'My account got locked after the password reset and now I can’t see my orders.', 0],
      ['agent', 'I’m sorry about that. I’ve verified your email and phone number. Unlocking requires an override I’m not authorised to apply.', 42],
      ['customer', 'This is really frustrating, I have a delivery arriving today and need the code.', 131],
      ['agent', 'I understand. I’ve flagged this for a supervisor with your verification already completed.', 176]
    ]),
    tags: ['account', 'lockout', 'policy-exception']
  });

  // Noah Williams · #84263, delivery exception, AI unsure
  start = now - seconds(8 * 60 + 9);
  list.push({
    id: 'conv-84263', caseNumber: '84263',
    customer: { id: 'cust-2263', name: 'Noah Williams', email: 'noah.w@example.com', tier: 'Standard', tenureYears: 1.2, city: 'Austin', locale: 'EN-US', lifetimeValue: 21000, orders: 9, returnRate: 0.08, contactCount: 1 },
    agent: AGENTS.logistics, queue: 'Delivery', channel: 'Web chat', region: 'North America', issue: 'Delivery exception',
    status: 'active', startTime: new Date(start),
    metrics: { sentiment: 0.33, responseTime: 16.4, confidenceScore: 0.55 },
    messages: thread(start, [
      ['customer', 'Tracking says delivery exception, address issue? My address hasn’t changed.', 0],
      ['agent', 'Let me look into that. The carrier reports an access problem at the building.', 51],
      ['customer', 'There was someone at home all day. Can you just tell me when it will arrive?', 142],
      ['agent', 'I’m checking the carrier notes now, the latest scan is ambiguous.', 205]
    ]),
    tags: ['delivery', 'carrier-exception']
  });

  // Ava Thompson · #84241, product defect, watch
  start = now - seconds(6 * 60 + 34);
  list.push({
    id: 'conv-84241', caseNumber: '84241',
    customer: { id: 'cust-2241', name: 'Ava Thompson', email: 'ava.t@example.com', tier: 'Standard', tenureYears: 0.7, city: 'Manchester', locale: 'EN-GB', lifetimeValue: 14500, orders: 4, returnRate: 0.0, contactCount: 1 },
    agent: AGENTS.tech, queue: 'Product', channel: 'Web chat', region: 'UK & Ireland', issue: 'Product defect',
    status: 'active', startTime: new Date(start),
    metrics: { sentiment: 0.42, responseTime: 11.8, confidenceScore: 0.72 },
    messages: thread(start, [
      ['customer', 'The Eco-Friendly Blender makes a grinding noise and stops after a few seconds.', 0],
      ['agent', 'Sorry to hear that. Could you try removing the jar and re-seating it until it clicks?', 38],
      ['customer', 'Tried that twice, same problem. It’s only two weeks old.', 120]
    ]),
    tags: ['product', 'defect']
  });

  // Oliver Chen · #84230, billing, low risk, template-able
  start = now - seconds(4 * 60 + 51);
  list.push({
    id: 'conv-84230', caseNumber: '84230',
    customer: { id: 'cust-2230', name: 'Oliver Chen', email: 'oliver.chen@example.com', tier: 'Standard', tenureYears: 2.6, city: 'Singapore', locale: 'EN-SG', lifetimeValue: 33000, orders: 12, returnRate: 0.02, contactCount: 1 },
    agent: AGENTS.finance, queue: 'Billing', channel: 'Web chat', region: 'APAC', issue: 'Duplicate charge',
    status: 'active', startTime: new Date(start),
    metrics: { sentiment: 0.52, responseTime: 8.7, confidenceScore: 0.84 },
    messages: thread(start, [
      ['customer', 'I think I was charged twice for order ORD-55120-PLM.', 0],
      ['agent', 'Thanks Oliver, I can see two authorisations of the same amount. Let me confirm which one settled.', 35]
    ]),
    tags: ['billing', 'double-charge']
  });

  return list;
}

// Three reference conversations (content verbatim)
function briefConversations(now) {
  const t = (m) => new Date(now - minutes(m));
  return [
    {
      id: 'conv-2023-10', caseNumber: '84202',
      customer: { id: 'cust-5672', name: 'Alex Johnson', email: 'alex.johnson@example.com', tier: 'Standard', tenureYears: 1.5, city: 'Denver', locale: 'EN-US', lifetimeValue: 18200, orders: 7, returnRate: 0.0, contactCount: 1 },
      agent: AGENTS.logistics, queue: 'Delivery', channel: 'Web chat', region: 'North America', issue: 'Express delivery late',
      status: 'active', startTime: t(20),
      metrics: { sentiment: 0.2, responseTime: 15.3, confidenceScore: 0.65 },
      messages: [
        { sender: 'customer', text: "I ordered a package 5 days ago and it still hasn't arrived. The tracking hasn't updated in 3 days.", timestamp: t(20) },
        { sender: 'agent', text: 'I understand your concern about your package. Let me check the status for you. Could you please provide your order number?', timestamp: t(19) },
        { sender: 'customer', text: "Order #ORD-29384-KJH. I need this package by tomorrow for my daughter's birthday.", timestamp: t(18) },
        { sender: 'agent', text: "Thank you for providing your order number. I'm checking your order status now.", timestamp: t(17) },
        { sender: 'agent', text: 'I can see that your package is currently in transit. Sometimes tracking information may take time to update.', timestamp: t(16) },
        { sender: 'customer', text: "That's not helpful at all. I need to know if it will arrive by tomorrow. This is a gift for my daughter!", timestamp: t(15) },
        { sender: 'agent', text: 'I apologize for the inconvenience. Based on the current location of your package, standard delivery estimates suggest it should arrive within 1-2 business days.', timestamp: t(14) },
        { sender: 'customer', text: "That's not good enough. I paid for express shipping specifically to have it arrive by tomorrow. I want to speak to a human representative.", timestamp: t(13) }
      ],
      tags: ['shipping', 'delay', 'urgent', 'escalation-requested']
    },
    {
      id: 'conv-2023-45', caseNumber: '84219',
      customer: { id: 'cust-3891', name: 'Morgan Smith', email: 'morgan.smith@example.com', tier: 'Gold', tenureYears: 4.2, city: 'Seattle', locale: 'EN-US', lifetimeValue: 71000, orders: 29, returnRate: 0.01, contactCount: 1 },
      agent: AGENTS.tech, queue: 'Product', channel: 'Web chat', region: 'North America', issue: 'Warranty question',
      status: 'active', startTime: t(10),
      metrics: { sentiment: 0.8, responseTime: 8.2, confidenceScore: 0.92 },
      messages: [
        { sender: 'customer', text: 'Does the Eco-Friendly Blender come with a warranty?', timestamp: t(10) },
        { sender: 'agent', text: "Yes, the Eco-Friendly Blender comes with a 2-year manufacturer's warranty that covers parts and labor for defects in materials or workmanship.", timestamp: t(9) },
        { sender: 'customer', text: "Great! And what's the wattage on the motor?", timestamp: t(8) },
        { sender: 'agent', text: 'The Eco-Friendly Blender features a powerful 1200-watt motor, which is excellent for blending tough ingredients like frozen fruits and vegetables.', timestamp: t(7) },
        { sender: 'customer', text: "Perfect. One last question - does it come in any colors besides white?", timestamp: t(6) },
        { sender: 'agent', text: 'Yes, the Eco-Friendly Blender is available in white, black, red, and a limited edition green color. All colors are currently in stock and the same price.', timestamp: t(5) },
        { sender: 'customer', text: "Thanks so much for the information! I think I'll go with the red one.", timestamp: t(4) }
      ],
      tags: ['product', 'information', 'positive']
    },
    {
      id: 'conv-2023-78', caseNumber: '84211',
      customer: { id: 'cust-7294', name: 'Jamie Lee', email: 'jamie.lee@example.com', tier: 'Silver', tenureYears: 2.9, city: 'Dublin', locale: 'EN-IE', lifetimeValue: 26400, orders: 11, returnRate: 0.09, contactCount: 1 },
      agent: AGENTS.returns, queue: 'Refund', channel: 'Web chat', region: 'UK & Ireland', issue: 'Return without receipt', refundValue: 4150,
      status: 'active', startTime: t(15),
      metrics: { sentiment: 0.5, responseTime: 12.7, confidenceScore: 0.75 },
      messages: [
        { sender: 'customer', text: "I bought a sweater last month but it's pilling badly after just two washes. I'd like to return it but I no longer have the receipt. Can I still get a refund? Also, if I exchange it for something else, will I need to pay for shipping?", timestamp: t(15) },
        { sender: 'agent', text: "I'm sorry to hear about the quality issue with your sweater. For returns without a receipt, we can offer store credit at the current selling price if we can verify the purchase through the credit card used, your loyalty account, or email address.", timestamp: t(14) },
        { sender: 'customer', text: "I used my loyalty account when purchasing. It's linked to my email jamie.lee@example.com.", timestamp: t(13) },
        { sender: 'agent', text: 'Thank you for providing that information. Let me check your purchase history through your loyalty account.', timestamp: t(12) },
        { sender: 'agent', text: "I've found your purchase from April 15th for the Cozy Comfort Sweater in size M for $49.99. Since this is a quality issue, we'd be happy to process a full refund to your original payment method.", timestamp: t(11) },
        { sender: 'customer', text: "That's great, thanks! What about my second question regarding exchange shipping?", timestamp: t(10) },
        { sender: 'agent', text: 'For exchanges due to quality issues, we cover the return shipping costs. If you\'d like to exchange for a different item, we also provide free shipping for the new item as a courtesy.', timestamp: t(9) },
        { sender: 'customer', text: "Perfect! I think I'll go ahead with the refund for now and order something else later. How do I start the return process?", timestamp: t(8) },
        { sender: 'agent', text: "I'll email you a prepaid return shipping label that you can print out. Pack the sweater in any box or envelope, attach the label, and drop it off at any postal service location or scheduled pickup. Once we receive it, we'll process your refund within 3-5 business days.", timestamp: t(7) }
      ],
      tags: ['returns', 'quality-issue', 'multi-part-question']
    }
  ];
}

const FIRST = ['Priya', 'Lucas', 'Sofia', 'Mateo', 'Hannah', 'Kenji', 'Amara', 'Diego', 'Freya', 'Omar', 'Chloe', 'Arjun', 'Isla', 'Tomás', 'Zara', 'Felix', 'Nia', 'Hugo', 'Leila', 'Ethan', 'Maya', 'Rohan', 'Ingrid', 'Carlos', 'Aisha', 'Jonas', 'Mei', 'Samuel'];
const LAST = ['Sharma', 'Martin', 'Rossi', 'García', 'Becker', 'Tanaka', 'Okafor', 'López', 'Nilsson', 'Haddad', 'Dubois', 'Mehta', 'Walsh', 'Silva', 'Khan', 'Wagner', 'Mensah', 'Laurent', 'Farah', 'Clarke', 'Patel', 'Iyer', 'Berg', 'Mendes', 'Yusuf', 'Schmidt', 'Wong', 'Adeyemi'];
const REGIONS = [
  ['North America', ['Chicago', 'Boston', 'Vancouver']],
  ['LATAM', ['São Paulo', 'Mexico City', 'Bogotá']],
  ['UK & Ireland', ['London', 'Leeds', 'Cork']],
  ['Western Europe', ['Paris', 'Berlin', 'Lisbon']],
  ['Nordics', ['Stockholm', 'Oslo', 'Copenhagen']],
  ['Middle East', ['Dubai', 'Doha', 'Riyadh']],
  ['India', ['Bengaluru', 'Mumbai', 'Pune']],
  ['APAC', ['Sydney', 'Tokyo', 'Singapore']]
];

const SCRIPTS = {
  Refund: [
    ['Refund pending', [['customer', 'I sent my return back 8 days ago, when will I get my refund?'], ['agent', 'I can see the return was received at our warehouse yesterday. Refunds post within 3–5 business days.']]],
    ['Exchange request', [['customer', 'Can I exchange these trainers for a size up?'], ['agent', 'Absolutely, size 9 is in stock. I’ll create an exchange with free shipping.']]],
    ['Partial refund', [['customer', 'Only half my refund arrived, the rest is missing.'], ['agent', 'Let me check. It looks like a restocking fee was applied to the opened item.'], ['customer', 'Nobody told me about a restocking fee, that’s not fair.']]]
  ],
  Delivery: [
    ['Tracking stalled', [['customer', 'My tracking hasn’t updated since Monday.'], ['agent', 'The parcel is at the regional hub; there was a sorting delay. New ETA is Thursday.']]],
    ['Address change', [['customer', 'Can I change the delivery address? I’ll be at work.'], ['agent', 'Yes, I’ve verified your account. What address would you like to use?']]],
    ['Missed delivery', [['customer', 'Courier says I wasn’t home but I was!'], ['agent', 'I’m sorry about that. I can book a redelivery for tomorrow morning.']]]
  ],
  Product: [
    ['Compatibility', [['customer', 'Does the Smart Home Security System work with Google Assistant?'], ['agent', 'Yes, it works with Alexa, Google Assistant and Apple HomeKit over 2.4GHz WiFi.']]],
    ['Setup help', [['customer', 'The base station light keeps blinking orange.'], ['agent', 'That means it can’t reach WiFi. Let’s check it’s on the 2.4GHz network.']]],
    ['Spec question', [['customer', 'What’s the capacity of the blender jar?'], ['agent', 'It’s a 64oz BPA-free container with stainless steel blades.']]]
  ],
  Account: [
    ['Password reset', [['customer', 'The reset email never arrives.'], ['agent', 'I’ll resend it. Please also check your spam folder. Which email should I use?']]],
    ['2FA device lost', [['customer', 'I lost my phone with the authenticator app.'], ['agent', 'I can help recover access after verifying your identity with two methods.']]],
    ['Email update', [['customer', 'I need to change my account email.'], ['agent', 'Sure, first I’ll verify your identity with your order number and billing address.']]]
  ],
  Billing: [
    ['Payment failed', [['customer', 'My card keeps getting declined at checkout.'], ['agent', 'I can see the bank declined it. We can hold your cart for 24 hours while you try another method.']]],
    ['Invoice copy', [['customer', 'Can I get a GST invoice for my last order?'], ['agent', 'Of course, I’ve emailed the invoice to your registered address.']]],
    ['Unknown charge', [['customer', 'There’s a charge I don’t recognise on my statement.'], ['agent', 'Let me look up the transaction reference to identify it for you.']]]
  ]
};

function generatedActive(now, rand) {
  const queues = ['Refund', 'Refund', 'Delivery', 'Delivery', 'Delivery', 'Product', 'Product', 'Account', 'Account', 'Billing', 'Billing', 'Refund', 'Product', 'Delivery', 'Billing', 'Account'];
  return queues.map((queue, i) => {
    const [issue, turns] = SCRIPTS[queue][i % SCRIPTS[queue].length];
    const [region, cities] = REGIONS[Math.floor(rand() * REGIONS.length)];
    const name = `${FIRST[i]} ${LAST[(i * 7) % LAST.length]}`;
    const start = now - seconds(40 + Math.floor(rand() * 11 * 60));
    const upset = turns.length > 2;
    const tier = rand() > 0.85 ? 'VIP' : rand() > 0.6 ? 'Gold' : 'Standard';
    return {
      id: `conv-${84150 + i}`,
      caseNumber: String(84150 + i),
      customer: {
        id: `cust-${3100 + i}`, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, tier,
        tenureYears: Number((0.3 + rand() * 5).toFixed(1)), city: cities[i % 3], locale: 'EN-US',
        lifetimeValue: Math.round(8000 + rand() * 90000), orders: 2 + Math.floor(rand() * 30), returnRate: Number((rand() * 0.1).toFixed(3)), contactCount: 1
      },
      agent: QUEUE_AGENT[queue], queue, channel: rand() > 0.8 ? 'Mobile app' : 'Web chat', region, issue,
      refundValue: queue === 'Refund' ? Math.round(900 + rand() * 3500) : undefined,
      status: i % 7 === 3 ? 'waiting' : 'active',
      startTime: new Date(start),
      metrics: {
        sentiment: Number((upset ? 0.34 + rand() * 0.14 : 0.56 + rand() * 0.34).toFixed(2)),
        responseTime: Number((6 + rand() * 9).toFixed(1)),
        confidenceScore: Number((upset ? 0.7 + rand() * 0.1 : 0.8 + rand() * 0.17).toFixed(2))
      },
      messages: turns.map(([sender, text], k) => ({ sender, text, timestamp: new Date(start + seconds(k * (30 + Math.floor(rand() * 50)))) })),
      tags: [queue.toLowerCase(), issue.toLowerCase().replace(/\s+/g, '-')]
    };
  });
}

// Resolved history for the last 7 days: containment, handle time and CSAT are computed from these.
function resolvedHistory(now, rand) {
  const queues = Object.keys(QUEUE_AGENT);
  const out = [];
  for (let i = 0; i < 96; i++) {
    const queue = queues[i % queues.length];
    const [issue, turns] = SCRIPTS[queue][i % 3];
    const [region, cities] = REGIONS[i % REGIONS.length];
    const start = now - minutes(30 + Math.floor(rand() * 7 * 24 * 60));
    const handle = seconds(170 + Math.floor(rand() * 420)); // ~3–10 min, mean ≈ 6:15
    const human = rand() < 0.26;
    const name = `${FIRST[(i + 5) % FIRST.length]} ${LAST[(i * 3 + 1) % LAST.length]}`;
    out.push({
      id: `conv-${83000 + i}`,
      caseNumber: String(83000 + i),
      customer: { id: `cust-${4000 + i}`, name, tier: rand() > 0.9 ? 'VIP' : 'Standard', city: cities[i % 3], lifetimeValue: Math.round(5000 + rand() * 60000), orders: 1 + Math.floor(rand() * 20), returnRate: Number((rand() * 0.08).toFixed(3)), contactCount: 1 },
      agent: QUEUE_AGENT[queue], queue, channel: 'Web chat', region, issue,
      status: 'resolved', alertLevel: 'low',
      startTime: new Date(start), endTime: new Date(start + handle),
      metrics: {
        sentiment: Number((human ? 0.62 + rand() * 0.3 : 0.74 + rand() * 0.25).toFixed(2)),
        responseTime: Number((7 + rand() * 8).toFixed(1)),
        confidenceScore: Number((human ? 0.55 + rand() * 0.2 : 0.82 + rand() * 0.16).toFixed(2))
      },
      messages: [
        ...turns.slice(0, 2).map(([sender, text], k) => ({ sender, text, timestamp: new Date(start + seconds(k * 45)) })),
        ...(human ? [{ sender: 'supervisor', text: 'I’ve taken care of this for you personally, you’re all set.', timestamp: new Date(start + handle - seconds(30)) }] : [])
      ],
      tags: [queue.toLowerCase()],
      humanIntervention: human
        ? { occurred: true, active: false, supervisorId: 'supervisor-001', timestamp: new Date(start + handle / 2), releasedAt: new Date(start + handle - seconds(20)), notes: 'Resolved by supervisor' }
        : { occurred: false, active: false }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Templates (24, the library in the Template Governance Workspace)
// ---------------------------------------------------------------------------------------------

function buildTemplates(now) {
  const dayMs = 86400000;
  const T = (id, name, description, category, channels, content, variables, extra = {}) => ({
    id, name, description, category, channels, content, variables,
    createdBy: extra.createdBy || 'supervisor-001',
    isShared: extra.isShared ?? true,
    starred: !!extra.starred,
    usageCount: extra.usageCount || 0,
    lastUsedAt: extra.lastUsedDaysAgo !== undefined ? new Date(now - extra.lastUsedDaysAgo * dayMs) : undefined,
    ctaLabel: extra.ctaLabel,
    createdAt: new Date(now - (extra.ageDays || 30) * dayMs),
    updatedAt: new Date(now - (extra.updatedDaysAgo || 5) * dayMs)
  });

  return [
    T('template-001', 'Shipping Delay Apology', 'Apologise and confirm the new delivery date.', 'Shipping', ['Chat', 'Email'],
      "I apologize for the delay with your order #{{order_number}}. We're experiencing some delays in our shipping department, but your package is expected to arrive by {{expected_date}}. As a courtesy for the inconvenience, I've added a $10 credit to your account.",
      [{ name: 'order_number', description: "Customer's order number" }, { name: 'expected_date', description: 'Expected delivery date' }],
      { usageCount: 212, starred: true, lastUsedDaysAgo: 0.2, ageDays: 60 }),
    T('template-002', 'Return Process Instructions', 'Step-by-step return label guidance.', 'Returns', ['Chat', 'Email'],
      'To return your {{product_name}}, please follow these steps:\n1. Print the return label from your order history\n2. Pack the item in its original packaging if possible\n3. Attach the return label to the outside of the package\n4. Drop off at any {{carrier_name}} location\n\nYou should receive your refund within {{refund_days}} business days after we receive the return.',
      [{ name: 'product_name', description: 'Name of the product being returned' }, { name: 'carrier_name', description: 'Shipping carrier name' }, { name: 'refund_days', description: 'Number of days for refund processing' }],
      { usageCount: 156, lastUsedDaysAgo: 1, isShared: false }),
    T('template-003', 'Welcome new visitor', 'Friendly greeting with clear next steps.', 'Onboarding', ['Website'],
      '<p><strong>Welcome, {{user_name}} 👋</strong></p><p>Thanks for visiting {{company_name}}. I can help you get started or point you to the right product guide.</p>',
      [{ name: 'user_name', description: 'Visitor name' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 128, starred: true, lastUsedDaysAgo: 0.5, ctaLabel: 'View getting started' }),
    T('template-004', 'Product tour invite', 'Invite visitors to explore key features.', 'Onboarding', ['Messenger'],
      '<p><strong>Hi {{user_name}},</strong></p><p>Want a 2-minute tour of {{company_name}}? I’ll show you the features most customers love first.</p>',
      [{ name: 'user_name', description: 'Visitor name' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 84, lastUsedDaysAgo: 2, ctaLabel: 'Start the tour' }),
    T('template-005', 'Getting started checklist', 'Share a short first-session checklist.', 'Onboarding', ['Email'],
      '<p>Hi {{user_name}}, here’s a quick checklist to get the most out of {{company_name}}:</p><ol><li data-list="ordered">Complete your profile</li><li data-list="ordered">Save your delivery address</li><li data-list="ordered">Turn on order notifications</li></ol>',
      [{ name: 'user_name', description: 'Visitor name' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 61, lastUsedDaysAgo: 4 }),
    T('template-006', 'Trial follow-up', 'Guide visitors after trial activation.', 'Onboarding', ['Mobile'],
      '<p>Hi {{user_name}}, your trial is active. Reply here if you’d like help setting up your first order with {{company_name}}.</p>',
      [{ name: 'user_name', description: 'Visitor name' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 61, lastUsedDaysAgo: 6 }),
    T('template-007', 'Expedited refund approved', 'Confirm an approved refund override.', 'Billing', ['Chat'],
      'Hi {{user_name}}, I’ve reviewed the return evidence and approved an expedited refund of {{refund_amount}}. You’ll see it on your original payment method within 3–5 business days, and your case {{case_number}} is now closed.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'refund_amount', description: 'Approved refund amount' }, { name: 'case_number', description: 'Case reference' }],
      { usageCount: 97, starred: true, lastUsedDaysAgo: 0.1 }),
    T('template-008', 'Duplicate charge resolved', 'Confirm refund of a double charge.', 'Billing', ['Chat', 'Email'],
      'Hi {{user_name}}, I’ve confirmed the duplicate charge on order {{order_number}} and refunded it. You’ll receive an email with the transaction reference; funds typically arrive in 3–5 business days.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'order_number', description: 'Order number' }],
      { usageCount: 88, lastUsedDaysAgo: 0.8 }),
    T('template-009', 'Payment retry', 'Help a customer retry a declined payment.', 'Billing', ['Email'],
      'Hi {{user_name}}, your payment didn’t go through, but we’re holding your cart for 24 hours. You can retry with another card or UPI from your order page.',
      [{ name: 'user_name', description: 'Customer first name' }],
      { usageCount: 34, lastUsedDaysAgo: 9 }),
    T('template-010', 'Invoice copy', 'Send a copy of an invoice.', 'Billing', ['Email'],
      'Hi {{user_name}}, attached is the invoice for order {{order_number}}. Let me know if you need it in another format.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'order_number', description: 'Order number' }],
      { usageCount: 12, isShared: false }),
    T('template-011', 'Refund status update', 'Tell a customer where their refund is.', 'Billing', ['Chat'],
      'Hi {{user_name}}, your refund of {{refund_amount}} was issued on {{refund_date}}. Banks can take up to 5 business days to show it.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'refund_amount', description: 'Refund amount' }, { name: 'refund_date', description: 'Date the refund was issued' }],
      { usageCount: 73, lastUsedDaysAgo: 1.5 }),
    T('template-012', 'Order status update', 'Share live tracking with an ETA.', 'Transaction', ['Chat', 'Mobile'],
      'Hi {{user_name}}, order {{order_number}} is on its way and should arrive by {{expected_date}}. I’ve sent the live tracking link to your email.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'order_number', description: 'Order number' }, { name: 'expected_date', description: 'Expected delivery date' }],
      { usageCount: 141, lastUsedDaysAgo: 0.3 }),
    T('template-013', 'Delivery exception', 'Explain a carrier exception and next steps.', 'Shipping', ['Chat'],
      'Hi {{user_name}}, the carrier flagged an exception on your delivery. I’ve opened an investigation and arranged redelivery for {{expected_date}} at no cost.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'expected_date', description: 'Redelivery date' }],
      { usageCount: 66, lastUsedDaysAgo: 0.6 }),
    T('template-014', 'Damaged item replacement', 'Offer a replacement for items damaged in transit.', 'Returns', ['Chat'],
      'Hi {{user_name}}, I’m sorry your item arrived damaged. I’ve shipped a replacement with expedited delivery, no need to return the damaged one.',
      [{ name: 'user_name', description: 'Customer first name' }],
      { usageCount: 58, lastUsedDaysAgo: 3 }),
    T('template-015', 'Lost package investigation', 'Start a lost package investigation.', 'Shipping', ['Email'],
      'Hi {{user_name}}, I’ve opened a lost-package investigation for order {{order_number}}. It takes 3–5 business days; if the parcel is confirmed lost we’ll send a replacement right away.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'order_number', description: 'Order number' }],
      { usageCount: 29, lastUsedDaysAgo: 8, createdBy: 'supervisor-002' }),
    T('template-016', 'Account unlocked', 'Confirm identity check and unlock.', 'Engagement', ['Chat'],
      'Hi {{user_name}}, I’ve verified your identity and unlocked your account. A secure reset link is on its way to your email. We recommend turning on two-factor authentication.',
      [{ name: 'user_name', description: 'Customer first name' }],
      { usageCount: 47, lastUsedDaysAgo: 2 }),
    T('template-017', 'Password reset link', 'Send a secure password reset link.', 'Engagement', ['Email'],
      'Hi {{user_name}}, here’s your secure password reset link. It expires in 30 minutes.',
      [{ name: 'user_name', description: 'Customer first name' }],
      { usageCount: 52, lastUsedDaysAgo: 5, createdBy: 'supervisor-002' }),
    T('template-018', 'Feedback request', 'Ask for a rating after a resolved case.', 'Engagement', ['Email', 'Mobile'],
      'Thanks for contacting {{company_name}}, {{user_name}}. How did we do today? Your feedback helps us improve.',
      [{ name: 'company_name', description: 'Workspace' }, { name: 'user_name', description: 'Customer first name' }],
      { usageCount: 119, lastUsedDaysAgo: 0.9, ctaLabel: 'Rate this conversation' }),
    T('template-019', 'Loyalty upgrade', 'Congratulate a customer on a tier upgrade.', 'Engagement', ['Email'],
      'Congratulations {{user_name}}, you’re now a {{tier_name}} member of {{company_name}}. Enjoy free returns and priority support.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'tier_name', description: 'New loyalty tier' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 9, isShared: false }),
    T('template-020', 'Win-back offer', 'Re-engage a lapsed customer.', 'Engagement', ['Email'],
      'We miss you, {{user_name}}. Here’s 10% off your next order at {{company_name}}, valid for 14 days.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 7, createdBy: 'supervisor-003' }),
    T('template-021', 'Supervisor handoff', 'Introduce yourself when taking over from the AI.', 'Engagement', ['Chat'],
      'Hi {{user_name}}, I’m {{supervisor_name}}, a supervisor at {{company_name}}. I’ve read through your conversation and I’ll take it from here.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'supervisor_name', description: 'Your name' }, { name: 'company_name', description: 'Workspace' }],
      { usageCount: 101, starred: true, lastUsedDaysAgo: 0.05 }),
    T('template-022', 'Holiday return window', 'Explain the extended holiday return policy.', 'Returns', ['Website'],
      'Good news, {{user_name}}. Purchases made between November 1 and December 24 can be returned until January 31.',
      [{ name: 'user_name', description: 'Customer first name' }],
      { usageCount: 15, createdBy: 'supervisor-003' }),
    T('template-023', 'Warranty coverage', 'Explain what the warranty covers.', 'Engagement', ['Website'],
      'Hi {{user_name}}, your {{product_name}} is covered by a {{warranty_period}} manufacturer warranty for defects in materials and workmanship.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'product_name', description: 'Product' }, { name: 'warranty_period', description: 'Warranty length' }],
      { usageCount: 22, lastUsedDaysAgo: 12 }),
    T('template-024', 'Order cancellation confirmed', 'Confirm a cancellation before shipping.', 'Transaction', ['Chat', 'Email'],
      'Hi {{user_name}}, order {{order_number}} has been cancelled and a full refund issued to your original payment method.',
      [{ name: 'user_name', description: 'Customer first name' }, { name: 'order_number', description: 'Order number' }],
      { usageCount: 44, lastUsedDaysAgo: 2.5 })
  ];
}

function buildPresets(now) {
  return [
    {
      id: 'preset-holiday-cautious', name: 'Holiday peak: cautious', description: 'Low creativity and early escalation for high-volume weeks',
      sourceAgentId: 'agent-cs-3', createdBy: 'supervisor-001', createdAt: new Date(now - 20 * 86400000),
      config: {
        parameters: { temperature: 0.1, max_tokens: 150, top_p: 0.6, empathy: 0.85 },
        escalationThresholds: { lowConfidence: 0.7, negativeSentiment: 0.3, responseTime: 60, refundValue: 3000 }
      }
    },
    {
      id: 'preset-vip-white-glove', name: 'VIP white-glove', description: 'Maximum empathy, detailed replies, human for any exception',
      sourceAgentId: 'agent-cs-3', createdBy: 'supervisor-001', createdAt: new Date(now - 9 * 86400000),
      config: {
        parameters: { temperature: 0.2, max_tokens: 260, top_p: 0.7, empathy: 0.95 },
        escalationThresholds: { lowConfidence: 0.75, negativeSentiment: 0.35, responseTime: 45, refundValue: 2000 }
      }
    },
    {
      id: 'preset-night-autonomous', name: 'Night shift: autonomous', description: 'Fewer handoffs while the supervisor bench is thin',
      sourceAgentId: 'agent-cs-1', createdBy: 'supervisor-002', createdAt: new Date(now - 3 * 86400000),
      config: {
        parameters: { temperature: 0.3, max_tokens: 140, top_p: 0.8, empathy: 0.7 },
        escalationThresholds: { lowConfidence: 0.5, negativeSentiment: 0.2, responseTime: 180, refundValue: 8000 }
      }
    }
  ];
}

function buildActivities(now) {
  const ago = (s) => new Date(now - seconds(s));
  return [
    { type: 'qa', title: 'QA sample flagged', detail: 'Low empathy score • #84211', severity: 'info', timestamp: ago(420) },
    { type: 'deploy', title: 'Agent version routed', detail: 'CSR-Tech v4.3 • 20% traffic', severity: 'info', agentId: 'agent-cs-2', timestamp: ago(265) },
    { type: 'template', title: 'Template inserted', detail: 'Refund delay v3 • Marcus L.', severity: 'info', timestamp: ago(191) },
    { type: 'alert', title: 'SLA alert raised', detail: 'Returns • 9 conversations', severity: 'info', timestamp: ago(117) },
    { type: 'fallback', title: 'Knowledge fallback', detail: 'CSR-Returns • policy gap', severity: 'critical', agentId: 'agent-cs-3', timestamp: ago(30) },
    { type: 'takeover', title: 'Takeover approved', detail: 'Priya S. • by Neha P.', severity: 'critical', timestamp: ago(5) }
  ];
}

// 24h of 5-minute snapshots whose final point lines up with the live load.
function buildSnapshots(now, liveLoad, rand) {
  const points = [];
  const steps = 24 * 12;
  for (let i = steps; i >= 1; i--) {
    const ts = now - minutes(5 * i);
    const hour = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    const daily = 0.55 + 0.45 * Math.sin(((hour - 8) / 24) * Math.PI * 2); // peak mid-afternoon
    const trend = 1 - i / steps * 0.25;
    const forecast = Math.round(liveLoad * (0.7 + daily * 0.35) * trend);
    const activeLoad = Math.max(3, Math.round(forecast * (0.9 + rand() * 0.22)));
    const slaAtRisk = Math.max(0, Math.round(activeLoad * (0.22 + rand() * 0.14)));
    points.push({
      timestamp: new Date(ts),
      activeLoad,
      forecast,
      slaAtRisk,
      containment: Number((0.69 + rand() * 0.06 + (1 - i / steps) * 0.02).toFixed(3)),
      avgHandleSeconds: Math.round(400 + rand() * 60),
      avgResponseTime: Number((11 + rand() * 3).toFixed(1)),
      csat: Number((8.0 + rand() * 0.5).toFixed(1))
    });
  }
  return points;
}

function buildSeed(now = Date.now()) {
  const rand = mulberry32(20231010);
  const knowledgeBases = buildKnowledgeBases(now);
  const agents = buildAgents(knowledgeBases);
  const active = [...designConversations(now), ...briefConversations(now), ...generatedActive(now, rand)];
  const conversations = [...active, ...resolvedHistory(now, rand)];
  const liveLoad = active.filter((c) => c.status !== 'resolved').length;
  return {
    knowledgeBases,
    agents,
    conversations,
    templates: buildTemplates(now),
    presets: buildPresets(now),
    activities: buildActivities(now),
    snapshots: buildSnapshots(now, liveLoad, rand)
  };
}

module.exports = { SEED_VERSION, buildSeed, SCRIPTS, FIRST, LAST, REGIONS, QUEUE_AGENT, mulberry32 };
