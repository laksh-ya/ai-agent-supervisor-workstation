// routes/intervene.js
const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const { simulateDelay } = require('../utils/helpers');
const svc = require('../services/conversationService');

// Take over a conversation from the AI agent
router.post('/', async (req, res, next) => {
  try {
    const { conversationId, supervisorId, notes } = req.body;

    if (!conversationId || !supervisorId) {
      return res.status(400).json({ message: 'Conversation ID and supervisor ID are required' });
    }

    const conversation = await Conversation.findOne({ id: conversationId });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const alreadyActive = conversation.humanIntervention?.active;
    conversation.humanIntervention = {
      occurred: true,
      active: true,
      supervisorId,
      timestamp: new Date(),
      notes: notes || ''
    };
    // "escalated" = a human owns the conversation; the AI stops replying
    conversation.status = 'escalated';
    conversation.endTime = undefined;

    if (!alreadyActive) {
      conversation.messages.push({ sender: 'system', text: `${svc.SUPERVISOR.name} took over from ${conversation.agent?.name || 'the AI agent'}`, timestamp: new Date() });
    }

    await svc.reassess(conversation);
    await conversation.save();
    await svc.emitConversation(conversation);

    if (!alreadyActive) {
      await svc.recordActivity({
        type: 'takeover', title: 'Takeover approved', severity: 'critical',
        detail: `${svc.shortName(conversation.customer?.name)} • by ${svc.SUPERVISOR.short}`,
        conversationId, agentId: conversation.agent?.id, actor: supervisorId
      });
    }

    await simulateDelay(200);

    res.json({
      message: 'Intervention recorded',
      intervention: conversation.humanIntervention
    });
  } catch (error) {
    next(error);
  }
});

// End intervention and return control to the agent, with guidance notes
router.post('/release', async (req, res, next) => {
  try {
    const { conversationId, supervisorNotes } = req.body;

    if (!conversationId) {
      return res.status(400).json({ message: 'Conversation ID is required' });
    }

    // Atomic compare-and-set on the active flag: only one release can win, so concurrent or
    // repeated releases (double click, retry, another tab) never append duplicate handoff notes.
    const conversation = await Conversation.findOneAndUpdate(
      { id: conversationId, 'humanIntervention.active': true },
      { $set: { 'humanIntervention.active': false, 'humanIntervention.releasedAt': new Date(), status: 'active' } },
      { new: true }
    );

    if (!conversation) {
      const existing = await Conversation.findOne({ id: conversationId }, { humanIntervention: 1 }).lean();
      if (!existing) return res.status(404).json({ message: 'Conversation not found' });
      if (!existing.humanIntervention?.occurred) return res.status(400).json({ message: 'No active intervention to release' });
      return res.status(409).json({ message: 'Control has already been returned to the AI agent' });
    }

    if (supervisorNotes) {
      conversation.supervisorNotes = supervisorNotes;
    }
    conversation.messages.push({
      sender: 'system',
      text: supervisorNotes
        ? `Control returned to ${conversation.agent?.name || 'AI agent'} with guidance: “${supervisorNotes}”`
        : `Control returned to ${conversation.agent?.name || 'AI agent'}`,
      timestamp: new Date()
    });
    conversation.markModified('humanIntervention');

    await svc.reassess(conversation);
    await conversation.save();
    await svc.emitConversation(conversation);
    await svc.recordActivity({
      type: 'release', title: 'Returned to AI',
      detail: `${svc.shortName(conversation.customer?.name)} • ${conversation.agent?.name || 'agent'} resumed`,
      conversationId, agentId: conversation.agent?.id, actor: svc.SUPERVISOR.id
    });

    await simulateDelay(200);

    res.json({ message: 'Intervention released, control returned to agent' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
