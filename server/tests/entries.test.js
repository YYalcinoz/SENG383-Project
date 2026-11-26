process.env.DB_PATH = ':memory:';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { get, run } = require('../src/db/helpers');
const { addDays, today } = require('../src/utils/week');

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

const link = (childKey, specialistKey, type = 'teacher') =>
  run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
    users[childKey].id,
    users[specialistKey].id,
    type,
  ]);

const entriesUrl = (childKey) => `/api/children/${users[childKey].id}/entries`;
const entryUrl = (childKey, id) => `${entriesUrl(childKey)}/${id}`;

const validBody = {
  entryDate: '2026-11-20',
  entryType: 'observation',
  developmentArea: 'language',
  title: 'Reading aloud',
  observationText: 'Read a short story aloud without help.',
};
const add = (userKey, childKey, body = validBody) =>
  request(app).post(entriesUrl(childKey)).set(as(userKey)).send(body);
const edit = (userKey, childKey, id, body) =>
  request(app).patch(entryUrl(childKey, id)).set(as(userKey)).send(body);
const list = (userKey, childKey) => request(app).get(entriesUrl(childKey)).set(as(userKey));

// Inserts an entry directly, so the GET and PATCH tests do not depend on POST
async function insertEntry(childKey, authorKey, changes = {}) {
  const entry = {
    entry_date: '2026-11-18',
    entry_type: 'session-note',
    development_area: 'motor',
    title: 'Balance exercises',
    observation_text: 'Stood on one foot for ten seconds.',
    ...changes,
  };
  const { lastID } = await run(
    `INSERT INTO specialist_entries
      (child_id, author_id, entry_date, entry_type, development_area, title, observation_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      users[childKey].id,
      users[authorKey].id,
      entry.entry_date,
      entry.entry_type,
      entry.development_area,
      entry.title,
      entry.observation_text,
    ]
  );
  return lastID;
}

const rowOf = (id) => get('SELECT * FROM specialist_entries WHERE id = ?', [id]);
const entryCount = async () => (await get('SELECT COUNT(*) AS n FROM specialist_entries')).n;

// The body of a stored entry in the API format, so an edit can change one field at a time
async function bodyOf(id) {
  const row = await rowOf(id);
  return {
    entryDate: row.entry_date,
    entryType: row.entry_type,
    developmentArea: row.development_area,
    title: row.title,
    observationText: row.observation_text,
  };
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const TYPE_ERROR = 'Entry type must be one of: observation, session-note, evaluation';
const AREA_ERROR = 'Development area must be one of: motor, language, cognitive, social-emotional, self-care';
const DATE_ERROR = 'Date must be a valid date in YYYY-MM-DD format';

beforeAll(async () => {
  // Ayse has two children, Fatma has one. Mehmet and Burak are linked to Zeynep only;
  // Elif is not linked to anyone.
  await addUser('Ayse', 'parent');
  await addUser('Zeynep', 'child', 'Ayse');
  await addUser('Deniz', 'child', 'Ayse');
  await addUser('Fatma', 'parent');
  await addUser('Ali', 'child', 'Fatma');
  await addUser('Mehmet', 'specialist');
  await addUser('Burak', 'specialist');
  await addUser('Elif', 'specialist');
  await link('Zeynep', 'Mehmet');
  await link('Zeynep', 'Burak', 'psychologist');
});

// Every test starts without entries, so counts and orders do not depend on other tests
beforeEach(async () => {
  await run('DELETE FROM specialist_entries');
});

afterAll((done) => {
  db.close(done);
});

describe('POST /api/children/:childId/entries (FR-M5-01, FR-M5-02)', () => {
  test('a linked specialist adds an entry, which is returned in the API format', async () => {
    const res = await add('Mehmet', 'Zeynep');

    expect(res.status).toBe(201);
    expect(res.body.entry).toEqual({
      id: expect.any(Number),
      ...validBody,
      authorName: 'Mehmet',
      isEdited: false,
      isOwn: true,
      createdAt: expect.stringMatching(ISO_UTC),
      updatedAt: null,
    });
    expect(await rowOf(res.body.entry.id)).toMatchObject({
      child_id: users.Zeynep.id,
      author_id: users.Mehmet.id,
      is_edited: 0,
    });
  });

  test.each(['observation', 'session-note', 'evaluation'])('accepts the entry type "%s"', async (entryType) => {
    expect((await add('Mehmet', 'Zeynep', { ...validBody, entryType })).status).toBe(201);
  });

  test.each(['motor', 'language', 'cognitive', 'social-emotional', 'self-care'])(
    'accepts the development area "%s"',
    async (developmentArea) => {
      expect((await add('Mehmet', 'Zeynep', { ...validBody, developmentArea })).status).toBe(201);
    }
  );

  test("accepts today's date", async () => {
    expect((await add('Mehmet', 'Zeynep', { ...validBody, entryDate: today() })).status).toBe(201);
  });

  test('trims spaces around the title and the text, and keeps line breaks inside the text', async () => {
    const res = await add('Mehmet', 'Zeynep', {
      ...validBody,
      title: '  Reading aloud  ',
      observationText: '\n First line.\nSecond line. \n',
    });

    expect(res.body.entry.title).toBe('Reading aloud');
    expect(res.body.entry.observationText).toBe('First line.\nSecond line.');
  });

  test('accepts a title of 200 characters and a text of 5000 characters', async () => {
    const res = await add('Mehmet', 'Zeynep', {
      ...validBody,
      title: 'a'.repeat(200),
      observationText: 'b'.repeat(5000),
    });
    expect(res.status).toBe(201);
  });

  test('the author and the child come from the token and the URL, not from the request body', async () => {
    const res = await add('Mehmet', 'Zeynep', {
      ...validBody,
      authorId: users.Burak.id,
      childId: users.Ali.id,
      isEdited: true,
      updatedAt: '2026-11-20T10:00:00Z',
    });

    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ authorName: 'Mehmet', isEdited: false, updatedAt: null });
    expect(await rowOf(res.body.entry.id)).toMatchObject({
      child_id: users.Zeynep.id,
      author_id: users.Mehmet.id,
      updated_at: null,
    });
  });

  test.each([
    ['without a date', { entryDate: undefined }, 'Date is required'],
    ['with an empty date', { entryDate: '' }, 'Date is required'],
    ['with a date of null', { entryDate: null }, 'Date is required'],
    ['with a date in another format', { entryDate: '20-11-2026' }, DATE_ERROR],
    ['with a day that does not exist', { entryDate: '2026-02-30' }, DATE_ERROR],
    ['with a date that is a number', { entryDate: 20261120 }, DATE_ERROR],
    ['without an entry type', { entryType: undefined }, TYPE_ERROR],
    ['with an unknown entry type', { entryType: 'note' }, TYPE_ERROR],
    ['with an entry type in capitals', { entryType: 'Observation' }, TYPE_ERROR],
    ['without a development area', { developmentArea: undefined }, AREA_ERROR],
    ['with an unknown development area', { developmentArea: 'music' }, AREA_ERROR],
    ['without a title', { title: undefined }, 'Title is required'],
    ['with a title of only spaces', { title: '   ' }, 'Title is required'],
    ['with a title that is not text', { title: 42 }, 'Title is required'],
    ['with a title over 200 characters', { title: 'a'.repeat(201) }, 'Title must be at most 200 characters'],
    ['without a text', { observationText: undefined }, 'Text is required'],
    ['with a text of only spaces', { observationText: ' \n ' }, 'Text is required'],
    ['with a text that is not text', { observationText: ['a'] }, 'Text is required'],
    ['with a text over 5000 characters', { observationText: 'b'.repeat(5001) }, 'Text must be at most 5000 characters'],
  ])('rejects an entry %s with 400 and saves nothing', async (_name, changes, message) => {
    const res = await add('Mehmet', 'Zeynep', { ...validBody, ...changes });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
    expect(await entryCount()).toBe(0);
  });

  test('rejects a date after today with 400 and saves nothing', async () => {
    const res = await add('Mehmet', 'Zeynep', { ...validBody, entryDate: addDays(today(), 1) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Date cannot be in the future' });
    expect(await entryCount()).toBe(0);
  });

  test('rejects a request without a body with 400', async () => {
    expect((await request(app).post(entriesUrl('Zeynep')).set(as('Mehmet'))).status).toBe(400);
  });

  test.each([
    ['the child', 'Zeynep', 'Zeynep'],
    ['the parent', 'Ayse', 'Zeynep'],
    ['an unlinked specialist', 'Elif', 'Zeynep'],
    ['a specialist for a child they are not linked to', 'Mehmet', 'Deniz'],
  ])('rejects %s with 403 and saves nothing (FR-M5-06)', async (_name, userKey, childKey) => {
    expect((await add(userKey, childKey)).status).toBe(403);
    expect(await entryCount()).toBe(0);
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).post(entriesUrl('Zeynep')).send(validBody)).status).toBe(401);
  });
});

describe('GET /api/children/:childId/entries (FR-M5-03, FR-M5-06)', () => {
  test('the parent sees all entries of the child, the newest date first, with the author', async () => {
    const older = await insertEntry('Zeynep', 'Mehmet', { entry_date: '2026-11-10' });
    const newer = await insertEntry('Zeynep', 'Burak', { entry_date: '2026-11-20', entry_type: 'evaluation' });
    const sameDay = await insertEntry('Zeynep', 'Mehmet', { entry_date: '2026-11-20' });

    const res = await list('Ayse', 'Zeynep');

    expect(res.status).toBe(200);
    // Two entries on the same date: the one saved later comes first
    expect(res.body.entries.map((e) => e.id)).toEqual([sameDay, newer, older]);
    expect(res.body.entries[1]).toEqual({
      id: newer,
      entryDate: '2026-11-20',
      entryType: 'evaluation',
      developmentArea: 'motor',
      title: 'Balance exercises',
      observationText: 'Stood on one foot for ten seconds.',
      authorName: 'Burak',
      isEdited: false,
      isOwn: false,
      createdAt: expect.stringMatching(ISO_UTC),
      updatedAt: null,
    });
  });

  test('every linked specialist sees all entries; isOwn is true only for their own', async () => {
    const mehmets = await insertEntry('Zeynep', 'Mehmet', { entry_date: '2026-11-20' });
    const buraks = await insertEntry('Zeynep', 'Burak', { entry_date: '2026-11-19' });

    const asMehmet = (await list('Mehmet', 'Zeynep')).body.entries;
    const asBurak = (await list('Burak', 'Zeynep')).body.entries;

    expect(asMehmet.map((e) => [e.id, e.isOwn])).toEqual([
      [mehmets, true],
      [buraks, false],
    ]);
    expect(asBurak.map((e) => [e.id, e.isOwn])).toEqual([
      [mehmets, false],
      [buraks, true],
    ]);
  });

  test('the parent never owns an entry', async () => {
    await insertEntry('Zeynep', 'Mehmet');
    const [entry] = (await list('Ayse', 'Zeynep')).body.entries;
    expect(entry.isOwn).toBe(false);
  });

  test("does not include another child's entries", async () => {
    await insertEntry('Deniz', 'Elif');
    const own = await insertEntry('Zeynep', 'Mehmet');

    const res = await list('Ayse', 'Zeynep');
    expect(res.body.entries.map((e) => e.id)).toEqual([own]);
  });

  test('a child without entries gets an empty list', async () => {
    const res = await list('Ayse', 'Deniz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [] });
  });

  test('never returns email addresses, password hashes or user ids', async () => {
    await insertEntry('Zeynep', 'Mehmet');
    const text = JSON.stringify((await list('Ayse', 'Zeynep')).body);

    expect(text).not.toMatch(/@test\.com|test-hash|author_?[iI]d|child_?[iI]d/);
  });

  test.each([
    ['the child', 'Zeynep', 'Zeynep'],
    ["another child's parent", 'Fatma', 'Zeynep'],
    ['an unlinked specialist', 'Elif', 'Zeynep'],
    ['a specialist for a child they are not linked to', 'Mehmet', 'Deniz'],
  ])('rejects %s with 403 (FR-M5-06)', async (_name, userKey, childKey) => {
    await insertEntry('Zeynep', 'Mehmet');
    expect((await list(userKey, childKey)).status).toBe(403);
  });

  test('a specialist who is unlinked loses access even with a valid token (FR-M2-08)', async () => {
    await addUser('Can', 'specialist');
    await link('Zeynep', 'Can');
    expect((await list('Can', 'Zeynep')).status).toBe(200);

    await run('DELETE FROM specialist_links WHERE specialist_id = ?', [users.Can.id]);
    expect((await list('Can', 'Zeynep')).status).toBe(403);
  });

  test('returns 401 without a token', async () => {
    expect((await request(app).get(entriesUrl('Zeynep'))).status).toBe(401);
  });
});

describe('PATCH /api/children/:childId/entries/:entryId (FR-M5-04, FR-M5-05)', () => {
  test('the author edits the entry, which is then marked as edited', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');

    const res = await edit('Mehmet', 'Zeynep', id, { ...validBody, title: '  New title  ', entryType: 'evaluation' });

    expect(res.status).toBe(200);
    expect(res.body.entry).toEqual({
      id,
      ...validBody,
      title: 'New title',
      entryType: 'evaluation',
      authorName: 'Mehmet',
      isEdited: true,
      isOwn: true,
      createdAt: expect.stringMatching(ISO_UTC),
      updatedAt: expect.stringMatching(ISO_UTC),
    });
    expect(await rowOf(id)).toMatchObject({ title: 'New title', is_edited: 1, author_id: users.Mehmet.id });
  });

  test('the parent and the other specialist then see it as edited', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    await edit('Mehmet', 'Zeynep', id, { ...(await bodyOf(id)), title: 'Changed' });

    const [asParent] = (await list('Ayse', 'Zeynep')).body.entries;
    const [asBurak] = (await list('Burak', 'Zeynep')).body.entries;
    expect(asParent).toMatchObject({ title: 'Changed', isEdited: true });
    expect(asBurak).toMatchObject({ title: 'Changed', isEdited: true });
  });

  test.each([
    ['the date', { entryDate: '2026-11-17' }],
    ['the entry type', { entryType: 'evaluation' }],
    ['the development area', { developmentArea: 'cognitive' }],
    ['the title', { title: 'Another title' }],
    ['the text', { observationText: 'Another text.' }],
  ])('changing only %s marks the entry as edited', async (_name, changes) => {
    const id = await insertEntry('Zeynep', 'Mehmet');

    const res = await edit('Mehmet', 'Zeynep', id, { ...(await bodyOf(id)), ...changes });

    expect(res.status).toBe(200);
    expect(res.body.entry).toMatchObject({ ...changes, isEdited: true });
  });

  test('saving without a change does not mark the entry as edited', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    const body = await bodyOf(id);

    // Spaces around the title are trimmed, so this is the same entry
    const res = await edit('Mehmet', 'Zeynep', id, { ...body, title: ` ${body.title} ` });

    expect(res.status).toBe(200);
    expect(res.body.entry).toMatchObject({ isEdited: false, updatedAt: null });
    expect(await rowOf(id)).toMatchObject({ is_edited: 0, updated_at: null });
  });

  test('an edited entry stays edited when it is saved again without a change', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    const body = { ...(await bodyOf(id)), title: 'Changed' };
    await edit('Mehmet', 'Zeynep', id, body);

    const res = await edit('Mehmet', 'Zeynep', id, body);

    expect(res.body.entry).toMatchObject({ title: 'Changed', isEdited: true });
  });

  test('the author, the child and the creation time cannot be changed through the body', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    const before = await rowOf(id);

    await edit('Mehmet', 'Zeynep', id, {
      ...(await bodyOf(id)),
      title: 'Changed',
      authorId: users.Burak.id,
      childId: users.Ali.id,
      createdAt: '2020-01-01T00:00:00Z',
      isEdited: false,
    });

    expect(await rowOf(id)).toMatchObject({
      author_id: users.Mehmet.id,
      child_id: users.Zeynep.id,
      created_at: before.created_at,
      is_edited: 1,
    });
  });

  test('another linked specialist cannot edit the entry: 403 and nothing changes', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    const before = await rowOf(id);

    const res = await edit('Burak', 'Zeynep', id, { ...validBody, title: 'Not mine' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You can only edit your own entries' });
    expect(await rowOf(id)).toEqual(before);
  });

  test.each([
    ['the parent', 'Ayse'],
    ['the child', 'Zeynep'],
    ['an unlinked specialist', 'Elif'],
  ])('%s cannot edit an entry: 403 and nothing changes (FR-M5-06)', async (_name, userKey) => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    const before = await rowOf(id);

    const res = await edit(userKey, 'Zeynep', id, { ...validBody, title: 'Changed' });

    expect(res.status).toBe(403);
    expect(await rowOf(id)).toEqual(before);
  });

  test('a specialist who was unlinked cannot edit their own old entry', async () => {
    // Elif wrote this entry when she was linked to Deniz; the link no longer exists
    const id = await insertEntry('Deniz', 'Elif');

    const res = await edit('Elif', 'Deniz', id, { ...validBody, title: 'Changed' });

    expect(res.status).toBe(403);
    expect((await rowOf(id)).title).toBe('Balance exercises');
  });

  test("an entry of another child gets 404, even through the specialist's own child", async () => {
    // Mehmet's entry about Ali, asked for through Zeynep, who Mehmet is linked to
    const id = await insertEntry('Ali', 'Mehmet');

    const res = await edit('Mehmet', 'Zeynep', id, { ...validBody, title: 'Changed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Entry not found' });
    expect((await rowOf(id)).title).toBe('Balance exercises');
  });

  test("an entry that does not exist gets the same 404 as another child's entry", async () => {
    const res = await edit('Mehmet', 'Zeynep', 999999, validBody);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Entry not found' });
  });

  test.each(['abc', '0', '-1', '1.5', '1e3', '01', '12345678901'])('rejects the entry id "%s" with 400', async (entryId) => {
    const res = await edit('Mehmet', 'Zeynep', entryId, validBody);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid entry id' });
  });

  test.each([
    ['without a title', { title: '' }, 'Title is required'],
    ['with an unknown entry type', { entryType: 'note' }, TYPE_ERROR],
    ['with a date after today', { entryDate: addDays(today(), 1) }, 'Date cannot be in the future'],
  ])('rejects an edit %s with 400 and nothing changes', async (_name, changes, message) => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    const before = await rowOf(id);

    const res = await edit('Mehmet', 'Zeynep', id, { ...(await bodyOf(id)), ...changes });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
    expect(await rowOf(id)).toEqual(before);
  });

  test('returns 401 without a token', async () => {
    const id = await insertEntry('Zeynep', 'Mehmet');
    expect((await request(app).patch(entryUrl('Zeynep', id)).send(validBody)).status).toBe(401);
  });
});
