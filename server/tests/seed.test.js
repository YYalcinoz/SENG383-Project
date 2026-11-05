const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

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
    expect(count).toBe(3);
    expect(columns).toContain('password_hash');
  });

  test('gives the same result when run twice', async () => {
    runSeed(dbPath);
    runSeed(dbPath);

    const [{ count }] = await query(dbPath, 'SELECT COUNT(*) AS count FROM users');
    expect(count).toBe(3);
  });
});
