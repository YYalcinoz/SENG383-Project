process.env.DB_PATH = ':memory:';

const db = require('../src/db/database');
const { run, get } = require('../src/db/helpers');

describe('specialist_links', () => {
  let parentId, childId, specialistId;
  const insertUser = (email, role, parent = null) =>
    run(
      'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
      [email, email, 'test-hash', role, parent]
    );
  const link = (child, specialist, type = 'teacher') =>
    run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
      child,
      specialist,
      type,
    ]);

  beforeAll(async () => {
    parentId = (await insertUser('p@test.com', 'parent')).lastID;
    childId = (await insertUser('c@test.com', 'child', parentId)).lastID;
    specialistId = (await insertUser('s@test.com', 'specialist')).lastID;
  });

  afterAll((done) => {
    db.close(done);
  });

  test('stores the parent of a child', async () => {
    const child = await get('SELECT parent_id FROM users WHERE id = ?', [childId]);
    expect(child.parent_id).toBe(parentId);
  });

  test('links a specialist to a child', async () => {
    const { changes } = await link(childId, specialistId);
    expect(changes).toBe(1);
  });

  test('rejects linking the same specialist to the same child twice', async () => {
    await expect(link(childId, specialistId)).rejects.toThrow(/UNIQUE/);
  });

  test('rejects an unknown specialist type', async () => {
    const other = (await insertUser('s2@test.com', 'specialist')).lastID;
    await expect(link(childId, other, 'wizard')).rejects.toThrow(/CHECK/);
  });

  test('rejects a link to a user that does not exist', async () => {
    await expect(link(childId, 99999)).rejects.toThrow(/FOREIGN KEY/);
  });
});
