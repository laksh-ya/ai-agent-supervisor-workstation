// models/responseTemplate.js
const mongoose = require('mongoose');

const responseTemplateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  // Short subtitle shown on library cards ("Title" in the editor)
  description: String,
  // Journey the template belongs to (Onboarding, Billing, …). Free-form so API
  // clients can use their own categories such as "shipping" or "returns".
  category: {
    type: String,
    required: true
  },
  channels: { type: [String], default: ['Chat'] },
  // Rich text: sanitized HTML (or plain text) with {{variable}} placeholders
  content: {
    type: String,
    required: true
  },
  variables: [{
    name: String,
    description: String,
    _id: false
  }],
  ctaLabel: String,
  createdBy: String,
  isShared: {
    type: Boolean,
    default: false
  },
  starred: { type: Boolean, default: false },
  usageCount: { type: Number, default: 0 },
  lastUsedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('ResponseTemplate', responseTemplateSchema);
