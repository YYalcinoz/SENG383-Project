process.env.DB_PATH = ':memory:';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');
const { authenticate, requireRole } = require('../src/middleware/auth');

const sign = (claims, options = {}) =>
  jwt.sign(claims, jwtSecret, { algorithm: 'HS256', expiresIn: '2h', ...options });
const me = (header) => {
  const req = request(app).get('/api/auth/me');
  return header ? req.set('Authorization', header) : req;
};

describe('authenticate and GET /api/auth/me', () => {
  let userId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('password', 4);
    const result = await run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['Test Parent', 'parent@test.com', hash, 'parent']
    );
    userId = result.lastID;
  });

  afterAll((done) => {
    db.close(done);
  });

  test('returns the current user for a valid token', async () => {
    const res = await me(`Bearer ${sign({ sub: String(userId), role: 'parent' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: userId, name: 'Test Parent', role: 'parent' } });
  });

  test('accepts a token from a real login', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'parent@test.com', password: 'password' });

    const res = await me(`Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });

  test.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['empty bearer', 'Bearer'],
    ['garbage token', 'Bearer not-a-token'],
    ['extra parts after the token', 'Bearer abc def'],
  ])('returns 401 for %s', async (_, header) => {
    const res = await me(header);
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('returns 401 for an expired token', async () => {
    const token = sign({ sub: String(userId), role: 'parent' }, { expiresIn: -10 });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  test('returns 401 for a token signed with another secret', async () => {
    const token = jwt.sign({ sub: String(userId), role: 'parent' }, 'attacker-secret');
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  test('returns 401 for a correctly signed token with another algorithm', async () => {
    const token = sign({ sub: String(userId), role: 'parent' }, { algorithm: 'HS512' });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  test('returns 401 for a token without a valid user id', async () => {
    const token = sign({ sub: 'abc', role: 'parent' });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  test('accepts the bearer scheme in any case', async () => {
    const token = sign({ sub: String(userId), role: 'parent' });
    expect((await me(`bearer ${token}`)).status).toBe(200);
  });

  test('returns 401 for an unsigned token (alg: none)', async () => {
    const token = jwt.sign({ sub: String(userId), role: 'parent' }, '', { algorithm: 'none' });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });

  test('returns 401 for a valid token of a user that no longer exists', async () => {
    const token = sign({ sub: '99999', role: 'parent' });
    expect((await me(`Bearer ${token}`)).status).toBe(401);
  });
});

describe('requireRole', () => {
  const testApp = express();
  testApp.get('/parents-only', authenticate, requireRole('parent'), (req, res) => {
    res.json({ ok: true });
  });
  testApp.get('/adults', authenticate, requireRole('parent', 'specialist'), (req, res) => {
    res.json({ ok: true });
  });

  const get = (path, role) =>
    request(testApp)
      .get(path)
      .set('Authorization', `Bearer ${sign({ sub: '1', role })}`);

  test('allows the listed role', async () => {
    expect((await get('/parents-only', 'parent')).status).toBe(200);
  });

  test('returns 403 for another role', async () => {
    const res = await get('/parents-only', 'child');
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  test('allows any of several roles', async () => {
    expect((await get('/adults', 'specialist')).status).toBe(200);
    expect((await get('/adults', 'child')).status).toBe(403);
  });

  test('returns 401 when authenticate was not used on the route', async () => {
    const unprotected = express();
    unprotected.get('/x', requireRole('parent'), (req, res) => res.json({ ok: true }));
    expect((await request(unprotected).get('/x')).status).toBe(401);
  });

  test('returns 401 before checking the role when there is no token', async () => {
    expect((await request(testApp).get('/parents-only')).status).toBe(401);
  });
});
