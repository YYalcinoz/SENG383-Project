process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { run } = require('../src/db/helpers');

// A crash inside any router must reach the global error handler: a JSON 500
// without internal details, never Express's default HTML page with the stack trace
test.each(['tasks', 'specialists'])('a database error in /%s returns a JSON 500 without details', async (part) => {
  await run("INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (1, 'P', 'p@x', 'h', 'parent')");
  await run("INSERT OR IGNORE INTO users (id, name, email, password_hash, role, parent_id) VALUES (2, 'C', 'c@x', 'h', 'child', 1)");
  await run('DROP TABLE IF EXISTS tasks');
  await run('DROP TABLE IF EXISTS specialist_links');
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const token = jwt.sign({ sub: 1, role: 'parent' }, 'test-secret', { algorithm: 'HS256' });

  const res = await request(app).get(`/api/children/2/${part}`).set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ error: 'Internal server error' });
});
