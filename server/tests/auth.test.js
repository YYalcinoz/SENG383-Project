process.env.DB_PATH = ':memory:';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');

const login = (body) => request(app).post('/api/auth/login').send(body);

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      'Test Parent',
      'parent@test.com',
      await bcrypt.hash('correct-password', 4),
      'parent',
    ]);
  });

  afterAll((done) => {
    db.close(done);
  });

  test('returns a token and the user for correct credentials', async () => {
    const res = await login({ email: 'parent@test.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 1, name: 'Test Parent', role: 'parent' });

    const payload = jwt.verify(res.body.token, jwtSecret, { algorithms: ['HS256'] });
    expect(payload.sub).toBe('1');
    expect(payload.role).toBe('parent');
    expect(payload.exp - payload.iat).toBe(2 * 60 * 60);
  });

  test('never returns the password hash', async () => {
    const res = await login({ email: 'parent@test.com', password: 'correct-password' });
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  test('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await login({ email: 'parent@test.com', password: 'wrong' });
    const unknownEmail = await login({ email: 'nobody@test.com', password: 'wrong' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({ error: 'Invalid email or password' });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test.each([
    ['missing email', { password: 'x' }],
    ['missing password', { email: 'parent@test.com' }],
    ['empty password', { email: 'parent@test.com', password: '' }],
    ['non-string password', { email: 'parent@test.com', password: { a: 1 } }],
    ['non-string email', { email: ['parent@test.com'], password: 'x' }],
  ])('returns 400 for %s', async (_, body) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email and password are required' });
  });

  test('returns 400 when there is no body', async () => {
    const res = await request(app).post('/api/auth/login');
    expect(res.status).toBe(400);
  });

  test('returns a JSON error for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
