// routes/agents.js
const express = require('express');
const router = express.Router();
const Agent = require('../models/agent');
const KnowledgeBase = require('../models/knowledgeBase');
const { simulateDelay } = require('../utils/helpers');
const svc = require('../services/conversationService');
const analytics = require('../services/analytics');
const evaluation = require('../services/evaluation');
const hub = require('../websocket/hub');

const RANGES = {
  temperature: [0, 1],
  top_p: [0, 1],
  empathy: [0, 1],
  max_tokens: [16, 4000],
  lowConfidence: [0, 1],
  negativeSentiment: [0, 1],
  responseTime: [5, 3600],
  refundValue: [0, 10000000]
};

function validateConfig({ parameters, escalationThresholds, capabilities, knowledgeBases }) {
  const errors = [];
  const check = (group, obj) => Object.entries(obj || {}).forEach(([key, value]) => {
    if (!RANGES[key]) return;
    const n = Number(value);
    const [min, max] = RANGES[key];
    if (!Number.isFinite(n) || n < min || n > max) errors.push(`${group}.${key} must be between ${min} and ${max}`);
  });
  check('parameters', parameters);
  check('escalationThresholds', escalationThresholds);
  [['capabilities', capabilities], ['knowledgeBases', knowledgeBases]].forEach(([name, list]) => {
    if (list !== undefined && (!Array.isArray(list) || list.some((i) => !i || typeof i.id !== 'string'))) {
      errors.push(`${name} must be an array of { id, enabled }`);
    }
  });
  return errors;
}

function configOf(agent) {
  const a = typeof agent.toObject === 'function' ? agent.toObject() : agent;
  return {
    version: a.version,
    parameters: a.parameters,
    capabilities: (a.capabilities || []).map(({ id, enabled }) => ({ id, enabled })),
    knowledgeBases: (a.knowledgeBases || []).map(({ id, enabled }) => ({ id, enabled })),
    escalationThresholds: a.escalationThresholds
  };
}

function bumpVersion(version = 'v1.0') {
  const m = /^v(\d+)\.(\d+)$/.exec(version);
  return m ? `v${m[1]}.${Number(m[2]) + 1}` : `${version}.1`;
}

function clean(agent) {
  const out = typeof agent.toObject === 'function' ? agent.toObject() : { ...agent };
  delete out._id;
  delete out.__v;
  return out;
}

// Get all agents
router.get('/', async (req, res, next) => {
  try {
    const agents = await Agent.find().sort({ id: 1 }).lean();
    await simulateDelay(100);
    res.json(agents.map(clean));
  } catch (error) {
    next(error);
  }
});

// Get a specific agent
router.get('/:id', async (req, res, next) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).lean();
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    await simulateDelay(100);
    res.json(clean(agent));
  } catch (error) {
    next(error);
  }
});

// Update agent configuration.
// Body (contract): { parameters, capabilities, knowledgeBases, escalationThresholds }
// Optional: { changeRequest: { notes } } deploys it as a new governed version.
router.patch('/:id/config', async (req, res, next) => {
  try {
    const { parameters, capabilities, knowledgeBases, escalationThresholds, changeRequest } = req.body;
    const errors = validateConfig(req.body);
    if (errors.length) return res.status(400).json({ message: 'Invalid configuration', errors });

    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const before = configOf(agent);
    const changed = [];

    if (parameters) {
      Object.entries(parameters).forEach(([k, v]) => {
        if (RANGES[k] && Number(agent.parameters?.[k]) !== Number(v)) changed.push(`parameters.${k}`);
      });
      agent.parameters = { ...agent.toObject().parameters, ...parameters };
    }

    if (capabilities) {
      capabilities.forEach((cap) => {
        const existing = agent.capabilities.find((c) => c.id === cap.id);
        if (existing && existing.enabled !== !!cap.enabled) {
          existing.enabled = !!cap.enabled;
          changed.push(`capabilities.${cap.id}`);
        }
      });
    }

    if (knowledgeBases) {
      knowledgeBases.forEach((kb) => {
        const existing = agent.knowledgeBases.find((k) => k.id === kb.id);
        if (existing && existing.enabled !== !!kb.enabled) {
          existing.enabled = !!kb.enabled;
          changed.push(`knowledgeBases.${kb.id}`);
        }
      });
    }

    if (escalationThresholds) {
      Object.entries(escalationThresholds).forEach(([k, v]) => {
        if (RANGES[k] && Number(agent.escalationThresholds?.[k]) !== Number(v)) changed.push(`escalationThresholds.${k}`);
      });
      agent.escalationThresholds = { ...agent.toObject().escalationThresholds, ...escalationThresholds };
    }

    let deployment = null;
    if (changeRequest && changed.length) {
      agent.changeRequestSeq = (agent.changeRequestSeq || 1841) + 1;
      const oldVersion = agent.version;
      const newVersion = bumpVersion(oldVersion);
      agent.previous = before;
      agent.version = newVersion;
      agent.routing = (agent.routing || []).map((r) => {
        const row = r.toObject ? r.toObject() : r;
        return row.model === oldVersion ? { ...row, model: newVersion, failover: row.failover === 'Human' ? 'Human' : oldVersion } : row;
      });
      deployment = {
        id: `CR-${agent.changeRequestSeq}`,
        fieldsChanged: changed,
        notes: changeRequest.notes || '',
        from: oldVersion,
        to: newVersion,
        owner: svc.SUPERVISOR.name,
        deployedAt: new Date()
      };
    }

    agent.markModified('parameters');
    agent.markModified('escalationThresholds');
    await agent.save();
    svc.invalidateAgents();

    const data = clean(agent);
    hub.broadcast('agent_update', { agentId: agent.id, data }, { channel: 'agents', agentId: agent.id });

    if (deployment) {
      await svc.recordActivity({
        type: 'deploy', title: 'Agent version routed',
        detail: `${agent.name} ${deployment.to} • ${deployment.id} • ${changed.length} field${changed.length === 1 ? '' : 's'}`,
        agentId: agent.id, actor: svc.SUPERVISOR.id
      });
    }

    await simulateDelay(200);

    res.json({ message: 'Agent configuration updated', agent: data, changed, deployment });
  } catch (error) {
    next(error);
  }
});

// Get agent performance metrics (contract)
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).lean();
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    const metrics = agent.metrics || { conversations: 0, avgResponseTime: 0, satisfaction: 0, escalationRate: 0, topIssues: [] };
    await simulateDelay(100);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// Performance & guardrails panel (range: 24h | 7d)
router.get('/:id/performance', async (req, res, next) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json(await analytics.agentPerformance(agent, req.query.range || '7d'));
  } catch (error) {
    next(error);
  }
});

// Run the evaluation suite against the live config or a draft supplied in the body
router.post('/:id/evaluate', async (req, res, next) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const catalog = await KnowledgeBase.find().lean();
    const config = { ...configOf(agent), ...(req.body?.config || {}) };
    const result = evaluation.runSuite(config, catalog);
    if (!req.body?.config) {
      agent.evaluation = result;
      await agent.save();
    }
    await simulateDelay(900);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Latest stored evaluation (computed on the fly when none has been run yet)
router.get('/:id/evaluation', async (req, res, next) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (agent.evaluation?.results?.length) return res.json(agent.evaluation);
    res.json(evaluation.runSuite(configOf(agent), await KnowledgeBase.find().lean()));
  } catch (error) {
    next(error);
  }
});

// Simulation console: replay a scenario against a config (draft or live), optionally the previous version too
router.post('/:id/simulate', async (req, res, next) => {
  try {
    const agent = await Agent.findOne({ id: req.params.id }).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    const { index = 17, config, compare = false, currency } = req.body || {};
    const current = { ...configOf(agent), ...(config || {}) };
    const result = { current: evaluation.simulate(current, index, { versionLabel: agent.version, currency }) };
    if (compare && agent.previous) {
      const prev = {
        ...configOf(agent),
        ...agent.previous,
        parameters: { ...agent.parameters, ...(agent.previous.parameters || {}) },
        escalationThresholds: { ...agent.escalationThresholds, ...(agent.previous.escalationThresholds || {}) }
      };
      result.previous = evaluation.simulate(prev, index, { versionLabel: agent.previous.version, currency });
    }
    await simulateDelay(500);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
