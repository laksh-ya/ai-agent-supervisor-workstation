// routes/templates.js — Response Templates (the "twist" requirement)
const express = require('express');
const router = express.Router();
const ResponseTemplate = require('../models/responseTemplate');
const Conversation = require('../models/conversation');
const { generateId } = require('../utils/helpers');
const { syncVariables, render, contextValues } = require('../utils/templateUtils');
const svc = require('../services/conversationService');
const hub = require('../websocket/hub');

const EDITABLE = ['name', 'description', 'category', 'channels', 'content', 'variables', 'ctaLabel', 'isShared', 'starred'];

// Strip anything that is not simple formatting. Templates are rendered as HTML in previews.
function sanitize(html = '') {
  return String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function clean(t) {
  const out = typeof t.toObject === 'function' ? t.toObject() : { ...t };
  delete out._id;
  delete out.__v;
  return out;
}

function broadcast(type, data) {
  svc.invalidateTemplates();
  hub.broadcast(type, { data }, { channel: 'templates' });
}

// List templates. Contract: ?shared=true|false. Additive: q, category, channel, scope=team|recent, sort
router.get('/', async (req, res, next) => {
  try {
    const { shared, q, category, channel, scope, sort = 'usage' } = req.query;
    const filter = {};
    if (shared === 'true' || shared === 'false') filter.isShared = shared === 'true';
    if (scope === 'team') filter.isShared = true;
    if (scope === 'recent') filter.lastUsedAt = { $gte: new Date(Date.now() - 14 * 86400000) };
    if (category) filter.category = new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (channel) filter.channels = channel;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { description: rx }, { content: rx }, { category: rx }, { channels: rx }];
    }
    const order = {
      usage: { usageCount: -1, name: 1 },
      recent: { lastUsedAt: -1, updatedAt: -1 },
      updated: { updatedAt: -1 },
      name: { name: 1 }
    }[sort] || { usageCount: -1 };
    const templates = await ResponseTemplate.find(filter).sort(order).lean();
    res.json(templates.map(clean));
  } catch (error) {
    next(error);
  }
});

// Create template
router.post('/', async (req, res, next) => {
  try {
    const { name, category, content } = req.body;
    if (!name || !String(name).trim() || !category || !content || !String(content).trim()) {
      return res.status(400).json({ message: 'name, category and content are required' });
    }
    const body = Object.fromEntries(Object.entries(req.body).filter(([k]) => EDITABLE.includes(k)));
    body.content = sanitize(body.content);
    body.variables = syncVariables(body.content, body.variables);
    if (body.channels && !Array.isArray(body.channels)) body.channels = [body.channels];

    const template = await ResponseTemplate.create({
      ...body,
      name: String(name).trim(),
      id: generateId('template'),
      createdBy: req.body.createdBy || svc.SUPERVISOR.id
    });
    const data = clean(template);
    broadcast('template_created', data);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

// Get template
router.get('/:id', async (req, res, next) => {
  try {
    const template = await ResponseTemplate.findOne({ id: req.params.id }).lean();
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(clean(template));
  } catch (error) {
    next(error);
  }
});

// Update template
router.patch('/:id', async (req, res, next) => {
  try {
    const template = await ResponseTemplate.findOne({ id: req.params.id });
    if (!template) return res.status(404).json({ message: 'Template not found' });

    EDITABLE.forEach((key) => {
      if (req.body[key] !== undefined) template[key] = req.body[key];
    });
    if (req.body.name !== undefined && !String(req.body.name).trim()) {
      return res.status(400).json({ message: 'name cannot be empty' });
    }
    if (req.body.content !== undefined) template.content = sanitize(template.content);
    if (req.body.content !== undefined || req.body.variables !== undefined) {
      template.variables = syncVariables(template.content, req.body.variables || template.variables);
    }
    if (template.channels && !Array.isArray(template.channels)) template.channels = [template.channels];

    await template.save();
    const data = clean(template);
    broadcast('template_updated', data);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Delete template
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await ResponseTemplate.deleteOne({ id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ message: 'Template not found' });
    broadcast('template_deleted', { id: req.params.id });
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Server-side variable substitution (for API clients; the UI previews live)
// Body: { conversationId?, variables?: { name: value } }
router.post('/:id/render', async (req, res, next) => {
  try {
    const template = await ResponseTemplate.findOne({ id: req.params.id }).lean();
    if (!template) return res.status(404).json({ message: 'Template not found' });
    const conversation = req.body.conversationId ? await Conversation.findOne({ id: req.body.conversationId }).lean() : null;
    const values = { ...contextValues(conversation), ...(req.body.variables || {}) };
    res.json({ templateId: template.id, ...render(template.content, values) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
