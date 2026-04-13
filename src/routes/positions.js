'use strict';

const express = require('express');
const router  = express.Router();
const store   = require('../store');

// GET /api/positions — list all positions (optionally filtered)
router.get('/', (req, res) => {
  const { messageId, userId } = req.query;
  let positions;

  if (messageId) {
    positions = store.getPositions(messageId);
  } else if (userId) {
    positions = store.getUserPositions(userId);
  } else {
    // Return all positions by aggregating across all messages
    const msgs = store.getAllMessages();
    const seen = new Set();
    positions = [];
    for (const m of msgs) {
      const ps = store.getPositions(m.id);
      for (const p of ps) {
        if (!seen.has(p.id)) { seen.add(p.id); positions.push(p); }
      }
    }
  }

  res.json(positions);
});

// POST /api/positions — take a position on a message
router.post('/', (req, res) => {
  const { userId, messageId, type, stake } = req.body;

  if (!userId || !messageId || !type) {
    return res.status(400).json({ error: 'userId, messageId and type are required' });
  }

  try {
    const position = store.takePosition({ userId, messageId, type, stake: stake || 0 });
    res.status(201).json(position);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
