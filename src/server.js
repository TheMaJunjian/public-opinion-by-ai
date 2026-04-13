'use strict';

const express = require('express');
const path    = require('path');
const cors    = require('cors');
const store   = require('./store');

const messagesRouter  = require('./routes/messages');
const usersRouter     = require('./routes/users');
const positionsRouter = require('./routes/positions');
const wagersRouter    = require('./routes/wagers');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/messages',  messagesRouter);
app.use('/api/users',     usersRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/wagers',    wagersRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Seed demo data on startup (unless running in test mode)
if (process.env.NODE_ENV !== 'test') {
  store.seed();
  console.log('Demo data seeded.');
}

// Start server only when run directly (not when required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`公论 server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
