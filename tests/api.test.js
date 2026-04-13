'use strict';

const request = require('supertest');
const app     = require('../src/server');
const store   = require('../src/store');

beforeEach(() => {
  store.reset();
});

// ---------------------------------------------------------------------------
// User tests
// ---------------------------------------------------------------------------
describe('Users', () => {
  test('POST /api/users — create user', async () => {
    const res = await request(app).post('/api/users').send({ name: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Alice');
    expect(res.body.points).toBe(100);
    expect(res.body.level).toBe(1);
    expect(res.body.id).toBeDefined();
  });

  test('POST /api/users — missing name returns 400', async () => {
    const res = await request(app).post('/api/users').send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/users/:id — get user', async () => {
    const create = await request(app).post('/api/users').send({ name: 'Bob' });
    const res    = await request(app).get(`/api/users/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bob');
  });

  test('GET /api/users/:id — 404 for unknown user', async () => {
    const res = await request(app).get('/api/users/nonexistent');
    expect(res.status).toBe(404);
  });

  test('POST /api/users/:id/points — award points', async () => {
    const create = await request(app).post('/api/users').send({ name: 'Carol' });
    const res    = await request(app)
      .post(`/api/users/${create.body.id}/points`)
      .send({ delta: 50 });
    expect(res.status).toBe(200);
    expect(res.body.points).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Message tests
// ---------------------------------------------------------------------------
describe('Messages', () => {
  let authorId;

  beforeEach(async () => {
    const res = await request(app).post('/api/users').send({ name: 'Author' });
    authorId = res.body.id;
  });

  test('POST /api/messages — create message', async () => {
    const res = await request(app).post('/api/messages').send({
      authorId,
      content: '非线性表结构是公论的核心',
    });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('非线性表结构是公论的核心');
    expect(res.body.type).toBe('message');
    expect(res.body.references).toEqual([]);
  });

  test('POST /api/messages — missing required fields returns 400', async () => {
    const res = await request(app).post('/api/messages').send({ content: 'test' });
    expect(res.status).toBe(400);
  });

  test('POST /api/messages — creates message with multiple references', async () => {
    const m1 = await request(app).post('/api/messages').send({ authorId, content: 'First' });
    const m2 = await request(app).post('/api/messages').send({ authorId, content: 'Second' });

    const m3 = await request(app).post('/api/messages').send({
      authorId,
      content: 'Third, referencing both',
      references: [m1.body.id, m2.body.id],
    });

    expect(m3.status).toBe(201);
    expect(m3.body.references).toHaveLength(2);
    expect(m3.body.references).toContain(m1.body.id);
    expect(m3.body.references).toContain(m2.body.id);
  });

  test('POST /api/messages — relation type allowed', async () => {
    const m1 = await request(app).post('/api/messages').send({ authorId, content: 'Claim A' });
    const m2 = await request(app).post('/api/messages').send({ authorId, content: 'Claim B' });

    const rel = await request(app).post('/api/messages').send({
      authorId,
      content: 'A contradicts B',
      type: 'relation',
      relationType: 'contradicts',
      references: [m1.body.id, m2.body.id],
    });

    expect(rel.status).toBe(201);
    expect(rel.body.type).toBe('relation');
    expect(rel.body.relationType).toBe('contradicts');
  });

  test('GET /api/messages — list messages', async () => {
    await request(app).post('/api/messages').send({ authorId, content: 'Msg 1' });
    await request(app).post('/api/messages').send({ authorId, content: 'Msg 2' });

    const res = await request(app).get('/api/messages');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  test('GET /api/messages/graph — returns nodes and edges', async () => {
    const m1 = await request(app).post('/api/messages').send({ authorId, content: 'Root' });
    await request(app).post('/api/messages').send({
      authorId, content: 'Reply', references: [m1.body.id],
    });

    const res = await request(app).get('/api/messages/graph');
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(2);
    expect(res.body.edges).toHaveLength(1);
    expect(res.body.edges[0].source).toBeDefined();
    expect(res.body.edges[0].target).toBeDefined();
  });

  test('GET /api/messages/:id/thread — returns thread', async () => {
    const m1 = await request(app).post('/api/messages').send({ authorId, content: 'Root' });
    const m2 = await request(app).post('/api/messages').send({
      authorId, content: 'Reply 1', references: [m1.body.id],
    });
    await request(app).post('/api/messages').send({
      authorId, content: 'Reply 2', references: [m2.body.id],
    });

    const res = await request(app).get(`/api/messages/${m1.body.id}/thread`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  test('PATCH /api/messages/:id — edit preserves history', async () => {
    const create = await request(app).post('/api/messages').send({
      authorId, content: 'Original',
    });
    const edit = await request(app)
      .patch(`/api/messages/${create.body.id}`)
      .send({ content: 'Edited' });

    expect(edit.status).toBe(200);
    expect(edit.body.content).toBe('Edited');
    expect(edit.body.editHistory).toHaveLength(1);
    expect(edit.body.editHistory[0].content).toBe('Original');
  });

  test('Posting a message awards contribution points to author', async () => {
    const userBefore = await request(app).get(`/api/users/${authorId}`);
    const pointsBefore = userBefore.body.points;

    await request(app).post('/api/messages').send({ authorId, content: 'Hello' });

    const userAfter = await request(app).get(`/api/users/${authorId}`);
    expect(userAfter.body.points).toBeGreaterThan(pointsBefore);
  });
});

// ---------------------------------------------------------------------------
// Position tests
// ---------------------------------------------------------------------------
describe('Positions', () => {
  let userId, messageId;

  beforeEach(async () => {
    const u = await request(app).post('/api/users').send({ name: 'Voter' });
    userId = u.body.id;
    const m = await request(app).post('/api/messages').send({
      authorId: userId, content: 'A claim',
    });
    messageId = m.body.id;
  });

  test('POST /api/positions — support', async () => {
    const res = await request(app).post('/api/positions').send({
      userId, messageId, type: 'support',
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('support');
  });

  test('POST /api/positions — oppose', async () => {
    const res = await request(app).post('/api/positions').send({
      userId, messageId, type: 'oppose',
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('oppose');
  });

  test('POST /api/positions — upsert replaces previous position', async () => {
    await request(app).post('/api/positions').send({ userId, messageId, type: 'support' });

    const msgBefore = await request(app).get(`/api/messages/${messageId}`);
    expect(msgBefore.body.positions.support).toBe(1);

    await request(app).post('/api/positions').send({ userId, messageId, type: 'oppose' });

    const msgAfter = await request(app).get(`/api/messages/${messageId}`);
    expect(msgAfter.body.positions.support).toBe(0);
    expect(msgAfter.body.positions.oppose).toBe(1);
  });

  test('POST /api/positions — invalid type returns 400', async () => {
    const res = await request(app).post('/api/positions').send({
      userId, messageId, type: 'invalid',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Wager tests
// ---------------------------------------------------------------------------
describe('Wagers', () => {
  let creatorId, messageId;

  beforeEach(async () => {
    const u = await request(app).post('/api/users').send({ name: 'Creator' });
    creatorId = u.body.id;
    const m = await request(app).post('/api/messages').send({
      authorId: creatorId, content: 'Verifiable claim',
    });
    messageId = m.body.id;
  });

  test('POST /api/wagers — create wager', async () => {
    const res = await request(app).post('/api/wagers').send({
      messageId, creatorId, prediction: true, amount: 20,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    expect(res.body.amount).toBe(20);
  });

  test('POST /api/wagers — deducts points from creator', async () => {
    const userBefore = await request(app).get(`/api/users/${creatorId}`);
    const ptsBefore  = userBefore.body.points;

    await request(app).post('/api/wagers').send({
      messageId, creatorId, prediction: true, amount: 20,
    });

    const userAfter = await request(app).get(`/api/users/${creatorId}`);
    expect(userAfter.body.points).toBe(ptsBefore - 20);
  });

  test('POST /api/wagers/:id/join — opponent joins', async () => {
    const w = await request(app).post('/api/wagers').send({
      messageId, creatorId, prediction: true, amount: 20,
    });

    const opponent = await request(app).post('/api/users').send({ name: 'Opponent' });
    const join = await request(app)
      .post(`/api/wagers/${w.body.id}/join`)
      .send({ userId: opponent.body.id, amount: 20 });

    expect(join.status).toBe(200);
    expect(join.body.participants).toHaveLength(2);
    expect(join.body.amount).toBe(40);
  });

  test('POST /api/wagers/:id/resolve — winner gets loser pool', async () => {
    const w = await request(app).post('/api/wagers').send({
      messageId, creatorId, prediction: true, amount: 20,
    });

    const opponent = await request(app).post('/api/users').send({ name: 'Opponent' });
    await request(app)
      .post(`/api/wagers/${w.body.id}/join`)
      .send({ userId: opponent.body.id, amount: 20 });

    await request(app)
      .post(`/api/wagers/${w.body.id}/resolve`)
      .send({ outcome: true });

    // Creator predicted true (correct) → should receive their stake back plus winnings
    const creatorAfter = await request(app).get(`/api/users/${creatorId}`);
    expect(creatorAfter.body.points).toBeGreaterThan(100);
  });
});
