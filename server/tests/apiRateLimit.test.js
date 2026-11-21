process.env.DB_PATH = ':memory:';
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');

// Same value as apiLimiter in src/middleware/rateLimit.js. This file has its own
// app instance (Jest loads the modules again for every test file), so using up the
// whole limit here does not affect any other test.
const API_LIMIT = 1000;

afterAll((done) => {
  db.close(done);
});

test('every IP can make 1000 API requests in 15 minutes; the next one gets 429', async () => {
  // Sent in batches so the test stays fast without opening 1000 connections at once
  for (let sent = 0; sent < API_LIMIT; sent += 50) {
    const batch = await Promise.all(Array.from({ length: 50 }, () => request(app).get('/api/auth/me')));
    expect(batch.every((res) => res.status === 401)).toBe(true);
  }

  const res = await request(app).get('/api/auth/me');

  expect(res.status).toBe(429);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ error: 'Too many requests, please try again later' });
  expect(res.headers['ratelimit-policy']).toMatch(/q=1000;.*w=900/);
});

test('a request over the limit is rejected before its body is read', async () => {
  // Invalid JSON would be a 400 from express.json(); over the limit it never gets there
  const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');

  expect(res.status).toBe(429);
});

test('the health check is not limited', async () => {
  const res = await request(app).get('/api/health');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});
