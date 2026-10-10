// websocket/socketHandler.js
// Per-connection protocol. Traffic simulation lives in services/simulator.js and is shared
// by all clients; this handler only registers the socket, answers subscriptions and
// sends the initial snapshot described in the API documentation.
const hub = require('./hub');
const analytics = require('../services/analytics');

const PING_MS = 30000;

module.exports = (ws) => {
  hub.register(ws);

  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to Agent Supervisor WebSocket server',
    timestamp: new Date()
  }));

  // Initial snapshot of live conversations (API doc: conversations_update)
  analytics.liveConversations()
    .then((data) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ type: 'conversations_update', data, timestamp: new Date() }));
    })
    .catch((err) => console.error('[ws] snapshot failed:', err.message));

  ws.isAlive = true;
  const pingInterval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.send(JSON.stringify({ type: 'ping', timestamp: new Date() }));
  }, PING_MS);

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw);
      switch (message.type) {
        case 'subscribe':
          hub.subscribe(ws, message.channel, message.parameters);
          ws.send(JSON.stringify({
            type: 'subscription_confirmation',
            channel: message.channel,
            message: `Subscribed to ${message.channel}`,
            timestamp: new Date()
          }));
          break;
        case 'pong':
          ws.isAlive = true;
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('[ws] bad message:', error.message);
    }
  });

  ws.on('close', () => clearInterval(pingInterval));
  ws.on('error', () => clearInterval(pingInterval));
};
