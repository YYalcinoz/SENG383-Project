process.env.DB_PATH = ':memory:';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { all, get, run } = require('../src/db/helpers');

const users = {};
const tokenFor = (key) =>
  jwt.sign({ sub: String(users[key].id), role: users[key].role }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '2h',
  });
const as = (key) => ({ Authorization: `Bearer ${tokenFor(key)}` });

async function addUser(key, role, parentKey = null) {
  const { lastID } = await run(
    'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
    [key, `${key.toLowerCase()}@test.com`, 'test-hash', role, parentKey ? users[parentKey].id : null]
  );
  users[key] = { id: lastID, role };
}

const tasksUrl = (childKey) => `/api/children/${users[childKey].id}/tasks`;
const doneUrl = (childKey, taskId) => `${tasksUrl(childKey)}/${taskId}/done`;

const validBody = {
  title: 'Read 10 pages',
  description: 'Any book, out loud',
  developmentArea: 'language',
  dueDate: '2026-11-20',
};
const assign = (userKey, childKey, body = validBody) =>
  request(app).post(tasksUrl(childKey)).set(as(userKey)).send(body);
const markDone = (userKey, childKey, taskId) =>
  request(app).patch(doneUrl(childKey, taskId)).set(as(userKey));

// Inserts a task directly, so the GET and PATCH tests do not depend on POST
async function insertTask(childKey, assignerKey, changes = {}) {
  const task = {
    title: 'Balance exercise',
    description: '',
    development_area: 'motor',
    due_date: '2026-11-10',
    ...changes,
  };
  const { lastID } = await run(
    `INSERT INTO tasks (child_id, assigner_id, title, description, development_area, due_date)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [users[childKey].id, users[assignerKey].id, task.title, task.description, task.development_area, task.due_date]
  );
  return lastID;
}

const taskCount = async () => (await get('SELECT COUNT(*) AS n FROM tasks')).n;
const statusOf = async (id) => (await get('SELECT status FROM tasks WHERE id = ?', [id])).status;

beforeAll(async () => {
  // Ayse has two children, Fatma has one. Mehmet is linked to Zeynep only;
  // Elif is not linked to anyone.
  await addUser('Ayse', 'parent');
  await addUser('Zeynep', 'child', 'Ayse');
  await addUser('Deniz', 'child', 'Ayse');
  await addUser('Fatma', 'parent');
  await addUser('Ali', 'child', 'Fatma');
  await addUser('Mehmet', 'specialist');
  await addUser('Elif', 'specialist');
  await run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
    users.Zeynep.id,
    users.Mehmet.id,
    'teacher',
  ]);
});

afterAll((done) => {
  db.close(done);
});

describe('POST /api/children/:childId/tasks', () => {
  test('the parent assigns a task, which starts as todo and is returned in the API format', async () => {
    const res = await assign('Ayse', 'Zeynep');

    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({
      title: 'Read 10 pages',
      description: 'Any book, out loud',
      developmentArea: 'language',
      dueDate: '2026-11-20',
      status: 'todo',
      assignerName: 'Ayse',
      doneAt: null,
    });
    expect(res.body.task.id).toEqual(expect.any(Number));
    expect(res.body.task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('a linked specialist assigns a task', async () => {
    const res = await assign('Mehmet', 'Zeynep');
    expect(res.status).toBe(201);
    expect(res.body.task.assignerName).toBe('Mehmet');
  });

  test('the assigner comes from the token, not from the request body', async () => {
    const res = await assign('Mehmet', 'Zeynep', { ...validBody, assignerId: users.Ayse.id });
    expect(res.body.task.assignerName).toBe('Mehmet');
    const stored = await get('SELECT assigner_id FROM tasks WHERE id = ?', [res.body.task.id]);
    expect(stored.assigner_id).toBe(users.Mehmet.id);
  });

  test('status, doneAt and childId in the request body are ignored', async () => {
    const res = await assign('Ayse', 'Zeynep', {
      ...validBody,
      status: 'done',
      doneAt: '2026-01-01T00:00:00Z',
      childId: users.Ali.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({ status: 'todo', doneAt: null });
    const stored = await get('SELECT child_id FROM tasks WHERE id = ?', [res.body.task.id]);
    expect(stored.child_id).toBe(users.Zeynep.id);
  });

  test('the description is optional and defaults to an empty string', async () => {
    const { description: _omitted, ...withoutDescription } = validBody;
    const res = await assign('Ayse', 'Zeynep', withoutDescription);
    expect(res.status).toBe(201);
    expect(res.body.task.description).toBe('');
  });

  test('trims spaces around the title and the description', async () => {
    const res = await assign('Ayse', 'Zeynep', { ...validBody, title: '  Read  ', description: '  aloud ' });
    expect(res.body.task).toMatchObject({ title: 'Read', description: 'aloud' });
  });

  test.each([
    ['no title', { title: undefined }],
    ['a blank title', { title: '   ' }],
    ['a title that is not text', { title: 42 }],
    ['a title longer than 200 characters', { title: 'x'.repeat(201) }],
    ['no development area', { developmentArea: undefined }],
    ['an unknown development area', { developmentArea: 'music' }],
    ['no due date', { dueDate: undefined }],
    ['a due date in the wrong format', { dueDate: '20.11.2026' }],
    ['a due date with a single-digit day', { dueDate: '2026-11-2' }],
    ['a due date with a time', { dueDate: '2026-11-20T10:00:00Z' }],
    ['a due date that does not exist', { dueDate: '2026-02-30' }],
    ['a due date that is not text', { dueDate: 20261120 }],
    ['a description that is not text', { description: ['a'] }],
    ['a description longer than 2000 characters', { description: 'x'.repeat(2001) }],
  ])('rejects %s with 400 and stores nothing', async (_, changes) => {
    const before = await taskCount();
    const res = await assign('Ayse', 'Zeynep', { ...validBody, ...changes });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
    expect(await taskCount()).toBe(before);
  });

  test('rejects a request without a body with 400', async () => {
    const res = await request(app).post(tasksUrl('Zeynep')).set(as('Ayse'));
    expect(res.status).toBe(400);
  });

  test.each([
    ['the child (a child cannot assign tasks)', 'Zeynep', 'Zeynep'],
    ['the parent of another child', 'Fatma', 'Zeynep'],
    ['a specialist who is not linked', 'Elif', 'Zeynep'],
    ['a linked specialist, for another child', 'Mehmet', 'Deniz'],
    ['another child', 'Ali', 'Zeynep'],
  ])('returns 403 for %s and stores nothing', async (_, userKey, childKey) => {
    const before = await taskCount();
    const res = await assign(userKey, childKey);

    expect(res.status).toBe(403);
    expect(await taskCount()).toBe(before);
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).post(tasksUrl('Zeynep')).send(validBody)).status).toBe(401);
  });
});

describe('GET /api/children/:childId/tasks', () => {
  let zeynepTaskIds;

  beforeAll(async () => {
    // Clean slate for the list tests: Zeynep has four tasks assigned by different people,
    // Deniz has one, Ali has none. The tasks are inserted in an order that matches
    // neither the due dates nor the reverse of them, and two share a due date, so the
    // test only passes with ORDER BY due_date, id (not by id, nor by id descending).
    await run('DELETE FROM tasks');
    zeynepTaskIds = [
      await insertTask('Zeynep', 'Ayse', { title: 'Later task', due_date: '2026-11-25' }),
      await insertTask('Zeynep', 'Mehmet', { title: 'Earlier task', due_date: '2026-11-12' }),
      await insertTask('Zeynep', 'Ayse', { title: 'Middle task', due_date: '2026-11-18' }),
      await insertTask('Zeynep', 'Mehmet', { title: 'Same day task', due_date: '2026-11-12' }),
    ];
    await insertTask('Deniz', 'Ayse', { title: 'Deniz task' });
  });

  test('the parent sees all tasks of the child, ordered by due date and then id, with the assigner', async () => {
    const res = await request(app).get(tasksUrl('Zeynep')).set(as('Ayse'));

    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t) => t.title)).toEqual(['Earlier task', 'Same day task', 'Middle task', 'Later task']);
    expect(res.body.tasks.map((t) => t.assignerName)).toEqual(['Mehmet', 'Mehmet', 'Ayse', 'Ayse']);
    expect(res.body.tasks[0]).toMatchObject({
      id: zeynepTaskIds[1],
      description: '',
      developmentArea: 'motor',
      dueDate: '2026-11-12',
      status: 'todo',
      doneAt: null,
    });
  });

  test('a linked specialist sees all tasks of the child, also those the parent assigned', async () => {
    const res = await request(app).get(tasksUrl('Zeynep')).set(as('Mehmet'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(4);
  });

  test('the child sees their own tasks', async () => {
    const res = await request(app).get(tasksUrl('Zeynep')).set(as('Zeynep'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(4);
  });

  test("does not include another child's tasks", async () => {
    const res = await request(app).get(tasksUrl('Zeynep')).set(as('Ayse'));
    expect(JSON.stringify(res.body)).not.toMatch(/Deniz task/);
  });

  test('a child without tasks gets an empty list', async () => {
    const res = await request(app).get(tasksUrl('Ali')).set(as('Fatma'));
    expect(res.body).toEqual({ tasks: [] });
  });

  test('never returns email addresses, password hashes or user ids of the assigner', async () => {
    const res = await request(app).get(tasksUrl('Zeynep')).set(as('Ayse'));
    expect(JSON.stringify(res.body)).not.toMatch(/@test\.com|test-hash|assigner_id|assignerId/);
  });

  test.each([
    ['the parent of another child', 'Fatma', 'Zeynep'],
    ['a specialist who is not linked', 'Elif', 'Zeynep'],
    ['a linked specialist, for another child', 'Mehmet', 'Deniz'],
    ['another child', 'Ali', 'Zeynep'],
    ['a child who asks for a sibling', 'Zeynep', 'Deniz'],
  ])('returns 403 for %s', async (_, userKey, childKey) => {
    expect((await request(app).get(tasksUrl(childKey)).set(as(userKey))).status).toBe(403);
  });

  test('a specialist who is unlinked loses access even with a valid token (FR-M2-08)', async () => {
    await addUser('Can', 'specialist');
    await run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
      users.Zeynep.id,
      users.Can.id,
      'coach',
    ]);
    expect((await request(app).get(tasksUrl('Zeynep')).set(as('Can'))).status).toBe(200);

    await run('DELETE FROM specialist_links WHERE specialist_id = ?', [users.Can.id]);
    expect((await request(app).get(tasksUrl('Zeynep')).set(as('Can'))).status).toBe(403);
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).get(tasksUrl('Zeynep'))).status).toBe(401);
  });
});

describe('PATCH /api/children/:childId/tasks/:taskId/done', () => {
  let taskId, denizTaskId;

  beforeEach(async () => {
    await run('DELETE FROM tasks');
    taskId = await insertTask('Zeynep', 'Ayse');
    denizTaskId = await insertTask('Deniz', 'Ayse');
  });

  test('the child marks their own task as done and doneAt is set', async () => {
    const res = await markDone('Zeynep', 'Zeynep', taskId);

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ id: taskId, status: 'done', title: 'Balance exercise' });
    expect(res.body.task.doneAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(await statusOf(taskId)).toBe('done');
  });

  test('the specialist then sees the task as done (critical flow 2)', async () => {
    await markDone('Zeynep', 'Zeynep', taskId);

    const res = await request(app).get(tasksUrl('Zeynep')).set(as('Mehmet'));
    expect(res.body.tasks).toEqual([expect.objectContaining({ id: taskId, status: 'done' })]);
  });

  test('marking it done twice returns 200 and keeps the first doneAt', async () => {
    expect((await markDone('Zeynep', 'Zeynep', taskId)).status).toBe(200);
    // Move the first time into the past, so overwriting it would show
    await run("UPDATE tasks SET done_at = '2026-01-01 10:00:00' WHERE id = ?", [taskId]);

    const second = await markDone('Zeynep', 'Zeynep', taskId);

    expect(second.status).toBe(200);
    expect(second.body.task).toMatchObject({ status: 'done', doneAt: '2026-01-01T10:00:00Z' });
  });

  test.each([
    ['the parent', 'Ayse'],
    ['a linked specialist', 'Mehmet'],
    ['a specialist who is not linked', 'Elif'],
  ])('%s cannot mark a task as done (403) and the task stays todo', async (_, userKey) => {
    const res = await markDone(userKey, 'Zeynep', taskId);

    expect(res.status).toBe(403);
    expect(await statusOf(taskId)).toBe('todo');
  });

  test("another family's child gets 403 and the task stays todo", async () => {
    const res = await markDone('Ali', 'Zeynep', taskId);

    expect(res.status).toBe(403);
    expect(await statusOf(taskId)).toBe('todo');
  });

  test("a task of a sibling gets 404 'Task not found' and stays todo", async () => {
    const res = await markDone('Zeynep', 'Zeynep', denizTaskId);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
    expect(await statusOf(denizTaskId)).toBe('todo');
  });

  test("a task that does not exist gets the same 404 as another child's task", async () => {
    const missing = await markDone('Zeynep', 'Zeynep', 99999);
    const sibling = await markDone('Zeynep', 'Zeynep', denizTaskId);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(sibling.body);
  });

  test.each(['abc', '0', '-1', '1.5', '1e3', '12345678901'])('rejects the task id "%s" with 400', async (id) => {
    const res = await markDone('Zeynep', 'Zeynep', id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid task id' });
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).patch(doneUrl('Zeynep', taskId))).status).toBe(401);
    expect(await statusOf(taskId)).toBe('todo');
  });
});
