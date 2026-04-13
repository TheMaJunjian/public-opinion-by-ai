'use strict';

const express = require('express');
const router  = express.Router();
const store   = require('../store');

// GET /api/wagers — list all wagers
router.get('/', (req, res) => {
  const { messageId, status } = req.query;
  let wagers = store.getAllWagers();

  if (messageId) wagers = wagers.filter(w => w.messageId === messageId);
  if (status)    wagers = wagers.filter(w => w.status === status);

  res.json(wagers);
});

// GET /api/wagers/:id — get one wager
router.get('/:id', (req, res) => {
  const wager = store.getWager(req.params.id);
  if (!wager) return res.status(404).json({ error: 'Wager not found' });
  res.json(wager);
});

// POST /api/wagers — create a wager
router.post('/', (req, res) => {
  const { messageId, creatorId, prediction, amount, resolvesAt } = req.body;

  if (!messageId || !creatorId || prediction === undefined || !amount) {
    return res.status(400).json({
      error: 'messageId, creatorId, prediction and amount are required',
    });
  }

  try {
    const wager = store.createWager({ messageId, creatorId, prediction, amount, resolvesAt });
    res.status(201).json(wager);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/wagers/:id/join — join an existing wager with the opposing view
router.post('/:id/join', (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount) {
    return res.status(400).json({ error: 'userId and amount are required' });
  }

  try {
    const wager = store.joinWager({ wagerId: req.params.id, userId, amount });
    res.json(wager);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/wagers/:id/resolve — resolve a wager (oracle / moderator action)
router.post('/:id/resolve', (req, res) => {
  const { outcome } = req.body;
  if (outcome === undefined) return res.status(400).json({ error: 'outcome is required' });

  try {
    const wager = store.resolveWager({ wagerId: req.params.id, outcome: Boolean(outcome) });
    res.json(wager);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
