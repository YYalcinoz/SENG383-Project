process.env.DB_PATH = ':memory:';

const db = require('../src/db/database');
const { run, get } = require('../src/db/helpers');

describe('tasks', () => {
  let parentId, childId;

  const insertUser = (email, role, parent = null) =>
    run('INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)', [
      email,
      email,
      'test-hash',
      role,
      parent,
    ]);

  // A valid task; each test changes only the field it is trying
  const addTask = (changes = {}) => {
    const task = {
      child_id: childId,
      assigner_id: parentId,
      title: 'Read 10 pages',
      development_area: 'language',
      due_date: '2026-11-20',
      status: 'todo',
      done_at: null,
      ...changes,
    };
    return run(
      `INSERT INTO tasks (child_id, assigner_id, title, development_area, due_date, status, done_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        task.child_id,
        task.assigner_id,
        task.title,
        task.development_area,
        task.due_date,
        task.status,
        task.done_at,
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

  test('stores a valid task with the defaults: status todo, empty description, no done_at', async () => {
    const { lastID } = await addTask();
    const task = await get('SELECT * FROM tasks WHERE id = ?', [lastID]);

    expect(task).toMatchObject({
      child_id: childId,
      assigner_id: parentId,
      title: 'Read 10 pages',
      description: '',
      development_area: 'language',
      due_date: '2026-11-20',
      status: 'todo',
      done_at: null,
    });
    expect(task.created_at).toBeTruthy();
  });

  test.each(['motor', 'language', 'cognitive', 'social-emotional', 'self-care'])(
    'accepts the development area "%s"',
    async (area) => {
      const { changes } = await addTask({ development_area: area });
      expect(changes).toBe(1);
    }
  );

  test.each(['child_id', 'assigner_id', 'title', 'development_area', 'due_date'])(
    'rejects a task without %s',
    async (field) => {
      await expect(addTask({ [field]: null })).rejects.toThrow(/NOT NULL/);
    }
  );

  test.each(['', '   '])('rejects the empty title %j', async (title) => {
    await expect(addTask({ title })).rejects.toThrow(/CHECK/);
  });

  test('rejects an unknown development area', async () => {
    await expect(addTask({ development_area: 'music' })).rejects.toThrow(/CHECK/);
  });

  test.each(['2026/11/20', '20-11-2026', '2026-11-2', '2026-13-01', '2026-02-30', '2026-11-20 10:00'])(
    'rejects the due date "%s"',
    async (dueDate) => {
      await expect(addTask({ due_date: dueDate })).rejects.toThrow(/CHECK/);
    }
  );

  test('accepts a task that is todo without done_at and a task that is done with done_at', async () => {
    expect((await addTask({ status: 'todo', done_at: null })).changes).toBe(1);
    expect((await addTask({ status: 'done', done_at: '2026-11-14 08:30:00' })).changes).toBe(1);
  });

  test('rejects an unknown status', async () => {
    await expect(addTask({ status: 'finished', done_at: '2026-11-14 08:30:00' })).rejects.toThrow(/CHECK/);
  });

  describe('status and done_at belong together', () => {
    test('rejects a task that is done but has no done_at', async () => {
      await expect(addTask({ status: 'done', done_at: null })).rejects.toThrow(/CHECK/);
    });

    test('rejects a task that is todo but has a done_at', async () => {
      await expect(addTask({ status: 'todo', done_at: '2026-11-14 08:30:00' })).rejects.toThrow(/CHECK/);
    });

    test('rejects marking a task as done without setting done_at', async () => {
      const { lastID } = await addTask();
      await expect(run("UPDATE tasks SET status = 'done' WHERE id = ?", [lastID])).rejects.toThrow(/CHECK/);
    });

    test('accepts marking a task as done when done_at is set in the same update', async () => {
      const { lastID } = await addTask();
      const { changes } = await run(
        "UPDATE tasks SET status = 'done', done_at = CURRENT_TIMESTAMP WHERE id = ?",
        [lastID]
      );
      expect(changes).toBe(1);
    });

    test('rejects removing done_at from a task that is done', async () => {
      const { lastID } = await addTask({ status: 'done', done_at: '2026-11-14 08:30:00' });
      await expect(run('UPDATE tasks SET done_at = NULL WHERE id = ?', [lastID])).rejects.toThrow(/CHECK/);
    });

    test('rejects setting a done_at on a task that is still todo', async () => {
      const { lastID } = await addTask();
      await expect(
        run("UPDATE tasks SET done_at = '2026-11-14 08:30:00' WHERE id = ?", [lastID])
      ).rejects.toThrow(/CHECK/);
    });

    test('rejects putting a done task back to todo while done_at is still set', async () => {
      const { lastID } = await addTask({ status: 'done', done_at: '2026-11-14 08:30:00' });
      await expect(run("UPDATE tasks SET status = 'todo' WHERE id = ?", [lastID])).rejects.toThrow(/CHECK/);
    });
  });

  describe('done_at has the format of CURRENT_TIMESTAMP (UTC)', () => {
    test('accepts the value that the database itself writes with CURRENT_TIMESTAMP', async () => {
      const { lastID } = await addTask();
      await run("UPDATE tasks SET status = 'done', done_at = CURRENT_TIMESTAMP WHERE id = ?", [lastID]);

      const row = await get('SELECT done_at FROM tasks WHERE id = ?', [lastID]);

      expect(row.done_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test.each([
      ['an ISO time with T and Z', '2026-11-14T08:30:00Z'],
      ['a date without a time', '2026-11-14'],
      ['a time without seconds', '2026-11-14 08:30'],
      ['a month that does not exist', '2026-13-01 08:30:00'],
      ['a day that does not exist', '2026-02-30 08:30:00'],
      ['an hour that does not exist', '2026-11-14 25:00:00'],
      ['text that is not a date', 'yesterday'],
      ['an empty string', ''],
    ])('rejects done_at with %s', async (_name, value) => {
      await expect(addTask({ status: 'done', done_at: value })).rejects.toThrow(/CHECK/);
    });
  });

  test('rejects a task for a child that does not exist', async () => {
    await expect(addTask({ child_id: 99999 })).rejects.toThrow(/FOREIGN KEY/);
  });

  test('rejects a task whose assigner does not exist', async () => {
    await expect(addTask({ assigner_id: 99999 })).rejects.toThrow(/FOREIGN KEY/);
  });
});
