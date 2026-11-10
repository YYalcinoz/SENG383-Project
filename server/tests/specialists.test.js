process.env.DB_PATH = ':memory:';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');

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

const listUrl = (childKey) => `/api/children/${users[childKey].id}/specialists`;
const link = (parentKey, childKey, body) =>
  request(app).post(listUrl(childKey)).set(as(parentKey)).send(body);
const unlink = (parentKey, childKey, specialistKey) =>
  request(app)
    .delete(`${listUrl(childKey)}/${users[specialistKey].id}`)
    .set(as(parentKey));

beforeAll(async () => {
  // Two families; Mehmet is linked to Zeynep, Elif and Can are not linked to anyone
  await addUser('Ayse', 'parent');
  await addUser('Zeynep', 'child', 'Ayse');
  await addUser('Fatma', 'parent');
  await addUser('Ali', 'child', 'Fatma');
  await addUser('Mehmet', 'specialist');
  await addUser('Elif', 'specialist');
  await addUser('Can', 'specialist');
  await run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
    users.Zeynep.id,
    users.Mehmet.id,
    'teacher',
  ]);
});

afterAll((done) => {
  db.close(done);
});

describe('GET /api/children', () => {
  test('a parent gets only their own children', async () => {
    const res = await request(app).get('/api/children').set(as('Ayse'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ children: [{ id: users.Zeynep.id, name: 'Zeynep' }] });
  });

  test('a specialist gets only the children they are linked to, with their type', async () => {
    const res = await request(app).get('/api/children').set(as('Mehmet'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      children: [{ id: users.Zeynep.id, name: 'Zeynep', specialistType: 'teacher' }],
    });
  });

  test('a specialist with no links gets an empty list', async () => {
    const res = await request(app).get('/api/children').set(as('Can'));
    expect(res.body).toEqual({ children: [] });
  });

  test('a child gets 403', async () => {
    expect((await request(app).get('/api/children').set(as('Zeynep'))).status).toBe(403);
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).get('/api/children')).status).toBe(401);
  });
});

describe('GET /api/children/:childId/specialists', () => {
  test('the parent sees the linked specialists with name and type', async () => {
    const res = await request(app).get(listUrl('Zeynep')).set(as('Ayse'));
    expect(res.status).toBe(200);
    expect(res.body.specialists).toHaveLength(1);
    expect(res.body.specialists[0]).toMatchObject({
      id: users.Mehmet.id,
      name: 'Mehmet',
      specialistType: 'teacher',
    });
    expect(res.body.specialists[0].linkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('never returns email addresses or password hashes', async () => {
    const res = await request(app).get(listUrl('Zeynep')).set(as('Ayse'));
    expect(JSON.stringify(res.body)).not.toMatch(/@test\.com|test-hash/);
  });

  test.each([
    ['a linked specialist', 'Mehmet'],
    ['the parent of another child', 'Fatma'],
    ['a specialist who is not linked', 'Elif'],
    ['the child', 'Zeynep'],
  ])('%s gets 403', async (_, key) => {
    expect((await request(app).get(listUrl('Zeynep')).set(as(key))).status).toBe(403);
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).get(listUrl('Zeynep'))).status).toBe(401);
  });
});

describe('POST /api/children/:childId/specialists', () => {
  test('the parent links a specialist by email and type, and the specialist gets access', async () => {
    const res = await link('Fatma', 'Ali', { email: 'elif@test.com', specialistType: 'psychologist' });

    expect(res.status).toBe(201);
    expect(res.body.specialist).toMatchObject({
      id: users.Elif.id,
      name: 'Elif',
      specialistType: 'psychologist',
    });

    const list = await request(app).get(listUrl('Ali')).set(as('Fatma'));
    expect(list.body.specialists.map((s) => s.name)).toEqual(['Elif']);

    // FR-M2-07: the new link gives access straight away
    const children = await request(app).get('/api/children').set(as('Elif'));
    expect(children.body.children.map((c) => c.id)).toContain(users.Ali.id);
  });

  test('ignores case and surrounding spaces in the email', async () => {
    const res = await link('Ayse', 'Zeynep', { email: '  CAN@Test.com ', specialistType: 'coach' });
    expect(res.status).toBe(201);
    await run('DELETE FROM specialist_links WHERE specialist_id = ?', [users.Can.id]);
  });

  test.each([
    ['an unknown email', 'nobody@test.com'],
    ['the email of a parent', 'fatma@test.com'],
    ['the email of a child', 'ali@test.com'],
  ])('rejects %s with the same message (FR-M2-02)', async (_, email) => {
    const res = await link('Ayse', 'Zeynep', { email, specialistType: 'teacher' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No registered specialist with this email' });
  });

  test.each([
    ['a missing email', { specialistType: 'teacher' }],
    ['an empty email', { email: '  ', specialistType: 'teacher' }],
    ['a non-string email', { email: ['elif@test.com'], specialistType: 'teacher' }],
    ['a missing type', { email: 'elif@test.com' }],
    ['an unknown type', { email: 'elif@test.com', specialistType: 'wizard' }],
  ])('returns 400 for %s', async (_, body) => {
    const res = await link('Ayse', 'Zeynep', body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 409 when the specialist is already linked', async () => {
    const res = await link('Ayse', 'Zeynep', { email: 'mehmet@test.com', specialistType: 'coach' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'This specialist is already linked to the child' });
  });

  test.each([
    ['the parent of another child', 'Fatma'],
    ['a linked specialist', 'Mehmet'],
    ['the child', 'Zeynep'],
  ])('%s cannot link a specialist (403, FR-M2-05)', async (_, key) => {
    const res = await link(key, 'Zeynep', { email: 'can@test.com', specialistType: 'coach' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/children/:childId/specialists/:specialistId', () => {
  test('the parent unlinks a specialist, who loses access even with a still-valid token (FR-M2-08)', async () => {
    await link('Ayse', 'Zeynep', { email: 'can@test.com', specialistType: 'doctor' });
    const canToken = tokenFor('Can');
    const asCan = (req) => req.set('Authorization', `Bearer ${canToken}`);
    // All child-scoped M2 routes are parent-only, so the children list is used here.
    // The same database check in requireChildAccess is tested in childAccess.test.js.
    const linkedChildren = async () =>
      (await asCan(request(app).get('/api/children'))).body.children.map((c) => c.id);
    expect(await linkedChildren()).toContain(users.Zeynep.id);

    const res = await unlink('Ayse', 'Zeynep', 'Can');
    expect(res.status).toBe(204);

    expect(await linkedChildren()).toEqual([]);
  });

  test('returns 404 for a specialist who is not linked to the child', async () => {
    const res = await unlink('Ayse', 'Zeynep', 'Elif');
    expect(res.status).toBe(404);
  });

  test.each(['abc', '0', '-1', '1.5'])('returns 400 for specialist id "%s"', async (id) => {
    const res = await request(app).delete(`${listUrl('Zeynep')}/${id}`).set(as('Ayse'));
    expect(res.status).toBe(400);
  });

  test.each([
    ['the parent of another child', 'Fatma'],
    ['the linked specialist', 'Mehmet'],
    ['the child', 'Zeynep'],
  ])('%s cannot unlink (403, FR-M2-05)', async (_, key) => {
    expect((await unlink(key, 'Zeynep', 'Mehmet')).status).toBe(403);
    // The link is still there
    const list = await request(app).get(listUrl('Zeynep')).set(as('Ayse'));
    expect(list.body.specialists.map((s) => s.name)).toContain('Mehmet');
  });
});
