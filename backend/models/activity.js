// models/activity.js
// Supervisor feed: decisions, handoffs and model events.
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['takeover', 'release', 'fallback', 'alert', 'template', 'deploy', 'qa', 'resolved', 'override', 'escalation', 'preset'],
    required: true
  },
  title: { type: String, required: true },
  detail: String,
  severity: { type: String, enum: ['critical', 'info'], default: 'info' },
  conversationId: String,
  agentId: String,
  actor: String,
  timestamp: { type: Date, default: Date.now }
});

activitySchema.index({ timestamp: -1 });

module.exports = mongoose.model('Activity', activitySchema);
