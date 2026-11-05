const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const runSeed = (dbPath) =>
  execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/seed.js')], {
    env: { ...process.env, DB_PATH: dbPath },
    encoding: 'utf8',
  });

const query = (dbPath, sql) =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all(sql, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });

describe('seed script', () => {
  let dir, dbPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-seed-'));
    dbPath = path.join(dir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('replaces a database that has an older schema', async () => {
    await query(dbPath, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT)');

    expect(runSeed(dbPath)).toContain('Seed process completed.');

    const [{ count }] = await query(dbPath, 'SELECT COUNT(*) AS count FROM users');
    const columns = (await query(dbPath, 'PRAGMA table_info(users)')).map((c) => c.name);
    expect(count).toBe(6);
    expect(columns).toContain('password_hash');
  });

  test('gives the same result when run twice', async () => {
    runSeed(dbPath);
    runSeed(dbPath);

    const [{ count }] = await query(dbPath, 'SELECT COUNT(*) AS count FROM users');
    expect(count).toBe(6);
  });

  test('links every child to a parent, in two separate families', async () => {
    runSeed(dbPath);

    const children = await query(
      dbPath,
      `SELECT c.parent_id, p.role AS parent_role
       FROM users c LEFT JOIN users p ON p.id = c.parent_id
       WHERE c.role = 'child'`
    );
    expect(children).toHaveLength(2);
    children.forEach((child) => expect(child.parent_role).toBe('parent'));
    expect(new Set(children.map((child) => child.parent_id)).size).toBe(2);
  });

  test('links the specialist to one child only', async () => {
    runSeed(dbPath);

    const links = await query(
      dbPath,
      `SELECT s.email AS specialist, c.email AS child
       FROM specialist_links l
       JOIN users s ON s.id = l.specialist_id
       JOIN users c ON c.id = l.child_id`
    );
    expect(links).toEqual([{ specialist: 'mehmet@example.com', child: 'zeynep@example.com' }]);
  });

  test('stores every email in lower case', async () => {
    runSeed(dbPath);

    const users = await query(dbPath, 'SELECT email FROM users');
    users.forEach(({ email }) => expect(email).toBe(email.toLowerCase()));
  });

  test('stores the demo password only as a bcrypt hash', async () => {
    runSeed(dbPath);

    const users = await query(dbPath, 'SELECT password_hash FROM users');
    for (const { password_hash: hash } of users) {
      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare('password123', hash)).toBe(true);
    }
  });
});
