process.env.DB_PATH = ':memory:';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { get, run } = require('../src/db/helpers');
const { getWeekRange, today } = require('../src/utils/week');

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

const linkSpecialist = (specialistKey, childKey) =>
  run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
    users[childKey].id,
    users[specialistKey].id,
    'teacher',
  ]);

const url = (childKey) => `/api/children/${users[childKey].id}/schedule`;

// Geçerli bir etkinlik; her test sadece denediği alanı değiştirir.
// POST testleri 16–22 Kasım haftasını kullanır, GET testleri 7–13 Aralık haftasını.
const VALID_EVENT = {
  title: 'Swimming class',
  eventDate: '2026-11-18',
  startTime: '16:00',
  endTime: '17:00',
  eventType: 'sports',
};

const addEvent = (userKey, childKey, changes = {}) =>
  request(app).post(url(childKey)).set(as(userKey)).send({ ...VALID_EVENT, ...changes });

const listWeek = (userKey, childKey, weekStart) =>
  request(app)
    .get(url(childKey))
    .query(weekStart === undefined ? {} : { weekStart })
    .set(as(userKey));

const countEvents = async () => (await get('SELECT COUNT(*) AS count FROM calendar_events')).count;

beforeAll(async () => {
  // İki aile; Mehmet Zeynep'e bağlı, Elif kimseye bağlı değil
  await addUser('Ayse', 'parent');
  await addUser('Zeynep', 'child', 'Ayse');
  await addUser('Fatma', 'parent');
  await addUser('Ali', 'child', 'Fatma');
  await addUser('Mehmet', 'specialist');
  await addUser('Elif', 'specialist');
  await linkSpecialist('Mehmet', 'Zeynep');
});

afterAll((done) => {
  db.close(done);
});

describe('POST /api/children/:childId/schedule', () => {
  test('the parent adds an event, which is returned in the API format', async () => {
    const res = await addEvent('Ayse', 'Zeynep');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      event: {
        id: expect.any(Number),
        title: 'Swimming class',
        eventDate: '2026-11-18',
        startTime: '16:00',
        endTime: '17:00',
        eventType: 'sports',
        creatorName: 'Ayse',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
      },
    });
  });

  test('a linked specialist adds an event', async () => {
    const res = await addEvent('Mehmet', 'Zeynep', { title: 'Reading session', eventType: 'support' });

    expect(res.status).toBe(201);
    expect(res.body.event.creatorName).toBe('Mehmet');
  });

  test('the creator and the child come from the token and the URL, not from the request body', async () => {
    const res = await addEvent('Ayse', 'Zeynep', {
      creatorId: users.Mehmet.id,
      creator_id: users.Mehmet.id,
      childId: users.Ali.id,
      child_id: users.Ali.id,
      creatorName: 'Someone else',
      id: 99999,
    });

    expect(res.status).toBe(201);
    expect(res.body.event.creatorName).toBe('Ayse');
    expect(res.body.event.id).not.toBe(99999);
    const saved = await get('SELECT child_id, creator_id FROM calendar_events WHERE id = ?', [res.body.event.id]);
    expect(saved).toEqual({ child_id: users.Zeynep.id, creator_id: users.Ayse.id });
  });

  test.each([
    ['left out', undefined],
    ['null', null],
    ['empty', ''],
  ])('the end time is optional (%s)', async (_name, endTime) => {
    const res = await addEvent('Ayse', 'Zeynep', { endTime });

    expect(res.status).toBe(201);
    expect(res.body.event.endTime).toBeNull();
  });

  test('trims spaces around the title', async () => {
    const res = await addEvent('Ayse', 'Zeynep', { title: '  Piano lesson  ' });

    expect(res.body.event.title).toBe('Piano lesson');
  });

  test('accepts a title of exactly 200 characters', async () => {
    const res = await addEvent('Ayse', 'Zeynep', { title: 'a'.repeat(200) });

    expect(res.status).toBe(201);
  });

  test.each(['school', 'support', 'health', 'sports', 'other'])('accepts the event type "%s"', async (eventType) => {
    const res = await addEvent('Ayse', 'Zeynep', { eventType });

    expect(res.status).toBe(201);
    expect(res.body.event.eventType).toBe(eventType);
  });

  const TYPE_ERROR = 'Event type must be one of: school, support, health, sports, other';

  test.each([
    ['a missing title', { title: undefined }, 'Title is required'],
    ['an empty title', { title: '   ' }, 'Title is required'],
    ['a title that is not text', { title: 42 }, 'Title is required'],
    ['a title of 201 characters', { title: 'a'.repeat(201) }, 'Title must be at most 200 characters'],
    ['a missing date', { eventDate: undefined }, 'Date is required'],
    ['an empty date', { eventDate: '' }, 'Date is required'],
    ['the date 2026/11/18', { eventDate: '2026/11/18' }, 'Date must be a valid date in YYYY-MM-DD format'],
    ['the date 18-11-2026', { eventDate: '18-11-2026' }, 'Date must be a valid date in YYYY-MM-DD format'],
    ['the date 2026-11-8', { eventDate: '2026-11-8' }, 'Date must be a valid date in YYYY-MM-DD format'],
    ['the date 2026-02-30', { eventDate: '2026-02-30' }, 'Date must be a valid date in YYYY-MM-DD format'],
    ['a date with a time', { eventDate: '2026-11-18T10:00' }, 'Date must be a valid date in YYYY-MM-DD format'],
    ['a date that is a number', { eventDate: 20261118 }, 'Date must be a valid date in YYYY-MM-DD format'],
    ['a missing start time', { startTime: undefined }, 'Start time is required'],
    ['an empty start time', { startTime: '' }, 'Start time is required'],
    ['the start time 9:30', { startTime: '9:30', endTime: null }, 'Start time must be a time in HH:MM format'],
    ['the start time 24:00', { startTime: '24:00', endTime: null }, 'Start time must be a time in HH:MM format'],
    ['the start time 12:60', { startTime: '12:60', endTime: null }, 'Start time must be a time in HH:MM format'],
    ['a start time with seconds', { startTime: '16:00:00' }, 'Start time must be a time in HH:MM format'],
    ['the start time 4pm', { startTime: '4pm' }, 'Start time must be a time in HH:MM format'],
    ['a start time that is a number', { startTime: 1600 }, 'Start time must be a time in HH:MM format'],
    ['the end time 17', { endTime: '17' }, 'End time must be a time in HH:MM format'],
    ['the end time 24:00', { endTime: '24:00' }, 'End time must be a time in HH:MM format'],
    ['an end time that is a number', { endTime: 1700 }, 'End time must be a time in HH:MM format'],
    ['an end time equal to the start time', { endTime: '16:00' }, 'End time must be after the start time'],
    ['an end time before the start time', { endTime: '15:30' }, 'End time must be after the start time'],
    ['a missing event type', { eventType: undefined }, TYPE_ERROR],
    ['an unknown event type', { eventType: 'party' }, TYPE_ERROR],
    ['an event type with a capital letter', { eventType: 'Sports' }, TYPE_ERROR],
  ])('rejects %s with 400 and saves nothing (FR-M3-02)', async (_name, changes, error) => {
    const before = await countEvents();

    const res = await addEvent('Ayse', 'Zeynep', changes);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(await countEvents()).toBe(before);
  });

  test('rejects a request without a body with 400', async () => {
    const res = await request(app).post(url('Zeynep')).set(as('Ayse'));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Title is required' });
  });

  test.each([
    ['the child', 'Zeynep', 'Zeynep'],
    ["another family's parent", 'Fatma', 'Zeynep'],
    ['an unlinked specialist', 'Elif', 'Zeynep'],
    ["a linked specialist, for a child they are not linked to", 'Mehmet', 'Ali'],
  ])('%s gets 403 and nothing is saved (FR-M3-05)', async (_name, userKey, childKey) => {
    const before = await countEvents();

    const res = await addEvent(userKey, childKey);

    expect(res.status).toBe(403);
    expect(await countEvents()).toBe(before);
  });

  test('returns 400 for an invalid child id', async () => {
    const res = await request(app).post('/api/children/abc/schedule').set(as('Ayse')).send(VALID_EVENT);

    expect(res.status).toBe(400);
  });

  test('returns 401 without a token', async () => {
    const res = await request(app).post(url('Zeynep')).send(VALID_EVENT);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/children/:childId/schedule', () => {
  // 7–13 Aralık haftası: Pazartesi 7, Pazar 13. 6 ve 14 Aralık bu haftanın dışında.
  const WEEK = { weekStart: '2026-12-07', weekEnd: '2026-12-13' };
  const WEEK_TITLES = ['School trip', 'Football', 'Speech therapy', 'Dentist'];

  const insertEvent = (childKey, creatorKey, title, eventDate, startTime, endTime, eventType) =>
    run(
      `INSERT INTO calendar_events (child_id, creator_id, title, event_date, start_time, end_time, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [users[childKey].id, users[creatorKey].id, title, eventDate, startTime, endTime, eventType]
    );

  beforeAll(async () => {
    // Sıralamayı denemek için bilerek karışık sırayla eklenir
    await insertEvent('Zeynep', 'Mehmet', 'Speech therapy', '2026-12-09', '10:00', null, 'support');
    await insertEvent('Zeynep', 'Ayse', 'Football', '2026-12-07', '16:00', '17:30', 'sports');
    await insertEvent('Zeynep', 'Ayse', 'Dentist', '2026-12-13', '11:00', '11:30', 'health');
    await insertEvent('Zeynep', 'Ayse', 'School trip', '2026-12-07', '09:00', '15:00', 'school');
    await insertEvent('Zeynep', 'Ayse', 'Sunday before the week', '2026-12-06', '10:00', null, 'other');
    await insertEvent('Zeynep', 'Ayse', 'Monday after the week', '2026-12-14', '10:00', null, 'other');
    await insertEvent('Ali', 'Fatma', 'Ali at the park', '2026-12-08', '15:00', null, 'other');
  });

  test("the parent sees the week's events, ordered by date and time, with the creator's name", async () => {
    const res = await listWeek('Ayse', 'Zeynep', WEEK.weekStart);

    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(WEEK.weekStart);
    expect(res.body.weekEnd).toBe(WEEK.weekEnd);
    expect(res.body.events.map((e) => e.title)).toEqual(WEEK_TITLES);
    expect(res.body.events[2]).toEqual({
      id: expect.any(Number),
      title: 'Speech therapy',
      eventDate: '2026-12-09',
      startTime: '10:00',
      endTime: null,
      eventType: 'support',
      creatorName: 'Mehmet',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    });
  });

  test.each(['2026-12-07', '2026-12-10', '2026-12-13'])(
    'any day of the week gives the same Monday–Sunday week (%s)',
    async (weekStart) => {
      const res = await listWeek('Ayse', 'Zeynep', weekStart);

      expect(res.body).toMatchObject(WEEK);
      expect(res.body.events.map((e) => e.title)).toEqual(WEEK_TITLES);
    }
  );

  test('a linked specialist sees all of the week\'s events, also those the parent added (FR-M3-03)', async () => {
    const res = await listWeek('Mehmet', 'Zeynep', WEEK.weekStart);

    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.title)).toEqual(WEEK_TITLES);
  });

  test('the child sees their own schedule (FR-M3-04)', async () => {
    const res = await listWeek('Zeynep', 'Zeynep', WEEK.weekStart);

    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => e.title)).toEqual(WEEK_TITLES);
  });

  test("does not include another child's events", async () => {
    const zeynep = await listWeek('Ayse', 'Zeynep', WEEK.weekStart);
    const ali = await listWeek('Fatma', 'Ali', WEEK.weekStart);

    expect(zeynep.body.events.map((e) => e.title)).not.toContain('Ali at the park');
    expect(ali.body.events.map((e) => e.title)).toEqual(['Ali at the park']);
  });

  test('a week without events gives an empty list', async () => {
    const res = await listWeek('Ayse', 'Zeynep', '2026-12-21');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weekStart: '2026-12-21', weekEnd: '2026-12-27', events: [] });
  });

  test("without weekStart it gives the current week, with that week's events", async () => {
    // Bugün ve tam bir hafta sonrası; test hangi gün çalışırsa çalışsın ilki bu haftada, ikincisi dışında
    const nextWeek = new Date(`${today()}T00:00:00Z`);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    await insertEvent('Zeynep', 'Ayse', 'Today at school', today(), '08:30', null, 'school');
    await insertEvent('Zeynep', 'Ayse', 'A week from today', nextWeek.toISOString().slice(0, 10), '08:30', null, 'school');

    const res = await listWeek('Ayse', 'Zeynep');
    const week = getWeekRange();

    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(week.start);
    expect(res.body.weekEnd).toBe(week.end);
    expect(res.body.events.map((e) => e.title)).toContain('Today at school');
    expect(res.body.events.map((e) => e.title)).not.toContain('A week from today');
  });

  test.each(['2026/12/07', '2026-02-30', 'abc', ''])('rejects weekStart %j with 400', async (weekStart) => {
    const res = await listWeek('Ayse', 'Zeynep', weekStart);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'weekStart must be a date in YYYY-MM-DD format' });
  });

  test('rejects weekStart given twice with 400', async () => {
    const res = await request(app)
      .get(`${url('Zeynep')}?weekStart=2026-12-07&weekStart=2026-12-14`)
      .set(as('Ayse'));

    expect(res.status).toBe(400);
  });

  test('never returns email addresses, password hashes or user ids of the creator', async () => {
    const res = await listWeek('Ayse', 'Zeynep', WEEK.weekStart);

    expect(res.text).not.toContain('@test.com');
    expect(res.text).not.toContain('test-hash');
    for (const event of res.body.events) {
      expect(Object.keys(event).sort()).toEqual(
        ['createdAt', 'creatorName', 'endTime', 'eventDate', 'eventType', 'id', 'startTime', 'title'].sort()
      );
    }
  });

  test.each([
    ["another family's parent", 'Fatma', 'Zeynep'],
    ['an unlinked specialist', 'Elif', 'Zeynep'],
    ['another child', 'Ali', 'Zeynep'],
  ])('%s gets 403 (FR-M3-05)', async (_name, userKey, childKey) => {
    const res = await listWeek(userKey, childKey, WEEK.weekStart);

    expect(res.status).toBe(403);
  });

  test('a specialist who is unlinked loses access even with a valid token (FR-M2-08)', async () => {
    await addUser('Can', 'specialist');
    await linkSpecialist('Can', 'Zeynep');
    expect((await listWeek('Can', 'Zeynep', WEEK.weekStart)).status).toBe(200);

    await run('DELETE FROM specialist_links WHERE specialist_id = ?', [users.Can.id]);

    expect((await listWeek('Can', 'Zeynep', WEEK.weekStart)).status).toBe(403);
  });

  test('returns 401 without a token', async () => {
    const res = await request(app).get(url('Zeynep'));

    expect(res.status).toBe(401);
  });
});
