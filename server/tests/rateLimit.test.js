process.env.DB_PATH = ':memory:';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');

// The limits are counted in memory. Jest loads the app again for every test file, so
// the counts here never reach other test files. Inside this file they are shared: the
// login limit is per IP and every request comes from the same IP, so the login tests
// must run in this order. The specialist link limit is per parent, so those tests
// use different parents.

const PASSWORD = 'correct-password';
const users = {};

const insertUser = async (key, role, parentKey = null) => {
  // Emails are stored in lower case (login lowercases what the user types)
  const email = `${key.toLowerCase()}@test.com`;
  const { lastID } = await run(
    'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
    [key, email, await bcrypt.hash(PASSWORD, 4), role, parentKey ? users[parentKey].id : null],
  );
  users[key] = { id: lastID, email, role };
};

const tokenFor = (key) =>
  jwt.sign({ sub: String(users[key].id), role: users[key].role }, jwtSecret, { algorithm: 'HS256', expiresIn: '2h' });

const login = (body) => request(app).post('/api/auth/login').send(body);

const link = (parentKey, childKey, email) =>
  request(app)
    .post(`/api/children/${users[childKey].id}/specialists`)
    .set('Authorization', `Bearer ${tokenFor(parentKey)}`)
    .send({ email, specialistType: 'teacher' });

beforeAll(async () => {
  await insertUser('parentA', 'parent');
  await insertUser('childA', 'child', 'parentA');
  await insertUser('parentB', 'parent');
  await insertUser('childB', 'child', 'parentB');
  await insertUser('teacher', 'specialist');
  await insertUser('coach', 'specialist');
});

afterAll((done) => {
  db.close(done);
});

describe('login limit (10 failed attempts per IP in 15 minutes)', () => {
  test('successful logins are not counted', async () => {
    for (let i = 0; i < 15; i++) {
      const res = await login({ email: users.parentA.email, password: PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  test('after 10 failed attempts the next one is rejected with 429, even with the right password', async () => {
    // A request with missing fields (400) is a failed attempt too
    expect((await login({})).status).toBe(400);
    for (let i = 0; i < 9; i++) {
      const res = await login({ email: users.parentA.email, password: `wrong-${i}` });
      expect(res.status).toBe(401);
    }

    const res = await login({ email: users.parentA.email, password: PASSWORD });

    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Too many failed login attempts, please try again in 15 minutes' });
    expect(res.body.token).toBeUndefined();
    // The client can read the limit and the 15-minute window from the standard headers
    expect(res.headers['ratelimit-policy']).toMatch(/q=10;.*w=900/);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  test('the login limit does not block the rest of the API', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor('parentA')}`);

    expect(res.status).toBe(200);
  });
});

describe('specialist link limit (20 failed attempts per parent in 15 minutes)', () => {
  test('only failed attempts count; after 20 of them even a valid link is rejected with 429', async () => {
    expect((await link('parentA', 'childA', users.teacher.email)).status).toBe(201);
    for (let i = 0; i < 20; i++) {
      const res = await link('parentA', 'childA', `unknown-${i}@test.com`);
      expect(res.status).toBe(400);
    }

    const res = await link('parentA', 'childA', users.coach.email);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many failed attempts to link a specialist, please try again in 15 minutes' });
    expect(res.headers['ratelimit-policy']).toMatch(/q=20;.*w=900/);
  });

  test('a rejected request does not create the link', async () => {
    const res = await request(app)
      .get(`/api/children/${users.childA.id}/specialists`)
      .set('Authorization', `Bearer ${tokenFor('parentA')}`);

    expect(res.status).toBe(200);
    expect(res.body.specialists.map((s) => s.name)).toEqual(['teacher']);
  });

  test('the limit is per parent: another parent can still link', async () => {
    const res = await link('parentB', 'childB', users.teacher.email);

    expect(res.status).toBe(201);
  });

  test("requests for another parent's child count as failed attempts", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await link('parentB', 'childA', users.coach.email);
      expect(res.status).toBe(403);
    }

    const res = await link('parentB', 'childB', users.coach.email);

    expect(res.status).toBe(429);
  });
});
