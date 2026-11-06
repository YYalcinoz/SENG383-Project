process.env.DB_PATH = ':memory:';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');
const { authenticate } = require('../src/middleware/auth');
const { requireChildAccess } = require('../src/middleware/childAccess');

// Test route: returns the child the middleware approved
const app = express();
app.get('/children/:childId/data', authenticate, requireChildAccess, (req, res) => {
  res.json({ child: req.child });
});
app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));

const users = {};
const tokenFor = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role }, jwtSecret, { algorithm: 'HS256', expiresIn: '2h' });
const getChild = (user, childId) =>
  request(app).get(`/children/${childId}/data`).set('Authorization', `Bearer ${tokenFor(user)}`);

async function addUser(key, role, parentKey = null) {
  const parentId = parentKey ? users[parentKey].id : null;
  const { lastID } = await run(
    'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
    [key, `${key}@test.com`, 'test-hash', role, parentId]
  );
  users[key] = { id: lastID, role };
}

const link = (childKey, specialistKey) =>
  run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
    users[childKey].id,
    users[specialistKey].id,
    'teacher',
  ]);

beforeAll(async () => {
  // Two families, one linked and one unlinked specialist
  await addUser('parentA', 'parent');
  await addUser('childA', 'child', 'parentA');
  await addUser('parentB', 'parent');
  await addUser('childB', 'child', 'parentB');
  await addUser('linkedSpecialist', 'specialist');
  await addUser('otherSpecialist', 'specialist');
  await link('childA', 'linkedSpecialist');
});

afterAll((done) => {
  db.close(done);
});

describe('requireChildAccess: allowed', () => {
  test('a parent can access their own child', async () => {
    const res = await getChild(users.parentA, users.childA.id);
    expect(res.status).toBe(200);
    expect(res.body.child).toEqual({ id: users.childA.id, parentId: users.parentA.id });
  });

  test('a linked specialist can access the child', async () => {
    expect((await getChild(users.linkedSpecialist, users.childA.id)).status).toBe(200);
  });

  test('a child can access their own data', async () => {
    expect((await getChild(users.childA, users.childA.id)).status).toBe(200);
  });
});

describe('requireChildAccess: IDOR cases', () => {
  test('a parent cannot access another family\'s child', async () => {
    const res = await getChild(users.parentA, users.childB.id);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You do not have access to this child' });
  });

  test('a specialist who is not linked cannot access the child', async () => {
    expect((await getChild(users.otherSpecialist, users.childA.id)).status).toBe(403);
  });

  test('a linked specialist cannot access another child', async () => {
    expect((await getChild(users.linkedSpecialist, users.childB.id)).status).toBe(403);
  });

  test('a specialist whose link was removed cannot access the child, even with a still-valid JWT', async () => {
    await addUser('removedSpecialist', 'specialist');
    await link('childA', 'removedSpecialist');
    const token = tokenFor(users.removedSpecialist);
    const call = () =>
      request(app).get(`/children/${users.childA.id}/data`).set('Authorization', `Bearer ${token}`);

    expect((await call()).status).toBe(200);

    await run('DELETE FROM specialist_links WHERE specialist_id = ?', [users.removedSpecialist.id]);

    expect((await call()).status).toBe(403);
  });

  test('a child cannot access another child\'s data', async () => {
    expect((await getChild(users.childA, users.childB.id)).status).toBe(403);
  });

  test('a parent id cannot be used as a child id', async () => {
    expect((await getChild(users.parentA, users.parentA.id)).status).toBe(403);
  });

  test('a user who is not a child cannot be accessed as a child, even through a link', async () => {
    // The schema does not stop a link to a non-child user, so the middleware must
    await run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
      users.parentB.id,
      users.linkedSpecialist.id,
      'teacher',
    ]);
    expect((await getChild(users.linkedSpecialist, users.parentB.id)).status).toBe(403);
  });

  test('a token with an unknown role cannot access any child', async () => {
    const admin = { id: users.parentA.id, role: 'admin' };
    expect((await getChild(admin, users.childA.id)).status).toBe(403);
  });

  test('a child that does not exist gets the same 403 as a child of someone else', async () => {
    const missing = await getChild(users.parentA, 99999);
    const other = await getChild(users.parentA, users.childB.id);
    expect(missing.status).toBe(403);
    expect(missing.body).toEqual(other.body);
  });
});

describe('requireChildAccess: input and setup', () => {
  test.each(['abc', '0', '-1', '1.5', '1e3', '99999999999'])('returns 400 for child id "%s"', async (id) => {
    const res = await getChild(users.parentA, id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid child id' });
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).get(`/children/${users.childA.id}/data`)).status).toBe(401);
  });

  test('works in a router mounted under /children/:childId with mergeParams', async () => {
    const router = express.Router({ mergeParams: true });
    router.get('/data', authenticate, requireChildAccess, (req, res) => res.json({ child: req.child }));
    const mounted = express();
    mounted.use('/children/:childId', router);

    const res = await request(mounted)
      .get(`/children/${users.childA.id}/data`)
      .set('Authorization', `Bearer ${tokenFor(users.parentA)}`);
    expect(res.status).toBe(200);
  });

  test('fails with 500, not 400, when the route has no :childId parameter', async () => {
    const router = express.Router(); // mergeParams forgotten
    router.get('/data', authenticate, requireChildAccess, (req, res) => res.json({}));
    const mounted = express();
    mounted.use('/children/:childId', router);
    mounted.use((err, req, res, next) => res.status(500).json({ error: err.message }));

    const res = await request(mounted)
      .get(`/children/${users.childA.id}/data`)
      .set('Authorization', `Bearer ${tokenFor(users.parentA)}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('mergeParams');
  });

  test('returns 401 when authenticate was not used on the route', async () => {
    const unprotected = express();
    unprotected.get('/children/:childId/data', requireChildAccess, (req, res) => res.json({}));
    expect((await request(unprotected).get(`/children/${users.childA.id}/data`)).status).toBe(401);
  });
});
