// utils/templateUtils.js
// Template variables use the {{snake_case}} syntax from the API contract.
// The frontend mirrors this logic in src/utils/templates.js for live previews.

const { formatMoney } = require('./money');

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][\w]*)\s*\}\}/g;

function extractVariableNames(content = '') {
  const names = [];
  let match;
  VARIABLE_PATTERN.lastIndex = 0;
  while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

// Keep caller-supplied descriptions, add any variables found in content, drop ones that vanished.
function syncVariables(content, provided = []) {
  const byName = new Map((provided || []).filter((v) => v && v.name).map((v) => [v.name, v]));
  return extractVariableNames(content).map((name) => ({
    name,
    description: byName.get(name)?.description || humanize(name)
  }));
}

function humanize(name) {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Converts stored rich text into the plain text that is actually sent to a customer.
function toPlainText(content = '') {
  if (!/<[a-z][\s\S]*>/i.test(content)) return content;
  let listCounter = 0;
  return content
    .replace(/<ol[^>]*>/gi, () => { listCounter = 0; return ''; })
    .replace(/<li[^>]*data-list="ordered"[^>]*>/gi, () => `${++listCounter}. `)
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Substitute variables. Unresolved variables are left as {{name}} so the UI can flag them.
 */
function render(content, values = {}) {
  const resolved = [];
  const unresolved = [];
  const text = toPlainText(content).replace(VARIABLE_PATTERN, (whole, name) => {
    const value = values[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      if (!unresolved.includes(name)) unresolved.push(name);
      return whole;
    }
    if (!resolved.includes(name)) resolved.push(name);
    return String(value);
  });
  return { text, resolved, unresolved };
}

// Variables the platform can fill from conversation context
function contextValues(conversation, { companyName = 'ABC Company', supervisorName = 'Neha Prasad', currency = 'INR' } = {}) {
  if (!conversation) return { company_name: companyName, workspace: companyName, supervisor_name: supervisorName, agent_name: supervisorName };
  const fullName = conversation.customer?.name || '';
  const firstName = fullName.split(' ')[0] || '';
  const text = (conversation.messages || []).map((m) => m.text).join(' ');
  const order = text.match(/\b(ORD-[A-Z0-9-]+)\b/i) || text.match(/order\s*#?\s*(\d{5,})/i);
  return {
    customer_name: fullName,
    user_name: firstName,
    visitor_name: firstName,
    first_name: firstName,
    company_name: companyName,
    workspace: companyName,
    supervisor_name: supervisorName,
    agent_name: supervisorName,
    case_number: conversation.caseNumber ? `#${conversation.caseNumber}` : undefined,
    order_number: order ? order[1] : undefined,
    refund_amount: conversation.refundValue ? formatMoney(conversation.refundValue, currency) : undefined
  };
}

module.exports = { VARIABLE_PATTERN, extractVariableNames, syncVariables, toPlainText, render, contextValues, humanize };
