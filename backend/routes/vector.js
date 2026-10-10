// routes/vector.js — Vector Database API.
// Backed by the mock retriever so it works without Qdrant; run vectorDbSetup.js to index
// the knowledge base into a real Qdrant instance when one is available.
const express = require('express');
const router = express.Router();
const KnowledgeBase = require('../models/knowledgeBase');
const { retrieveKnowledge } = require('../mockLlmApi');

router.post('/search', (req, res) => {
  const { query, knowledgeBases, limit = 3 } = req.body || {};
  if (!query) return res.status(400).json({ message: 'query is required' });
  const results = retrieveKnowledge(query, knowledgeBases, Math.min(10, Number(limit) || 3))
    .map(({ text, source, section, relevance }) => ({ text, source, section, relevance }));
  res.json({ results });
});

router.get('/kb/:id', async (req, res, next) => {
  try {
    const kb = await KnowledgeBase.findOne({ id: req.params.id }).lean();
    if (!kb) return res.status(404).json({ message: 'Knowledge base not found' });
    const entries = retrieveKnowledge(kb.name, [kb.id], 20);
    const content = [`# ${kb.name}`, '', kb.description || '', '', ...entries.map((e) => `## ${e.section.split(' > ').pop()}\n\n${e.text}`)].join('\n');
    res.json({ id: kb.id, name: kb.name, content });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
