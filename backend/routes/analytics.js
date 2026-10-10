// routes/analytics.js
const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');

const STREAM_INTERVAL_MS = 2000;

const wrap = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    next(error);
  }
};

// Everything the supervisor dashboard renders, in one round trip
// ?range=30m|2h|24h|7d&region=<region|all>
router.get('/dashboard', wrap((req) => analytics.dashboard({ range: req.query.range, region: req.query.region })));

// Server-Sent Events: dashboard metrics pushed every 2 seconds.
// Complements the WebSocket (which carries per-conversation events); EventSource reconnects on its own.
router.get('/stream', (req, res) => {
  const range = req.query.range || '30m';
  const region = req.query.region || 'all';

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  let seq = 0;
  let busy = false;
  let closed = false;

  const push = async () => {
    if (busy || closed) return; // never queue up if a computation overruns the interval
    busy = true;
    try {
      const { queue, ...metrics } = await analytics.dashboard({ range, region });
      if (!closed) res.write(`id: ${++seq}\nevent: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
    } catch (err) {
      if (!closed) res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    } finally {
      busy = false;
    }
  };

  push();
  const timer = setInterval(push, STREAM_INTERVAL_MS);
  req.on('close', () => {
    closed = true;
    clearInterval(timer);
  });
});

// Contract endpoints — ?timeRange=today|week|month|year
router.get('/overview', wrap((req) => analytics.overview({ timeRange: req.query.timeRange })));
router.get('/agents', wrap((req) => analytics.agentsAnalytics({ timeRange: req.query.timeRange, agentId: req.query.agentId })));
router.get('/issues', wrap((req) => analytics.issues({ timeRange: req.query.timeRange })));

// Alias of /overview
router.get('/', wrap((req) => analytics.overview({ timeRange: req.query.timeRange })));

module.exports = router;
