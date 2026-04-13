'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * In-memory data store for the 公论 (Public Discourse) platform.
 *
 * Core entities:
 *   - Message : a node in the non-linear graph (content + references to other messages)
 *   - User    : a participant with contribution points
 *   - Position: a stance (support / oppose / signup) taken on a message
 *   - Wager   : a bet placed on whether a claim will be proven true
 */

// --------------------------------------------------------------------------
// Data containers
// --------------------------------------------------------------------------
const store = {
  messages: new Map(),   // id → Message
  users:    new Map(),   // id → User
  positions: new Map(),  // id → Position
  wagers:   new Map(),   // id → Wager
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function now() {
  return new Date().toISOString();
}

// --------------------------------------------------------------------------
// User operations
// --------------------------------------------------------------------------

/**
 * Create a new user.
 * @param {string} name
 * @returns {object} User
 */
function createUser(name) {
  const user = {
    id: uuidv4(),
    name,
    points: 100,       // every new user starts with 100 contribution points
    level: 1,
    createdAt: now(),
  };
  store.users.set(user.id, user);
  return user;
}

function getUser(id) {
  return store.users.get(id) || null;
}

function getAllUsers() {
  return Array.from(store.users.values());
}

/**
 * Award or deduct contribution points for a user.
 * @param {string} userId
 * @param {number} delta  positive = award, negative = deduct
 * @returns {object} updated User
 */
function updatePoints(userId, delta) {
  const user = store.users.get(userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  user.points = Math.max(0, user.points + delta);
  user.level  = Math.floor(user.points / 100) + 1;
  return user;
}

// --------------------------------------------------------------------------
// Message operations
// --------------------------------------------------------------------------

/**
 * Create a new message (node in the non-linear graph).
 *
 * A message may reference *multiple* other messages.  A special type
 * 'relation' represents the relationship between two or more messages —
 * the relation itself is also a first-class message.
 *
 * @param {object} opts
 * @param {string}   opts.authorId
 * @param {string}   opts.content
 * @param {string[]} [opts.references=[]]   IDs of referenced messages
 * @param {string}   [opts.type='message']  message|relation|summary|question
 * @param {string}   [opts.relationType]    agrees|disagrees|elaborates|contradicts|summarizes
 * @param {string[]} [opts.tags=[]]
 * @returns {object} Message
 */
function createMessage({ authorId, content, references = [], type = 'message', relationType, tags = [] }) {
  if (!store.users.has(authorId)) throw new Error(`Author not found: ${authorId}`);

  // Validate all references exist
  for (const ref of references) {
    if (!store.messages.has(ref)) throw new Error(`Referenced message not found: ${ref}`);
  }

  const message = {
    id: uuidv4(),
    authorId,
    content,
    type,
    relationType: relationType || null,
    references,        // this is what makes it NON-LINEAR – multiple parents
    tags,
    timestamp: now(),
    editHistory: [],   // permanent immutable audit trail
    positions: { support: 0, oppose: 0, signup: 0 },
    pointsEarned: 0,
    aiSummary: null,
  };
  store.messages.set(message.id, message);

  // Award the author contribution points for posting
  const basePoints = type === 'summary' ? 10 : type === 'relation' ? 5 : 3;
  updatePoints(authorId, basePoints);
  message.pointsEarned += basePoints;

  // If this message is a 'relation', also create back-references so both
  // referenced messages know about it.
  for (const refId of references) {
    const referenced = store.messages.get(refId);
    if (referenced && !referenced._referencedBy) referenced._referencedBy = [];
    if (referenced) referenced._referencedBy.push(message.id);
  }

  return message;
}

function getMessage(id) {
  return store.messages.get(id) || null;
}

function getAllMessages() {
  return Array.from(store.messages.values());
}

/**
 * Edit a message – the original content is preserved in editHistory.
 */
function editMessage(id, newContent) {
  const msg = store.messages.get(id);
  if (!msg) throw new Error(`Message not found: ${id}`);
  msg.editHistory.push({ content: msg.content, timestamp: now() });
  msg.content = newContent;
  return msg;
}

/**
 * Get a thread rooted at a message: the message itself plus every message
 * that directly or transitively references it.
 */
function getThread(rootId) {
  const root = store.messages.get(rootId);
  if (!root) throw new Error(`Message not found: ${rootId}`);

  const visited = new Set();
  const thread  = [];

  function collect(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const msg = store.messages.get(id);
    if (msg) {
      thread.push(msg);
      // Find messages that reference this one
      for (const m of store.messages.values()) {
        if (m.references.includes(id)) collect(m.id);
      }
    }
  }

  collect(rootId);
  return thread;
}

// --------------------------------------------------------------------------
// Position operations
// --------------------------------------------------------------------------

/**
 * Take a position on a message.
 * Each user may hold at most one position per message (upsert semantics).
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.messageId
 * @param {string} opts.type     support|oppose|signup
 * @param {number} [opts.stake=0]  contribution points to stake (for wagering)
 * @returns {object} Position
 */
function takePosition({ userId, messageId, type, stake = 0 }) {
  if (!store.users.has(userId))    throw new Error(`User not found: ${userId}`);
  if (!store.messages.has(messageId)) throw new Error(`Message not found: ${messageId}`);
  if (!['support', 'oppose', 'signup'].includes(type)) {
    throw new Error(`Invalid position type: ${type}`);
  }

  const user = store.users.get(userId);
  if (stake > user.points) throw new Error('Insufficient contribution points');

  // Undo any previous position by this user on this message
  const existing = Array.from(store.positions.values())
    .find(p => p.userId === userId && p.messageId === messageId);
  if (existing) {
    const msg = store.messages.get(messageId);
    msg.positions[existing.type] = Math.max(0, msg.positions[existing.type] - 1);
    if (existing.stake > 0) updatePoints(userId, existing.stake); // refund stake
    store.positions.delete(existing.id);
  }

  const position = {
    id: uuidv4(),
    userId,
    messageId,
    type,
    stake,
    timestamp: now(),
  };
  store.positions.set(position.id, position);

  // Update aggregated counts on the message
  const msg = store.messages.get(messageId);
  msg.positions[type] += 1;

  // Deduct staked points
  if (stake > 0) updatePoints(userId, -stake);

  return position;
}

function getPositions(messageId) {
  return Array.from(store.positions.values()).filter(p => p.messageId === messageId);
}

function getUserPositions(userId) {
  return Array.from(store.positions.values()).filter(p => p.userId === userId);
}

// --------------------------------------------------------------------------
// Wager operations
// --------------------------------------------------------------------------

/**
 * Create a wager on a message/claim.
 *
 * @param {object} opts
 * @param {string}  opts.messageId    the claim being wagered on
 * @param {string}  opts.creatorId
 * @param {boolean} opts.prediction   creator's prediction (true = will be verified)
 * @param {number}  opts.amount       contribution points staked
 * @param {string}  [opts.resolvesAt] ISO date string
 * @returns {object} Wager
 */
function createWager({ messageId, creatorId, prediction, amount, resolvesAt }) {
  if (!store.messages.has(messageId)) throw new Error(`Message not found: ${messageId}`);
  const creator = store.users.get(creatorId);
  if (!creator) throw new Error(`User not found: ${creatorId}`);
  if (amount <= 0)              throw new Error('Wager amount must be positive');
  if (amount > creator.points)  throw new Error('Insufficient contribution points');

  updatePoints(creatorId, -amount);

  const wager = {
    id: uuidv4(),
    messageId,
    creatorId,
    prediction,
    amount,
    status: 'open',
    outcome: null,
    participants: [{ userId: creatorId, prediction, amount }],
    createdAt: now(),
    resolvesAt: resolvesAt || null,
    resolvedAt: null,
  };
  store.wagers.set(wager.id, wager);
  return wager;
}

/**
 * Join an existing wager with the opposing prediction.
 */
function joinWager({ wagerId, userId, amount }) {
  const wager = store.wagers.get(wagerId);
  if (!wager) throw new Error(`Wager not found: ${wagerId}`);
  if (wager.status !== 'open') throw new Error('Wager is not open');

  const user = store.users.get(userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  if (amount > user.points) throw new Error('Insufficient contribution points');

  updatePoints(userId, -amount);

  const opponentPrediction = !wager.prediction;
  wager.participants.push({ userId, prediction: opponentPrediction, amount });
  wager.amount += amount;
  return wager;
}

/**
 * Resolve a wager. The outcome is provided by a resolver (e.g., a moderator
 * or future oracle).  Winners share the pool proportionally.
 */
function resolveWager({ wagerId, outcome }) {
  const wager = store.wagers.get(wagerId);
  if (!wager) throw new Error(`Wager not found: ${wagerId}`);
  if (wager.status !== 'open') throw new Error('Wager already resolved');

  wager.status    = 'resolved';
  wager.outcome   = outcome;
  wager.resolvedAt = now();

  const winners = wager.participants.filter(p => p.prediction === outcome);
  const losers  = wager.participants.filter(p => p.prediction !== outcome);

  const loserPool = losers.reduce((s, p) => s + p.amount, 0);
  const winnerPool = winners.reduce((s, p) => s + p.amount, 0);

  for (const w of winners) {
    // Return stake + proportional share of loser pool
    const share = winnerPool > 0 ? Math.floor((w.amount / winnerPool) * loserPool) : 0;
    updatePoints(w.userId, w.amount + share);
  }

  return wager;
}

function getAllWagers() {
  return Array.from(store.wagers.values());
}

function getWager(id) {
  return store.wagers.get(id) || null;
}

// --------------------------------------------------------------------------
// Graph export (for frontend visualization)
// --------------------------------------------------------------------------

/**
 * Export all messages and their relationships as a graph (nodes + edges).
 */
function getGraph() {
  const nodes = Array.from(store.messages.values()).map(m => ({
    id:       m.id,
    label:    m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content,
    type:     m.type,
    authorId: m.authorId,
    positions: m.positions,
    pointsEarned: m.pointsEarned,
    timestamp: m.timestamp,
    tags: m.tags,
  }));

  const edges = [];
  for (const m of store.messages.values()) {
    for (const refId of m.references) {
      edges.push({
        id:     `${m.id}→${refId}`,
        source: m.id,
        target: refId,
        type:   m.type === 'relation' ? (m.relationType || 'references') : 'references',
      });
    }
  }

  return { nodes, edges };
}

// --------------------------------------------------------------------------
// Reset (used in tests)
// --------------------------------------------------------------------------
function reset() {
  store.messages.clear();
  store.users.clear();
  store.positions.clear();
  store.wagers.clear();
}

// --------------------------------------------------------------------------
// Seed demo data
// --------------------------------------------------------------------------
function seed() {
  const alice = createUser('Alice');
  const bob   = createUser('Bob');
  const carol  = createUser('Carol');

  const m1 = createMessage({
    authorId: alice.id,
    content: '公论平台应当采用非线性表结构来展示讨论，使多个话题可以并行进行。',
    tags: ['proposal', 'structure'],
  });

  const m2 = createMessage({
    authorId: bob.id,
    content: '我认为线性结构也能胜任，只是需要更好的引用机制。',
    references: [m1.id],
    tags: ['counter-argument'],
  });

  const m3 = createMessage({
    authorId: carol.id,
    content: '线性结构天然无法支持多父引用，非线性是必然选择。',
    references: [m1.id, m2.id],
    tags: ['analysis'],
  });

  const rel = createMessage({
    authorId: alice.id,
    content: 'M3 contradicts M2',
    type: 'relation',
    relationType: 'contradicts',
    references: [m3.id, m2.id],
  });

  const m4 = createMessage({
    authorId: bob.id,
    content: '贡献点机制如何防止刷分行为？',
    type: 'question',
    references: [m1.id],
    tags: ['question', 'points'],
  });

  const m5 = createMessage({
    authorId: carol.id,
    content: '通过全透明的交易记录和社区投票监督，来源合法性由公开记录保证。',
    references: [m4.id],
    tags: ['answer', 'points'],
  });

  takePosition({ userId: alice.id, messageId: m1.id, type: 'support' });
  takePosition({ userId: bob.id,   messageId: m1.id, type: 'oppose' });
  takePosition({ userId: carol.id, messageId: m1.id, type: 'support' });
  takePosition({ userId: alice.id, messageId: m3.id, type: 'support', stake: 10 });

  createWager({
    messageId:  m1.id,
    creatorId:  alice.id,
    prediction: true,
    amount:     20,
    resolvesAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  });

  return { alice, bob, carol };
}

module.exports = {
  // users
  createUser, getUser, getAllUsers, updatePoints,
  // messages
  createMessage, getMessage, getAllMessages, editMessage, getThread,
  // positions
  takePosition, getPositions, getUserPositions,
  // wagers
  createWager, joinWager, resolveWager, getAllWagers, getWager,
  // graph
  getGraph,
  // utility
  reset, seed,
};
