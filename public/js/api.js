'use strict';

/**
 * api.js — thin fetch wrapper for the 公论 REST API.
 */

const BASE = '';  // same-origin

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const api = {
  // Users
  getUsers:        ()         => request('GET',  '/api/users'),
  createUser:      (name)     => request('POST', '/api/users',     { name }),
  getUser:         (id)       => request('GET',  `/api/users/${id}`),
  awardPoints:     (id, delta) => request('POST', `/api/users/${id}/points`, { delta }),

  // Messages
  getMessages:     (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/messages${qs ? '?' + qs : ''}`);
  },
  getMessage:      (id)       => request('GET',  `/api/messages/${id}`),
  createMessage:   (body)     => request('POST', '/api/messages', body),
  editMessage:     (id, content) => request('PATCH', `/api/messages/${id}`, { content }),
  getThread:       (id)       => request('GET',  `/api/messages/${id}/thread`),
  getGraph:        ()         => request('GET',  '/api/messages/graph'),
  summarizeThread: (id)       => request('POST', `/api/messages/${id}/summarize`),
  clusterMessages: ()         => request('POST', '/api/messages/cluster'),

  // Positions
  takePosition:    (body)     => request('POST', '/api/positions', body),
  getPositions:    (messageId) => request('GET', `/api/messages/${messageId}/positions`),

  // Wagers
  getWagers:       (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/wagers${qs ? '?' + qs : ''}`);
  },
  createWager:     (body)     => request('POST', '/api/wagers', body),
  joinWager:       (id, body) => request('POST', `/api/wagers/${id}/join`, body),
  resolveWager:    (id, outcome) => request('POST', `/api/wagers/${id}/resolve`, { outcome }),
};
