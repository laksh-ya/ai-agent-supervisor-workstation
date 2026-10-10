// models/agent.js
const mongoose = require('mongoose');

const capabilitySchema = new mongoose.Schema({
  id: String,
  name: String,
  description: String,
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const knowledgeBaseSchema = new mongoose.Schema({
  id: String,
  name: String,
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const routeSchema = new mongoose.Schema({
  intent: String,
  model: String,
  tier: String,
  traffic: Number,
  failover: String
}, { _id: false });

const agentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  version: { type: String, default: 'v1.0' },
  description: String,
  parameters: {
    temperature: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 1
    },
    max_tokens: {
      type: Number,
      default: 150
    },
    top_p: {
      type: Number,
      default: 1.0
    },
    // Persona controls surfaced in the Control Room (0..1)
    empathy: { type: Number, default: 0.7, min: 0, max: 1 }
  },
  capabilities: [capabilitySchema],
  knowledgeBases: [knowledgeBaseSchema],
  escalationThresholds: {
    lowConfidence: Number,
    negativeSentiment: Number,
    responseTime: Number,
    refundValue: Number
  },
  routing: [routeSchema],
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  metrics: {
    conversations: Number,
    avgResponseTime: Number,
    satisfaction: Number,
    escalationRate: Number,
    containment: Number,
    fallbackRate: Number,
    hallucinationRate: Number,
    topIssues: [{
      name: String,
      count: Number,
      _id: false
    }]
  },
  // Same shape as `metrics`, for the preceding period (drives the ± deltas)
  metricsPrevious: mongoose.Schema.Types.Mixed,
  evaluation: {
    ranAt: Date,
    scenarios: Number,
    results: [{ id: String, name: String, score: Number, status: String, _id: false }]
  },
  // Snapshot of the configuration that was live before the current version ("Compare v4.2")
  previous: mongoose.Schema.Types.Mixed,
  changeRequestSeq: { type: Number, default: 1841 }
}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);
