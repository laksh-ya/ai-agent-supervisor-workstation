// src/utils/templates.js
// Mirrors backend/utils/templateUtils.js — {{snake_case}} variables.
import { money } from './format';

export const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][\w]*)\s*\}\}/g;

export function extractVariables(content = '') {
  const names = [];
  const rx = new RegExp(VARIABLE_PATTERN.source, 'g');
  let m;
  while ((m = rx.exec(content)) !== null) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

export const humanizeVariable = (name) => name.replace(/_/g, ' ');

export const isRichText = (content = '') => /<[a-z][\s\S]*>/i.test(content);

export function toPlainText(content = '') {
  if (!isRichText(content)) return content;
  const doc = new DOMParser().parseFromString(content, 'text/html');
  const out = [];
  const walk = (node, ctx) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) { out.push(child.textContent); return; }
      const tag = child.tagName;
      if (tag === 'BR') { out.push('\n'); return; }
      if (tag === 'OL' || tag === 'UL') { walk(child, { list: tag, n: 0 }); return; }
      if (tag === 'LI') {
        ctx.n = (ctx.n || 0) + 1;
        const ordered = ctx.list === 'OL' && child.getAttribute('data-list') !== 'bullet';
        out.push(ordered ? `${ctx.n}. ` : '• ');
        walk(child, ctx);
        out.push('\n');
        return;
      }
      walk(child, ctx);
      if (['P', 'DIV', 'H1', 'H2', 'H3'].includes(tag)) out.push('\n');
    });
  };
  walk(doc.body, {});
  return out.join('').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * @returns {{ text, resolved: string[], unresolved: string[] }}
 * Unresolved variables are left as {{name}} so the composer can highlight them.
 */
export function renderTemplate(content, values = {}) {
  const resolved = [];
  const unresolved = [];
  const text = toPlainText(content).replace(new RegExp(VARIABLE_PATTERN.source, 'g'), (whole, name) => {
    const v = values[name];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (!unresolved.includes(name)) unresolved.push(name);
      return whole;
    }
    if (!resolved.includes(name)) resolved.push(name);
    return String(v);
  });
  return { text, resolved, unresolved };
}

/** Same substitution but keeps rich formatting (for the preview bubble). */
export function renderRich(content, values = {}) {
  const html = isRichText(content) ? content : `<p>${escapeHtml(content).replace(/\n/g, '<br/>')}</p>`;
  return html.replace(new RegExp(VARIABLE_PATTERN.source, 'g'), (whole, name) => {
    const v = values[name];
    if (v === undefined || v === null || String(v).trim() === '') {
      return `<span class="tpl-var tpl-var--missing" title="Unresolved: ${name}">&lt;${humanizeVariable(name)}&gt;</span>`;
    }
    return `<span class="tpl-var tpl-var--filled" title="{{${name}}}">${escapeHtml(String(v))}</span>`;
  });
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Variables the workstation can fill automatically from a live conversation
export function conversationValues(conversation, { currency = 'INR', companyName = 'ABC Company', supervisorName = 'Neha Prasad' } = {}) {
  if (!conversation) return {};
  const fullName = conversation.customer?.name || '';
  const first = fullName.split(' ')[0];
  const text = (conversation.messages || []).map((m) => m.text).join(' ');
  const order = text.match(/\b(ORD-[A-Z0-9-]+)\b/i) || text.match(/order\s*#?\s*(\d{5,})/i);
  return {
    customer_name: fullName,
    user_name: first,
    visitor_name: first,
    first_name: first,
    company_name: companyName,
    workspace: companyName,
    supervisor_name: supervisorName,
    agent_name: supervisorName,
    case_number: conversation.caseNumber ? `#${conversation.caseNumber}` : undefined,
    order_number: order ? order[1] : undefined,
    refund_amount: conversation.refundValue ? money(conversation.refundValue, currency) : undefined,
    tier_name: conversation.customer?.tier
  };
}

// "Preview as" personas for the template library (no conversation context)
export const PERSONAS = [
  { id: 'new', label: 'New visitor', values: { user_name: 'Avery', visitor_name: 'Avery', first_name: 'Avery', customer_name: 'Avery Collins', company_name: 'Acme', workspace: 'Acme' } },
  { id: 'returning', label: 'Returning customer', values: { user_name: 'Jordan', first_name: 'Jordan', customer_name: 'Jordan Reyes', company_name: 'Acme', workspace: 'Acme', order_number: 'ORD-48213-QXT', expected_date: 'Friday, 3 Oct', product_name: 'Eco-Friendly Blender', carrier_name: 'BlueDart', refund_days: '5' } },
  { id: 'vip', label: 'VIP customer', values: { user_name: 'Priya', first_name: 'Priya', customer_name: 'Priya Sharma', company_name: 'Acme', workspace: 'Acme', tier_name: 'Platinum', refund_amount: '₹12,400', case_number: '#84102' } }
];

export function variableLabel(name, template) {
  const v = (template?.variables || []).find((x) => x.name === name);
  return v?.description || humanizeVariable(name);
}
