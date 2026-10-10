// routes/system.js — supervisor feed, global search and runtime controls
const express = require('express');
const router = express.Router();
const Activity = require('../models/activity');
const Conversation = require('../models/conversation');
const Agent = require('../models/agent');
const ResponseTemplate = require('../models/responseTemplate');
const simulator = require('../services/simulator');
const hub = require('../websocket/hub');
const { seedDatabase } = require('../utils/seed');
const svc = require('../services/conversationService');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Live supervisor feed
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const items = await Activity.find().sort({ timestamp: -1 }).limit(limit).lean();
    res.json(items.map(({ __v, ...a }) => a));
  } catch (error) {
    next(error);
  }
});

// Header search across conversations, agents and templates
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().replace(/^#/, '');
    if (q.length < 2) return res.json({ conversations: [], agents: [], templates: [] });
    const rx = new RegExp(escapeRegex(q), 'i');
    const [conversations, agents, templates] = await Promise.all([
      Conversation.find({ $or: [{ 'customer.name': rx }, { caseNumber: rx }, { tags: rx }, { issue: rx }] }, { messages: 0 })
        .sort({ status: 1, startTime: -1 }).limit(6).lean(),
      Agent.find({ $or: [{ name: rx }, { description: rx }, { id: rx }] }).limit(4).lean(),
      ResponseTemplate.find({ $or: [{ name: rx }, { description: rx }, { category: rx }] }).limit(4).lean()
    ]);
    res.json({
      conversations: conversations.map((c) => ({ id: c.id, caseNumber: c.caseNumber, customer: c.customer?.name, issue: c.issue, status: c.status, alertLevel: c.alertLevel, queue: c.queue })),
      agents: agents.map((a) => ({ id: a.id, name: a.name, version: a.version, status: a.status })),
      templates: templates.map((t) => ({ id: t.id, name: t.name, category: t.category }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/system/status', (req, res) => {
  res.json({ simulation: simulator.isRunning(), clients: hub.clientCount(), supervisor: svc.SUPERVISOR });
});

router.post('/system/simulation', (req, res) => {
  if (req.body?.enabled) simulator.start();
  else simulator.stop();
  hub.broadcast('system_update', { data: { simulation: simulator.isRunning() } });
  res.json({ simulation: simulator.isRunning() });
});

// Restore the demo dataset (Settings → "Reset demo data")
router.post('/system/reset', async (req, res, next) => {
  try {
    await seedDatabase({ log: () => {} });
    svc.invalidateAgents();
    svc.invalidateTemplates();
    hub.broadcast('system_update', { data: { reset: true } });
    res.json({ message: 'Demo data restored' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
