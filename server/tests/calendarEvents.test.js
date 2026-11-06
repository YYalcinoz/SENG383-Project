process.env.DB_PATH = ':memory:';

const db = require('../src/db/database');
const { run, get } = require('../src/db/helpers');

describe('calendar_events', () => {
  let parentId, childId;

  const insertUser = (email, role, parent = null) =>
    run(
      'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
      [email, email, 'test-hash', role, parent]
    );

  // Geçerli bir etkinlik; her test sadece denediği alanı değiştirir
  const addEvent = (changes = {}) => {
    const event = {
      child_id: childId,
      creator_id: parentId,
      title: 'Swimming class',
      event_date: '2026-11-06',
      start_time: '16:00',
      end_time: '17:00',
      event_type: 'sports',
      ...changes,
    };
    return run(
      `INSERT INTO calendar_events
        (child_id, creator_id, title, event_date, start_time, end_time, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.child_id,
        event.creator_id,
        event.title,
        event.event_date,
        event.start_time,
        event.end_time,
        event.event_type,
      ]
    );
  };

  beforeAll(async () => {
    parentId = (await insertUser('p@test.com', 'parent')).lastID;
    childId = (await insertUser('c@test.com', 'child', parentId)).lastID;
  });

  afterAll((done) => {
    db.close(done);
  });

  test('stores a valid event and sets created_at', async () => {
    const { lastID } = await addEvent();
    const event = await get('SELECT * FROM calendar_events WHERE id = ?', [lastID]);

    expect(event).toMatchObject({
      child_id: childId,
      creator_id: parentId,
      title: 'Swimming class',
      event_date: '2026-11-06',
      start_time: '16:00',
      end_time: '17:00',
      event_type: 'sports',
    });
    expect(event.created_at).toBeTruthy();
  });

  test('allows an event without an end time', async () => {
    const { changes } = await addEvent({ end_time: null });
    expect(changes).toBe(1);
  });

  test.each(['school', 'support', 'health', 'sports', 'other'])(
    'accepts the event type "%s"',
    async (type) => {
      const { changes } = await addEvent({ event_type: type });
      expect(changes).toBe(1);
    }
  );

  test.each(['title', 'event_date', 'start_time', 'event_type'])(
    'rejects an event without %s',
    async (field) => {
      await expect(addEvent({ [field]: null })).rejects.toThrow(/NOT NULL/);
    }
  );

  test.each(['', '   '])('rejects the empty title %j', async (title) => {
    await expect(addEvent({ title })).rejects.toThrow(/CHECK/);
  });

  test('rejects an unknown event type', async () => {
    await expect(addEvent({ event_type: 'party' })).rejects.toThrow(/CHECK/);
  });

  test.each(['2026/11/06', '06-11-2026', '2026-11-6', '2026-13-01', '2026-02-30', '2026-11-06 10:00'])(
    'rejects the date "%s"',
    async (eventDate) => {
      await expect(addEvent({ event_date: eventDate })).rejects.toThrow(/CHECK/);
    }
  );

  test.each(['9:5', '9:30', '12:60', '24:00', '16:00:00', '4pm'])(
    'rejects the start time "%s"',
    async (startTime) => {
      await expect(addEvent({ start_time: startTime, end_time: null })).rejects.toThrow(/CHECK/);
    }
  );

  test.each(['16:00', '15:30', '17', '24:00'])(
    'rejects the end time "%s" when the event starts at 16:00',
    async (endTime) => {
      await expect(addEvent({ end_time: endTime })).rejects.toThrow(/CHECK/);
    }
  );

  test('rejects an event for a child that does not exist', async () => {
    await expect(addEvent({ child_id: 99999 })).rejects.toThrow(/FOREIGN KEY/);
  });

  test('rejects an event whose creator does not exist', async () => {
    await expect(addEvent({ creator_id: 99999 })).rejects.toThrow(/FOREIGN KEY/);
  });
});
