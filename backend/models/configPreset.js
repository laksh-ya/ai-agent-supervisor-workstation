// models/configPreset.js
// A named snapshot of an agent's behaviour configuration that can be re-applied to any agent.
const mongoose = require('mongoose');

const configPresetSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  sourceAgentId: String,
  createdBy: String,
  config: {
    parameters: {
      temperature: Number,
      max_tokens: Number,
      top_p: Number,
      empathy: Number
    },
    capabilities: [{ id: String, enabled: Boolean, _id: false }],
    knowledgeBases: [{ id: String, enabled: Boolean, _id: false }],
    escalationThresholds: {
      lowConfidence: Number,
      negativeSentiment: Number,
      responseTime: Number,
      refundValue: Number
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('ConfigPreset', configPresetSchema);
