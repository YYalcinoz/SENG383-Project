process.env.DB_PATH = ':memory:';

const db = require('../src/db/database');
const { run, get } = require('../src/db/helpers');

describe('specialist_entries', () => {
  let childId, specialistId;

  const insertUser = (email, role, parent = null) =>
    run('INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)', [
      email,
      email,
      'test-hash',
      role,
      parent,
    ]);

  // A valid entry; each test changes only the field it is trying
  const addEntry = (changes = {}) => {
    const entry = {
      child_id: childId,
      author_id: specialistId,
      entry_date: '2026-11-20',
      entry_type: 'observation',
      development_area: 'language',
      title: 'Reading aloud',
      observation_text: 'Read a short story aloud.',
      is_edited: 0,
      updated_at: null,
      ...changes,
    };
    return run(
      `INSERT INTO specialist_entries (child_id, author_id, entry_date, entry_type, development_area,
          title, observation_text, is_edited, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.child_id,
        entry.author_id,
        entry.entry_date,
        entry.entry_type,
        entry.development_area,
        entry.title,
        entry.observation_text,
        entry.is_edited,
        entry.updated_at,
      ]
    );
  };

  beforeAll(async () => {
    const parentId = (await insertUser('p@test.com', 'parent')).lastID;
    childId = (await insertUser('c@test.com', 'child', parentId)).lastID;
    specialistId = (await insertUser('s@test.com', 'specialist')).lastID;
  });

  afterAll((done) => {
    db.close(done);
  });

  test('stores a valid entry with the defaults: not edited, no updated_at', async () => {
    const { lastID } = await run(
      `INSERT INTO specialist_entries (child_id, author_id, entry_date, entry_type, development_area,
          title, observation_text)
        VALUES (?, ?, '2026-11-20', 'observation', 'language', 'Reading aloud', 'Read a story.')`,
      [childId, specialistId]
    );
    const entry = await get('SELECT * FROM specialist_entries WHERE id = ?', [lastID]);

    expect(entry).toMatchObject({ child_id: childId, author_id: specialistId, is_edited: 0, updated_at: null });
    expect(entry.created_at).toBeTruthy();
  });

  test.each(['observation', 'session-note', 'evaluation'])('accepts the entry type "%s"', async (type) => {
    expect((await addEntry({ entry_type: type })).changes).toBe(1);
  });

  test.each(['motor', 'language', 'cognitive', 'social-emotional', 'self-care'])(
    'accepts the development area "%s"',
    async (area) => {
      expect((await addEntry({ development_area: area })).changes).toBe(1);
    }
  );

  test.each(['child_id', 'author_id', 'entry_date', 'entry_type', 'development_area', 'title', 'observation_text'])(
    'rejects an entry without %s',
    async (field) => {
      await expect(addEntry({ [field]: null })).rejects.toThrow(/NOT NULL/);
    }
  );

  test.each(['', '   '])('rejects the empty title %j', async (title) => {
    await expect(addEntry({ title })).rejects.toThrow(/CHECK/);
  });

  test.each(['', '   '])('rejects the empty text %j', async (text) => {
    await expect(addEntry({ observation_text: text })).rejects.toThrow(/CHECK/);
  });

  test.each(['note', 'session note', 'Observation'])('rejects the entry type "%s"', async (type) => {
    await expect(addEntry({ entry_type: type })).rejects.toThrow(/CHECK/);
  });

  test('rejects an unknown development area', async () => {
    await expect(addEntry({ development_area: 'music' })).rejects.toThrow(/CHECK/);
  });

  test.each(['2026/11/20', '20-11-2026', '2026-11-2', '2026-13-01', '2026-02-30', '2026-11-20 10:00'])(
    'rejects the entry date "%s"',
    async (date) => {
      await expect(addEntry({ entry_date: date })).rejects.toThrow(/CHECK/);
    }
  );

  describe('is_edited and updated_at belong together (FR-M5-05)', () => {
    test('accepts an edited entry with updated_at', async () => {
      expect((await addEntry({ is_edited: 1, updated_at: '2026-11-21 09:00:00' })).changes).toBe(1);
    });

    test('rejects an edited entry without updated_at', async () => {
      await expect(addEntry({ is_edited: 1, updated_at: null })).rejects.toThrow(/CHECK/);
    });

    test('rejects an entry that is not edited but has updated_at', async () => {
      await expect(addEntry({ is_edited: 0, updated_at: '2026-11-21 09:00:00' })).rejects.toThrow(/CHECK/);
    });

    test('rejects marking an entry as edited without setting updated_at', async () => {
      const { lastID } = await addEntry();
      await expect(run('UPDATE specialist_entries SET is_edited = 1 WHERE id = ?', [lastID])).rejects.toThrow(
        /CHECK/
      );
    });

    test('accepts marking an entry as edited when updated_at is set in the same update', async () => {
      const { lastID } = await addEntry();
      const { changes } = await run(
        'UPDATE specialist_entries SET is_edited = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [lastID]
      );
      expect(changes).toBe(1);
    });

    test('rejects an is_edited other than 0 or 1', async () => {
      await expect(addEntry({ is_edited: 2, updated_at: '2026-11-21 09:00:00' })).rejects.toThrow(/CHECK/);
    });

    test.each(['2026-11-21', '2026-11-21T09:00:00Z', 'yesterday'])('rejects the updated_at "%s"', async (value) => {
      await expect(addEntry({ is_edited: 1, updated_at: value })).rejects.toThrow(/CHECK/);
    });
  });
});
