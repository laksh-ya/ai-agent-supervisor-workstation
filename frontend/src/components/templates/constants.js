// Colours from the Template Governance Workspace design
export const JOURNEYS = [
  { id: 'Onboarding', dot: '#7a5af8', bg: '#f1edff', fg: '#6246c8' },
  { id: 'Billing', dot: '#53b1fd', bg: '#edf7ff', fg: '#3172a5' },
  { id: 'Engagement', dot: '#36b37e', bg: '#f3faf7', fg: '#257a54' },
  { id: 'Transaction', dot: '#fb7185', bg: '#fff1f3', fg: '#b4415a' }
];

// Operational categories named in the template requirement ("shipping, returns, etc.")
export const CATEGORIES = [
  { id: 'Shipping', dot: '#f59e0b', bg: '#fff3df', fg: '#9a641d' },
  { id: 'Returns', dot: '#0ea5e9', bg: '#e8f6fd', fg: '#1f6f98' }
];

export const DEFAULT_CATEGORIES = [...JOURNEYS.map((j) => j.id), ...CATEGORIES.map((c) => c.id)];

export const CHANNELS = [
  { id: 'Chat', dot: '#514184', bg: '#f4f1f8', fg: '#514184' },
  { id: 'Email', dot: '#f59e0b', bg: '#fff3df', fg: '#9a641d' },
  { id: 'Website', dot: '#64748b', bg: '#edf7ff', fg: '#3172a5' },
  { id: 'Mobile', dot: '#0ea5e9', bg: '#edf7ff', fg: '#3172a5' },
  { id: 'Messenger', dot: '#8b5cf6', bg: '#f3faf7', fg: '#257a54' }
];

// Card thumbnail tints (skeleton illustration) keyed by primary channel
export const THUMBS = {
  Website: { bg: '#f8f7fc', dot: '#d9d1ff', line: '#ddd8ee' },
  Chat: { bg: '#f8f7fc', dot: '#d9d1ff', line: '#ddd8ee' },
  Messenger: { bg: '#f5faff', dot: '#c9e8ff', line: '#d6e4f2' },
  Email: { bg: '#fff9f1', dot: '#ffd9a8', line: '#f1e2cc' },
  Mobile: { bg: '#f3faf7', dot: '#bfe6d2', line: '#d3e8dd' }
};

export const POPULAR_MIN = 80;
export const LOW_USE_MAX = 20;

export const journeyStyle = (id) => [...JOURNEYS, ...CATEGORIES].find((j) => j.id.toLowerCase() === String(id).toLowerCase())
  || { id, dot: '#9ca3af', bg: '#f4f1f8', fg: '#615879' };
export const channelStyle = (id) => CHANNELS.find((c) => c.id === id) || { id, dot: '#9ca3af', bg: '#f4f1f8', fg: '#615879' };

// Which template journeys fit which conversation queue (for "Suggested")
export const QUEUE_JOURNEYS = {
  Refund: ['Returns', 'Billing', 'Transaction'],
  Billing: ['Billing'],
  Delivery: ['Shipping', 'Transaction'],
  Account: ['Engagement'],
  Product: ['Engagement', 'Onboarding']
};
