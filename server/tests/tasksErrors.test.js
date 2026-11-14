process.env.DB_PATH = ':memory:';

// The spies must be set up BEFORE the app is loaded: routes/tasks.js copies `all` and `run`
// from the helpers when it loads, so a spy created later would not affect those copies
// and the test would pass for the wrong reason
const helpers = require('../src/db/helpers');
const allSpy = jest.spyOn(helpers, 'all');
const runSpy = jest.spyOn(helpers, 'run');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');

let parentToken;
let childToken;
let childId;
let taskId;

const tokenFor = (id, role) => jwt.sign({ sub: String(id), role }, jwtSecret, { algorithm: 'HS256', expiresIn: '2h' });

beforeAll(async () => {
  const insert = 'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)';
  const parent = await helpers.run(insert, ['Parent', 'parent@test.com', 'test-hash', 'parent', null]);
  childId = (await helpers.run(insert, ['Child', 'child@test.com', 'test-hash', 'child', parent.lastID])).lastID;
  taskId = (
    await helpers.run(
      `INSERT INTO tasks (child_id, assigner_id, title, development_area, due_date)
        VALUES (?, ?, 'Read', 'language', '2026-11-20')`,
      [childId, parent.lastID]
    )
  ).lastID;
  parentToken = tokenFor(parent.lastID, 'parent');
  childToken = tokenFor(childId, 'child');
});

beforeEach(() => {
  // The error handler logs every 500 with console.error; keep the test output clean
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  allSpy.mockClear();
  runSpy.mockClear();
});

afterAll((done) => {
  jest.restoreAllMocks();
  db.close(done);
});

// True when one of the spied queries was about the tasks table: proves that the failure
// really happened inside the tasks route and not in a middleware
const touchedTasks = (spy) => spy.mock.calls.some(([sql]) => /tasks/.test(sql));

function expectSafe500(res) {
  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ error: 'Internal server error' });
  expect(res.text).not.toContain('secret detail');
}

test('an unexpected error while listing tasks returns 500 as JSON, without details', async () => {
  allSpy.mockRejectedValueOnce(new Error('SQLITE_ERROR: secret detail'));

  const res = await request(app)
    .get(`/api/children/${childId}/tasks`)
    .set('Authorization', `Bearer ${parentToken}`);

  expectSafe500(res);
  expect(touchedTasks(allSpy)).toBe(true);
});

test('an unexpected error while assigning a task returns 500 as JSON, without details', async () => {
  runSpy.mockRejectedValueOnce(new Error('SQLITE_ERROR: secret detail'));

  const res = await request(app)
    .post(`/api/children/${childId}/tasks`)
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ title: 'Read', developmentArea: 'language', dueDate: '2026-11-20' });

  expectSafe500(res);
  expect(touchedTasks(runSpy)).toBe(true);
});

test('an unexpected error while marking a task as done returns 500 as JSON, without details', async () => {
  runSpy.mockRejectedValueOnce(new Error('SQLITE_ERROR: secret detail'));

  const res = await request(app)
    .patch(`/api/children/${childId}/tasks/${taskId}/done`)
    .set('Authorization', `Bearer ${childToken}`);

  expectSafe500(res);
  expect(touchedTasks(runSpy)).toBe(true);
});
