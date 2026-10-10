// Mapping between API parameters and the Control Room's behaviour controls
import { money, formatSigned } from '../../utils/format';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const speedFromTokens = (t) => clamp((400 - (t ?? 150)) / 300);
export const tokensFromSpeed = (s) => Math.round(400 - clamp(s) * 300);
export const stabilityFromTemperature = (t) => clamp(1 - (t ?? 0.7));
export const temperatureFromStability = (s) => Number((1 - clamp(s)).toFixed(2));

export const speedLabel = (s) => (s < 0.34 ? 'Measured' : s < 0.67 ? 'Balanced' : 'Fast');
export const empathyLabel = (e) => (e < 0.34 ? 'Neutral' : e < 0.67 ? 'Warm' : 'High');

export function configFromAgent(agent) {
  if (!agent) return null;
  return {
    parameters: {
      temperature: agent.parameters?.temperature ?? 0.7,
      max_tokens: agent.parameters?.max_tokens ?? 150,
      top_p: agent.parameters?.top_p ?? 1,
      empathy: agent.parameters?.empathy ?? 0.6
    },
    capabilities: (agent.capabilities || []).map(({ id, enabled }) => ({ id, enabled })),
    knowledgeBases: (agent.knowledgeBases || []).map(({ id, enabled }) => ({ id, enabled })),
    escalationThresholds: {
      responseTime: agent.escalationThresholds?.responseTime ?? 90,
      negativeSentiment: agent.escalationThresholds?.negativeSentiment ?? 0.3,
      refundValue: agent.escalationThresholds?.refundValue ?? 5000,
      lowConfidence: agent.escalationThresholds?.lowConfidence ?? 0.6
    }
  };
}

export const PARAM_LABELS = {
  temperature: 'Temperature',
  max_tokens: 'Max tokens',
  top_p: 'Top-p',
  empathy: 'Empathy'
};
export const THRESHOLD_LABELS = {
  responseTime: 'No agent response',
  negativeSentiment: 'Customer sentiment',
  refundValue: 'Refund value',
  lowConfidence: 'Confidence score'
};

export function formatThreshold(key, v, currency) {
  if (key === 'responseTime') return `${Math.round(v)} sec`;
  if (key === 'negativeSentiment') return `≤ ${formatSigned(v * 2 - 1)}`;
  if (key === 'refundValue') return `≥ ${money(v, currency)}`;
  return `≤ ${Number(v).toFixed(2)}`;
}

function fmtParam(key, v) {
  return key === 'max_tokens' ? String(Math.round(v)) : Number(v).toFixed(2);
}

/** Field-level diff between live and draft configurations */
export function diffConfig(live, draft, agent, currency) {
  if (!live || !draft) return [];
  const out = [];
  Object.keys(PARAM_LABELS).forEach((k) => {
    if (Number(live.parameters[k]) !== Number(draft.parameters[k])) {
      out.push({ key: `parameters.${k}`, group: 'Parameters', label: PARAM_LABELS[k], from: fmtParam(k, live.parameters[k]), to: fmtParam(k, draft.parameters[k]), raw: [live.parameters[k], draft.parameters[k]] });
    }
  });
  const named = (list, id) => list.find((x) => x.id === id)?.name || id;
  draft.capabilities.forEach((c) => {
    const was = live.capabilities.find((x) => x.id === c.id);
    if (was && was.enabled !== c.enabled) out.push({ key: `capabilities.${c.id}`, group: 'Capabilities', label: named(agent.capabilities, c.id), from: was.enabled ? 'On' : 'Off', to: c.enabled ? 'On' : 'Off', raw: [was.enabled, c.enabled] });
  });
  draft.knowledgeBases.forEach((k) => {
    const was = live.knowledgeBases.find((x) => x.id === k.id);
    if (was && was.enabled !== k.enabled) out.push({ key: `knowledgeBases.${k.id}`, group: 'Knowledge', label: named(agent.knowledgeBases, k.id), from: was.enabled ? 'On' : 'Off', to: k.enabled ? 'On' : 'Off', raw: [was.enabled, k.enabled] });
  });
  Object.keys(THRESHOLD_LABELS).forEach((k) => {
    if (Number(live.escalationThresholds[k]) !== Number(draft.escalationThresholds[k])) {
      out.push({ key: `escalationThresholds.${k}`, group: 'Escalation', label: THRESHOLD_LABELS[k], from: formatThreshold(k, live.escalationThresholds[k], currency), to: formatThreshold(k, draft.escalationThresholds[k], currency), raw: [live.escalationThresholds[k], draft.escalationThresholds[k]] });
    }
  });
  return out;
}

/** Change risk: loosening guardrails or adding autonomy is riskier than tightening them */
export function changeRisk(diff) {
  if (!diff.length) return { level: 'None', tone: 'neutral' };
  let score = 0;
  diff.forEach((d) => {
    const [a, b] = d.raw;
    if (d.key === 'parameters.temperature') score += b > a ? (b - a) * 10 : 0.5;
    else if (d.key === 'parameters.top_p') score += b > a ? (b - a) * 6 : 0.3;
    else if (d.key.startsWith('parameters')) score += 0.5;
    else if (d.key === 'escalationThresholds.refundValue') score += b > a ? 2 : 0.3;
    else if (d.key === 'escalationThresholds.responseTime') score += b > a ? 1.5 : 0.3;
    else if (d.key === 'escalationThresholds.lowConfidence' || d.key === 'escalationThresholds.negativeSentiment') score += b < a ? 1.5 : 0.3;
    else if (d.key.startsWith('capabilities')) score += b ? 1.5 : 0.8;
    else if (d.key.startsWith('knowledgeBases')) score += b ? 0.5 : 1.5;
  });
  if (score >= 5) return { level: 'High', tone: 'red' };
  if (score >= 2) return { level: 'Moderate', tone: 'amber' };
  return { level: 'Low', tone: 'green' };
}
