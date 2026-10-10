// src/local/index.js
// Browser data source. When REACT_APP_DATA_SOURCE=browser the app has no server to talk to, so
// the three transports it uses (REST through axios, the WebSocket and the SSE metrics stream) are
// answered in the page from an in-memory copy of the dataset. Application code is unchanged: it
// still calls the same endpoints and receives the same payloads and events.
import api from '../api';
import { hub, seed } from './state';
import { handle } from './routes';
import * as analytics from './analytics';
import * as simulator from './simulator';

const STREAM_INTERVAL_MS = 2000;
// Dates leave the server as ISO strings; a JSON round trip gives the same wire format and a deep copy
const wire = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const parse = (value) => {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
};

function adapter(config) {
  const url = new URL(`${config.baseURL || ''}${config.url}`, window.location.origin);
  const query = { ...Object.fromEntries(url.searchParams), ...Object.fromEntries(Object.entries(config.params || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])) };
  const result = handle(String(config.method || 'get').toUpperCase(), url.pathname, query, parse(config.data));

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const response = { data: wire(result.data), status: result.status, statusText: result.status < 400 ? 'OK' : 'Error', headers: {}, config, request: {} };
      if (result.status < 400) return resolve(response);
      const error = new Error(`Request failed with status code ${result.status}`);
      error.response = response;
      error.config = config;
      return reject(error);
    }, result.delay);
  });
}

class LocalSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    setTimeout(() => this.open(), 80);
  }

  open() {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    hub.add(this);
    if (this.onopen) this.onopen({ type: 'open' });
    this.deliver(JSON.stringify({ type: 'connection', message: 'Connected to Agent Supervisor WebSocket server', timestamp: new Date() }));
    // Initial snapshot of live conversations
    this.deliver(JSON.stringify({ type: 'conversations_update', data: analytics.liveConversations(), timestamp: new Date() }));
  }

  deliver(frame) {
    setTimeout(() => {
      if (this.readyState === 1 && this.onmessage) this.onmessage({ type: 'message', data: frame });
    }, 0);
  }

  send() {}

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    hub.remove(this);
    setTimeout(() => { if (this.onclose) this.onclose({ type: 'close', code: 1000 }); }, 0);
  }
}

class LocalEventSource {
  constructor(url) {
    const params = new URL(url, window.location.origin).searchParams;
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onerror = null;
    this.listeners = new Map();
    this.seq = 0;
    this.query = { range: params.get('range') || '30m', region: params.get('region') || 'all' };
    this.starter = setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen({ type: 'open' });
      this.push();
      this.timer = setInterval(() => this.push(), STREAM_INTERVAL_MS);
    }, 60);
  }

  push() {
    const { queue, ...metrics } = analytics.dashboard(this.query);
    const event = { type: 'metrics', data: JSON.stringify(metrics), lastEventId: String(++this.seq) };
    (this.listeners.get('metrics') || []).forEach((listener) => listener(event));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((l) => l !== listener));
  }

  close() {
    clearTimeout(this.starter);
    clearInterval(this.timer);
    this.readyState = 2;
  }
}

export function install() {
  seed();
  analytics.captureSnapshot();
  simulator.start();

  api.defaults.adapter = adapter;

  // The development server keeps its own hot-reload socket on /ws; everything else is the app's
  const NativeSocket = window.WebSocket;
  function Socket(url, protocols) {
    return NativeSocket && /\/ws(\?|$)/.test(String(url)) ? new NativeSocket(url, protocols) : new LocalSocket(url);
  }
  Object.assign(Socket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = Socket;
  window.EventSource = LocalEventSource;
}
