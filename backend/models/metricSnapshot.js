// models/metricSnapshot.js
// Point-in-time rollups used for trend charts and KPI deltas.
const mongoose = require('mongoose');

const metricSnapshotSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true },
  activeLoad: Number,
  forecast: Number,
  slaAtRisk: Number,
  containment: Number,
  avgHandleSeconds: Number,
  avgResponseTime: Number,
  csat: Number
});

metricSnapshotSchema.index({ timestamp: -1 });

module.exports = mongoose.model('MetricSnapshot', metricSnapshotSchema);
