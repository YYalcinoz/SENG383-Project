process.env.DB_PATH = ':memory:';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');

// Each module's table, dropped to make its router fail with a database error
const TABLES = { tasks: 'tasks', specialists: 'specialist_links', schedule: 'calendar_events' };

afterAll((done) => {
  jest.restoreAllMocks();
  db.close(done);
});

// A crash inside any router must reach the global error handler: a JSON 500
// without internal details, never Express's default HTML page with the stack trace
test.each(Object.keys(TABLES))('a database error in /%s returns a JSON 500 without details', async (part) => {
  await run("INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (1, 'P', 'p@x', 'h', 'parent')");
  await run("INSERT OR IGNORE INTO users (id, name, email, password_hash, role, parent_id) VALUES (2, 'C', 'c@x', 'h', 'child', 1)");
  await run(`DROP TABLE IF EXISTS ${TABLES[part]}`);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const token = jwt.sign({ sub: '1', role: 'parent' }, jwtSecret, { algorithm: 'HS256' });

  const res = await request(app).get(`/api/children/2/${part}`).set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ error: 'Internal server error' });
});
