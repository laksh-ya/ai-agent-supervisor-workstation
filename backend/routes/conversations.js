// routes/conversations.js
const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const ResponseTemplate = require('../models/responseTemplate');
const { simulateDelay } = require('../utils/helpers');
const { recommend } = require('../services/copilot');
const svc = require('../services/conversationService');
const hub = require('../websocket/hub');
const { calculateSentiment } = require('../mockLlmApi');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Get all conversations with pagination and filtering
// Contract params: page, limit, status, alertLevel, agentId
// Additive params: q (name/case/tag search), queue, region, sort=risk|recent, view=summary
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, alertLevel, agentId, q, queue, region, sort = 'recent', view } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 10));

    const filter = {};
    if (status) filter.status = status.includes(',') ? { $in: status.split(',') } : status;
    if (alertLevel) filter.alertLevel = alertLevel.includes(',') ? { $in: alertLevel.split(',') } : alertLevel;
    if (agentId) filter['agent.id'] = agentId;
    if (queue) filter.queue = queue;
    if (region) filter.region = region;
    if (q) {
      const rx = new RegExp(escapeRegex(q.trim().replace(/^#/, '')), 'i');
      filter.$or = [{ 'customer.name': rx }, { caseNumber: rx }, { tags: rx }, { issue: rx }, { id: rx }];
    }

    const projection = view === 'summary' ? { messages: { $slice: -1 } } : {};
    let data;
    const total = await Conversation.countDocuments(filter);

    if (sort === 'risk') {
      // Risk is computed, so rank in memory (the live set is small) then paginate
      const docs = await Conversation.find(filter, projection).lean();
      const presented = await svc.presentMany(docs, { summary: view === 'summary' });
      presented.sort((a, b) => b.risk.score - a.risk.score);
      data = presented.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    } else {
      const docs = await Conversation.find(filter, projection)
        .sort({ startTime: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();
      data = await svc.presentMany(docs, { summary: view === 'summary' });
    }

    await simulateDelay(150);

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get a specific conversation by ID
router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    await simulateDelay(100);
    res.json(await svc.present(conversation));
  } catch (error) {
    next(error);
  }
});

// Co-pilot recommendation for the supervisor
router.get('/:id/copilot', async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({ id: req.params.id }).lean();
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    const agent = (await svc.agentsById()).get(conversation.agent?.id);
    res.json(recommend(conversation, agent, { currency: req.query.currency === 'USD' ? 'USD' : 'INR' }));
  } catch (error) {
    next(error);
  }
});

// Record a supervisor decision on the co-pilot recommendation (approve | escalate)
router.post('/:id/copilot/decision', async (req, res, next) => {
  try {
    const { decision, actionLabel } = req.body || {};
    if (!['approve', 'escalate'].includes(decision)) return res.status(400).json({ message: 'decision must be approve or escalate' });
    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const tag = decision === 'approve' ? 'override-approved' : 'policy-escalated';
    conversation.tags = [...new Set([...(conversation.tags || []), tag])];
    if (decision === 'escalate' && conversation.status !== 'resolved') conversation.status = 'escalated';
    await svc.reassess(conversation);
    await conversation.save();
    await svc.emitConversation(conversation);
    await svc.recordActivity({
      type: decision === 'approve' ? 'override' : 'escalation',
      title: decision === 'approve' ? (actionLabel || 'Override approved') : 'Policy escalated',
      detail: `${svc.shortName(conversation.customer?.name)} • by ${svc.SUPERVISOR.short}`,
      severity: decision === 'approve' ? 'info' : 'critical',
      conversationId: conversation.id,
      agentId: conversation.agent?.id,
      actor: svc.SUPERVISOR.id
    });
    res.json({ message: 'Decision recorded', tags: conversation.tags });
  } catch (error) {
    next(error);
  }
});

// Add a message to a conversation
router.post('/:id/messages', async (req, res, next) => {
  try {
    const { sender, text, templateId } = req.body;

    if (!sender || !text || !String(text).trim()) {
      return res.status(400).json({ message: 'Sender and text are required' });
    }
    if (!['customer', 'agent', 'supervisor', 'system'].includes(sender)) {
      return res.status(400).json({ message: 'Invalid sender' });
    }

    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const newMessage = { sender, text: String(text).trim(), timestamp: new Date() };
    if (templateId) newMessage.templateId = templateId;
    conversation.messages.push(newMessage);

    if (sender === 'customer') {
      const s = calculateSentiment(newMessage.text).score;
      const prev = conversation.metrics?.sentiment ?? 0.5;
      conversation.metrics.sentiment = Number(Math.max(0.05, Math.min(0.98, prev * 0.65 + s * 0.35)).toFixed(2));
      conversation.markModified('metrics');
    }
    // A supervisor reply re-opens a conversation that had been marked resolved
    if (sender === 'supervisor' && conversation.status === 'resolved') {
      conversation.status = conversation.humanIntervention?.active ? 'escalated' : 'active';
      conversation.endTime = undefined;
    }

    await svc.reassess(conversation);
    await conversation.save();

    const saved = conversation.messages[conversation.messages.length - 1].toObject();
    delete saved._id;

    hub.broadcast('message_update', { conversationId: conversation.id, message: saved }, { channel: 'conversations', agentId: conversation.agent?.id });
    await svc.emitConversation(conversation);

    if (templateId) {
      const template = await ResponseTemplate.findOneAndUpdate({ id: templateId }, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } }, { new: true });
      if (template) {
        svc.invalidateTemplates();
        await svc.recordActivity({ type: 'template', title: 'Template inserted', detail: `${template.name} • ${svc.shortName(conversation.customer?.name)}`, conversationId: conversation.id, actor: svc.SUPERVISOR.id });
        hub.broadcast('template_updated', { data: { id: template.id, usageCount: template.usageCount, lastUsedAt: template.lastUsedAt } }, { channel: 'templates' });
      }
    }

    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

// Update conversation status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'waiting', 'resolved', 'escalated'];

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const previous = conversation.status;
    conversation.status = status;

    if (status === 'resolved') {
      conversation.endTime = new Date();
      // Resolving closes any open takeover
      if (conversation.humanIntervention?.active) {
        conversation.humanIntervention.active = false;
        conversation.humanIntervention.releasedAt = new Date();
      }
    } else if (previous === 'resolved') {
      conversation.endTime = undefined;
    }

    await svc.reassess(conversation);
    await conversation.save();
    await svc.emitConversation(conversation);

    if (status === 'resolved' && previous !== 'resolved') {
      await svc.recordActivity({ type: 'resolved', title: 'Case resolved', detail: `${svc.shortName(conversation.customer?.name)} • by ${svc.SUPERVISOR.short}`, conversationId: conversation.id, actor: svc.SUPERVISOR.id });
    } else if (status === 'escalated' && previous !== 'escalated') {
      await svc.recordActivity({ type: 'escalation', title: 'Policy escalated', detail: `${svc.shortName(conversation.customer?.name)} • to Ops Governance`, severity: 'critical', conversationId: conversation.id, actor: svc.SUPERVISOR.id });
    }

    res.json({ message: 'Status updated', status });
  } catch (error) {
    next(error);
  }
});

// Add tags to a conversation
router.post('/:id/tags', async (req, res, next) => {
  try {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ message: 'Tags array is required' });
    }

    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const cleaned = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    conversation.tags = [...new Set([...(conversation.tags || []), ...cleaned])];
    await conversation.save();
    await svc.emitConversation(conversation);

    res.json({ message: 'Tags added', tags: conversation.tags });
  } catch (error) {
    next(error);
  }
});

// Supervisor feedback on the agent's handling (the "Feedback Notes" panel)
router.put('/:id/feedback', async (req, res, next) => {
  try {
    const { notes = '', rating } = req.body;
    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const hadNotes = !!conversation.feedback?.notes;
    conversation.feedback = {
      notes: String(notes).slice(0, 4000),
      rating: rating === undefined ? conversation.feedback?.rating : rating,
      updatedAt: new Date()
    };
    await conversation.save();

    if (!hadNotes && conversation.feedback.notes.trim()) {
      await svc.recordActivity({ type: 'qa', title: 'Agent feedback logged', detail: `${conversation.agent?.name} • ${svc.shortName(conversation.customer?.name)}`, conversationId: conversation.id, agentId: conversation.agent?.id, actor: svc.SUPERVISOR.id });
    }
    hub.broadcast('feedback_updated', { conversationId: conversation.id, feedback: conversation.feedback }, { channel: 'conversations' });
    res.json({ message: 'Feedback saved', feedback: conversation.feedback });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
