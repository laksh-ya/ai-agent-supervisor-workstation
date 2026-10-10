// websocket/hub.js
// Tracks connected supervisor clients and fans out real-time events to them.
const WebSocket = require('ws');

const clients = new Set();

function register(ws) {
  ws.subscriptions = new Map(); // channel -> parameters
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

function subscribe(ws, channel, parameters = {}) {
  ws.subscriptions.set(channel, parameters || {});
}

// A client with no subscriptions receives everything (no subscription means no filter).
function wants(ws, channel, meta) {
  if (!channel || ws.subscriptions.size === 0) return true;
  if (!ws.subscriptions.has(channel)) return false;
  const params = ws.subscriptions.get(channel);
  if (params.agentId && meta.agentId && params.agentId !== meta.agentId) return false;
  return true;
}

/**
 * @param {string} type event type, e.g. 'message_update'
 * @param {object} payload fields merged into the event
 * @param {object} [meta] { channel, agentId } used for subscription filtering
 */
function broadcast(type, payload = {}, meta = {}) {
  const message = JSON.stringify({ type, ...payload, timestamp: new Date() });
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && wants(ws, meta.channel, meta)) {
      ws.send(message);
    }
  });
}

module.exports = { register, subscribe, broadcast, clientCount: () => clients.size };
