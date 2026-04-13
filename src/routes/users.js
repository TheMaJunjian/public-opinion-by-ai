'use strict';

const express = require('express');
const router  = express.Router();
const store   = require('../store');

// GET /api/users — list all users
router.get('/', (req, res) => {
  res.json(store.getAllUsers());
});

// GET /api/users/:id — get one user
router.get('/:id', (req, res) => {
  const user = store.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// GET /api/users/:id/positions — get all positions taken by a user
router.get('/:id/positions', (req, res) => {
  const user = store.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(store.getUserPositions(req.params.id));
});

// POST /api/users — create a new user
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const user = store.createUser(name);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/users/:id/points — manually award/deduct points (admin/oracle use)
router.post('/:id/points', (req, res) => {
  const { delta } = req.body;
  if (delta === undefined) return res.status(400).json({ error: 'delta is required' });

  try {
    const user = store.updatePoints(req.params.id, Number(delta));
    res.json(user);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
