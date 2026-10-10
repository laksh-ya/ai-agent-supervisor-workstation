// models/conversation.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    // 'system' marks handoff events (take over / return to AI) inside the transcript
    enum: ['customer', 'agent', 'supervisor', 'system'],
    required: true
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Set when a supervisor message was produced from a response template
  templateId: String
});

const conversationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  caseNumber: String,
  customer: {
    id: String,
    name: String,
    email: String,
    tier: { type: String, default: 'Standard' },
    tenureYears: Number,
    city: String,
    locale: { type: String, default: 'EN-US' },
    lifetimeValue: Number,
    orders: Number,
    returnRate: Number,
    contactCount: { type: Number, default: 1 }
  },
  agent: {
    id: String,
    name: String
  },
  queue: { type: String, default: 'General' },
  channel: { type: String, default: 'Web chat' },
  region: { type: String, default: 'North America' },
  issue: String,
  refundValue: Number,
  status: {
    type: String,
    enum: ['active', 'waiting', 'resolved', 'escalated'],
    default: 'active'
  },
  alertLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  alertReasons: [String],
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: Date,
  metrics: {
    sentiment: Number,
    responseTime: Number,
    confidenceScore: Number
  },
  messages: [messageSchema],
  tags: [String],
  supervisorNotes: String,
  feedback: {
    notes: String,
    rating: Number,
    updatedAt: Date
  },
  humanIntervention: {
    occurred: {
      type: Boolean,
      default: false
    },
    active: {
      type: Boolean,
      default: false
    },
    supervisorId: String,
    timestamp: Date,
    releasedAt: Date,
    notes: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
