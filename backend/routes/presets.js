// routes/presets.js — saved agent configuration presets
const express = require('express');
const router = express.Router();
const ConfigPreset = require('../models/configPreset');
const Agent = require('../models/agent');
const { generateId } = require('../utils/helpers');
const svc = require('../services/conversationService');
const hub = require('../websocket/hub');

function clean(p) {
  const out = typeof p.toObject === 'function' ? p.toObject() : { ...p };
  delete out._id;
  delete out.__v;
  return out;
}

router.get('/', async (req, res, next) => {
  try {
    const presets = await ConfigPreset.find().sort({ createdAt: -1 }).lean();
    res.json(presets.map(clean));
  } catch (error) {
    next(error);
  }
});

// Body: { name, description?, sourceAgentId?, config: { parameters, capabilities, knowledgeBases, escalationThresholds } }
router.post('/', async (req, res, next) => {
  try {
    const { name, description, sourceAgentId, config } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'name is required' });
    if (!config || typeof config !== 'object') return res.status(400).json({ message: 'config is required' });
    const exists = await ConfigPreset.findOne({ name: String(name).trim() });
    if (exists) return res.status(409).json({ message: 'A preset with this name already exists' });

    const preset = await ConfigPreset.create({
      id: generateId('preset'),
      name: String(name).trim(),
      description,
      sourceAgentId,
      createdBy: svc.SUPERVISOR.id,
      config: {
        parameters: config.parameters,
        capabilities: (config.capabilities || []).map(({ id, enabled }) => ({ id, enabled })),
        knowledgeBases: (config.knowledgeBases || []).map(({ id, enabled }) => ({ id, enabled })),
        escalationThresholds: config.escalationThresholds
      }
    });
    const data = clean(preset);
    hub.broadcast('preset_created', { data }, { channel: 'presets' });
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await ConfigPreset.deleteOne({ id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ message: 'Preset not found' });
    hub.broadcast('preset_deleted', { data: { id: req.params.id } }, { channel: 'presets' });
    res.json({ message: 'Preset deleted' });
  } catch (error) {
    next(error);
  }
});

// Apply directly to an agent (the Control Room instead loads presets into the draft for review)
router.post('/:id/apply', async (req, res, next) => {
  try {
    const { agentId } = req.body;
    const preset = await ConfigPreset.findOne({ id: req.params.id }).lean();
    if (!preset) return res.status(404).json({ message: 'Preset not found' });
    const agent = await Agent.findOne({ id: agentId });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const { parameters, capabilities, knowledgeBases, escalationThresholds } = preset.config || {};
    if (parameters) agent.parameters = { ...agent.toObject().parameters, ...Object.fromEntries(Object.entries(parameters).filter(([, v]) => v !== undefined && v !== null)) };
    (capabilities || []).forEach((c) => { const x = agent.capabilities.find((y) => y.id === c.id); if (x) x.enabled = c.enabled; });
    (knowledgeBases || []).forEach((k) => { const x = agent.knowledgeBases.find((y) => y.id === k.id); if (x) x.enabled = k.enabled; });
    if (escalationThresholds) agent.escalationThresholds = { ...agent.toObject().escalationThresholds, ...Object.fromEntries(Object.entries(escalationThresholds).filter(([, v]) => v !== undefined && v !== null)) };
    agent.markModified('parameters');
    agent.markModified('escalationThresholds');
    await agent.save();
    svc.invalidateAgents();

    await svc.recordActivity({ type: 'preset', title: 'Preset applied', detail: `${preset.name} • ${agent.name}`, agentId: agent.id, actor: svc.SUPERVISOR.id });
    const data = agent.toObject();
    delete data._id;
    hub.broadcast('agent_update', { agentId: agent.id, data }, { channel: 'agents', agentId: agent.id });
    res.json({ message: 'Preset applied', agent: data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
