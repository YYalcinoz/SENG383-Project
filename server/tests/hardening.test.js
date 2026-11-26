process.env.DB_PATH = ':memory:';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');
const { resetRateLimits } = require('../src/middleware/rateLimit');

const parentToken = () => jwt.sign({ sub: '1', role: 'parent' }, jwtSecret, { algorithm: 'HS256' });

beforeAll(async () => {
  await run("INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'P', 'p@x', 'h', 'parent')");
  await run("INSERT INTO users (id, name, email, password_hash, role, parent_id) VALUES (2, 'C', 'c@x', 'h', 'child', 1)");
});

beforeEach(async () => {
  await resetRateLimits();
});

afterAll((done) => {
  db.close(done);
});

describe('X-Powered-By header', () => {
  // The header tells an attacker the server runs Express; no answer should send it
  test.each([
    ['a successful request', () => request(app).get('/api/health'), 200],
    ['a request without a token', () => request(app).get('/api/auth/me'), 401],
    ['a validation error', () => request(app).post('/api/auth/login').send({}), 400],
    [
      'a successful request with a token',
      () => request(app).get('/api/children').set('Authorization', `Bearer ${parentToken()}`),
      200,
    ],
    ['an unknown route', () => request(app).get('/api/unknown'), 404],
  ])('is not sent on %s', async (_name, send, status) => {
    const res = await send();

    expect(res.status).toBe(status);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('X-Content-Type-Options header', () => {
  // Browsers must not guess the type of a response: text from the request that appears
  // in it (such as an unsupported charset in a 415) can never be read as HTML
  test.each([
    ['a successful request', () => request(app).get('/api/health'), 200],
    ['a request without a token', () => request(app).get('/api/auth/me'), 401],
    ['an unknown route', () => request(app).get('/api/unknown'), 404],
    [
      'a body parser error that echoes the request',
      () => request(app).post('/api/auth/login').set('Content-Type', 'application/json; charset=<script>').send('{}'),
      415,
    ],
  ])('is nosniff on %s', async (_name, send, status) => {
    const res = await send();

    expect(res.status).toBe(status);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Cache-Control header', () => {
  // Responses hold a child's data and a family often shares one computer, so the
  // browser must not keep them in its cache
  test.each([
    ['a successful request', () => request(app).get('/api/health'), 200],
    [
      "a request for a child's data",
      () => request(app).get('/api/children').set('Authorization', `Bearer ${parentToken()}`),
      200,
    ],
    ['a request without a token', () => request(app).get('/api/auth/me'), 401],
    ['an unknown route', () => request(app).get('/api/unknown'), 404],
  ])('is no-store on %s', async (_name, send, status) => {
    const res = await send();

    expect(res.status).toBe(status);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('no ETag is sent, so a request is never answered with 304', async () => {
    // With no-store the browser keeps nothing to check against, so an ETag has no use;
    // without one, Express always sends the full response
    const first = await request(app).get('/api/children').set('Authorization', `Bearer ${parentToken()}`);
    const second = await request(app)
      .get('/api/children')
      .set('Authorization', `Bearer ${parentToken()}`)
      .set('If-None-Match', 'W/"any"');

    expect(first.headers.etag).toBeUndefined();
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});

describe('unknown routes', () => {
  // Express's default answer is an HTML page ("Cannot GET /api/...") that names the
  // method and path; every answer of the API should be JSON in the { error } format
  test.each([
    ['GET', '/api/unknown'],
    ['POST', '/api/unknown'],
    ['DELETE', '/api/auth'],
    ['GET', '/api/children/2/unknown'],
    ['GET', '/'],
    ['GET', '/index.html'],
  ])('%s %s returns a JSON 404', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(res.text).not.toMatch(/Cannot|<html|<pre/i);
  });

  test('an unknown method on a known path returns a JSON 404', async () => {
    const res = await request(app).put('/api/auth/login').send({});

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('the path the client sent is not echoed back', async () => {
    const res = await request(app).get('/api/%3Cscript%3Ealert(1)%3C%2Fscript%3E');

    expect(res.status).toBe(404);
    expect(res.text).not.toMatch(/script/i);
  });

  test('a known route under /api/children still checks the token first', async () => {
    const res = await request(app).get('/api/children/2/tasks');

    expect(res.status).toBe(401);
  });

  test('known routes are not caught by the 404 handler', async () => {
    const res = await request(app).get('/api/children/2/tasks').set('Authorization', `Bearer ${parentToken()}`);

    expect(res.status).toBe(200);
  });

  test('unknown /api routes are still rate limited', async () => {
    const res = await request(app).get('/api/unknown');

    expect(res.headers['ratelimit-policy']).toMatch(/q=1000;/);
  });
});

describe('errors keep going to the error handler', () => {
  test('malformed JSON returns a JSON 400, not the 404', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
