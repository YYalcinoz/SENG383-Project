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
      ...changes,
    };
    return run(
      `INSERT INTO tasks (child_id, assigner_id, title, development_area, due_date)
        VALUES (?, ?, ?, ?, ?)`,
      [task.child_id, task.assigner_id, task.title, task.development_area, task.due_date]
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

  test.each(['todo', 'done'])('accepts the status "%s"', async (status) => {
    const { lastID } = await addTask();
    const { changes } = await run('UPDATE tasks SET status = ? WHERE id = ?', [status, lastID]);
    expect(changes).toBe(1);
  });

  test('rejects an unknown status', async () => {
    const { lastID } = await addTask();
    await expect(run("UPDATE tasks SET status = 'finished' WHERE id = ?", [lastID])).rejects.toThrow(/CHECK/);
  });

  test('rejects a task for a child that does not exist', async () => {
    await expect(addTask({ child_id: 99999 })).rejects.toThrow(/FOREIGN KEY/);
  });

  test('rejects a task whose assigner does not exist', async () => {
    await expect(addTask({ assigner_id: 99999 })).rejects.toThrow(/FOREIGN KEY/);
  });
});
