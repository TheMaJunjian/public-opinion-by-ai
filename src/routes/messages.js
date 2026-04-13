'use strict';

const express = require('express');
const router  = express.Router();
const store   = require('../store');
const ai      = require('../services/ai');

// GET /api/messages — list all messages
router.get('/', (req, res) => {
  const { tag, type, authorId } = req.query;
  let messages = store.getAllMessages();

  if (tag)      messages = messages.filter(m => m.tags.includes(tag));
  if (type)     messages = messages.filter(m => m.type === type);
  if (authorId) messages = messages.filter(m => m.authorId === authorId);

  res.json(messages);
});

// GET /api/messages/graph — export graph structure
router.get('/graph', (req, res) => {
  res.json(store.getGraph());
});

// GET /api/messages/:id — get one message
router.get('/:id', (req, res) => {
  const msg = store.getMessage(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  res.json(msg);
});

// GET /api/messages/:id/thread — get the discussion thread rooted here
router.get('/:id/thread', (req, res) => {
  try {
    const thread = store.getThread(req.params.id);
    res.json(thread);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/messages/:id/positions — get all positions on a message
router.get('/:id/positions', (req, res) => {
  const msg = store.getMessage(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  res.json(store.getPositions(req.params.id));
});

// POST /api/messages — create a new message
router.post('/', async (req, res) => {
  const { authorId, content, references, type, relationType, tags } = req.body;

  if (!authorId || !content) {
    return res.status(400).json({ error: 'authorId and content are required' });
  }

  try {
    // Auto-categorize if no tags provided
    let resolvedTags = tags;
    if (!resolvedTags || resolvedTags.length === 0) {
      resolvedTags = await ai.categorizeMessage(content);
    }

    const msg = store.createMessage({
      authorId,
      content,
      references: references || [],
      type:       type || 'message',
      relationType,
      tags:       resolvedTags,
    });
    res.status(201).json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/messages/:id — edit message content
router.patch('/:id', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  try {
    const msg = store.editMessage(req.params.id, content);
    res.json(msg);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/messages/:id/summarize — AI-summarize a thread
router.post('/:id/summarize', async (req, res) => {
  try {
    const thread  = store.getThread(req.params.id);
    const summary = await ai.summarizeThread(thread);

    // Cache summary on the root message
    const root = store.getMessage(req.params.id);
    if (root) root.aiSummary = summary;

    res.json({ summary, threadLength: thread.length });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/messages/cluster — cluster messages by topic
router.post('/cluster', async (req, res) => {
  const messages = store.getAllMessages();
  const clusters = await ai.clusterMessages(messages);
  res.json(clusters);
});

module.exports = router;
