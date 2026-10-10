// src/utils/format.js
// Amounts are stored in INR (the design's currency). USD display uses a fixed demo rate.
export const INR_PER_USD = 83;

export function money(amountInr, currency = 'INR') {
  const v = Number(amountInr) || 0;
  if (currency === 'USD') return `$${Math.round(v / INR_PER_USD).toLocaleString('en-US')}`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

// ₹1.24L / ₹3.2Cr for INR, $1.5K / $2.3M for USD
export function compactMoney(amountInr, currency = 'INR') {
  const v = Number(amountInr) || 0;
  if (currency === 'USD') {
    const usd = v / INR_PER_USD;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
    if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
    return `$${Math.round(usd)}`;
  }
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

export const currencySymbol = (currency) => (currency === 'USD' ? '$' : '₹');
export const toDisplayCurrency = (amountInr, currency) => (currency === 'USD' ? Math.round(amountInr / INR_PER_USD) : Math.round(amountInr));
export const fromDisplayCurrency = (amount, currency) => (currency === 'USD' ? Math.round(amount * INR_PER_USD) : Math.round(amount));

export function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const hhmm = (date) => new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const hhmmss = (date) => new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function timeAgo(date, now = Date.now()) {
  const s = Math.floor((now - new Date(date).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Stored sentiment is 0..1; supervisors read a signed −1..1 scale (design shows −0.62).
export const signedSentiment = (s) => Number(((s ?? 0.5) * 2 - 1).toFixed(2));
export const fromSignedSentiment = (v) => Number(((Number(v) + 1) / 2).toFixed(3));
export const formatSigned = (v, digits = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export const pct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const firstInitial = (name = '') => (name.trim()[0] || '?').toUpperCase();
export const shortName = (name = '') => {
  const [a, b] = name.split(' ');
  return b ? `${a} ${b[0]}.` : a;
};
