const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const { addDays, getWeekRange, today } = require('../src/utils/week');

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
    expect(count).toBe(9);
    expect(columns).toContain('password_hash');
  });

  test('gives the same result when run twice', async () => {
    runSeed(dbPath);
    runSeed(dbPath);

    const [{ count }] = await query(dbPath, 'SELECT COUNT(*) AS count FROM users');
    expect(count).toBe(9);
  });

  test('links every child to a parent, in three separate families', async () => {
    runSeed(dbPath);

    const children = await query(
      dbPath,
      `SELECT c.parent_id, p.role AS parent_role
       FROM users c LEFT JOIN users p ON p.id = c.parent_id
       WHERE c.role = 'child'`
    );
    expect(children).toHaveLength(3);
    children.forEach((child) => expect(child.parent_role).toBe('parent'));
    expect(new Set(children.map((child) => child.parent_id)).size).toBe(3);
  });

  test('links Mehmet to Zeynep and Burak to Deniz, and nothing else', async () => {
    runSeed(dbPath);

    const links = await query(
      dbPath,
      `SELECT s.email AS specialist, c.email AS child
       FROM specialist_links l
       JOIN users s ON s.id = l.specialist_id
       JOIN users c ON c.id = l.child_id
       ORDER BY s.email`
    );
    expect(links).toEqual([
      { specialist: 'burak@example.com', child: 'deniz@example.com' },
      { specialist: 'mehmet@example.com', child: 'zeynep@example.com' },
    ]);
  });

  // E2E testleri (e2e/tests) bu hesaplara dayanır: login testi Ayşe'nin sadece Zeynep'i,
  // Mehmet'in sadece Zeynep'i gördüğünü, Flow 1 testi Fatma, Ali ve Elif'in boşta olduğunu varsayar
  test('keeps the accounts the E2E tests rely on unchanged', async () => {
    runSeed(dbPath);

    const childrenOf = await query(
      dbPath,
      `SELECT p.email AS parent, c.name AS child
       FROM users c JOIN users p ON p.id = c.parent_id
       WHERE p.email IN ('ayse@example.com', 'fatma@example.com')
       ORDER BY p.email`
    );
    expect(childrenOf).toEqual([
      { parent: 'ayse@example.com', child: 'Zeynep Yılmaz' },
      { parent: 'fatma@example.com', child: 'Ali Şahin' },
    ]);

    const [{ count: elifOrAliLinks }] = await query(
      dbPath,
      `SELECT COUNT(*) AS count FROM specialist_links l
       JOIN users s ON s.id = l.specialist_id
       JOIN users c ON c.id = l.child_id
       WHERE s.email = 'elif@example.com' OR c.email = 'ali@example.com'`
    );
    expect(elifOrAliLinks).toBe(0);
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

  describe('demo data for Deniz', () => {
    // Seed'in çalıştığı haftanın Pazartesi'si; demo verisi bu hafta ve gelecek hafta içinde olmalı
    const thisWeek = () => getWeekRange();
    const nextWeekEnd = () => addDays(thisWeek().start, 13);

    test('adds calendar events of all five types in this week and the next, by Selin and Burak', async () => {
      runSeed(dbPath);

      const events = await query(
        dbPath,
        `SELECT e.event_date, e.event_type, child.email AS child, creator.email AS creator
         FROM calendar_events e
         JOIN users child ON child.id = e.child_id
         JOIN users creator ON creator.id = e.creator_id`
      );
      expect(events.length).toBeGreaterThan(0);
      events.forEach((e) => {
        expect(e.child).toBe('deniz@example.com');
        expect(e.event_date >= thisWeek().start && e.event_date <= nextWeekEnd()).toBe(true);
      });
      expect(new Set(events.map((e) => e.event_type))).toEqual(
        new Set(['school', 'support', 'health', 'sports', 'other'])
      );
      expect(new Set(events.map((e) => e.creator))).toEqual(new Set(['selin@example.com', 'burak@example.com']));
      // Hem bu hafta hem gelecek hafta dolu
      expect(events.some((e) => e.event_date <= thisWeek().end)).toBe(true);
      expect(events.some((e) => e.event_date > thisWeek().end)).toBe(true);
    });

    test('adds tasks in all five areas, some done and some to do, by Selin and Burak', async () => {
      runSeed(dbPath);

      const tasks = await query(
        dbPath,
        `SELECT t.due_date, t.development_area, t.status, t.done_at,
                child.email AS child, assigner.email AS assigner
         FROM tasks t
         JOIN users child ON child.id = t.child_id
         JOIN users assigner ON assigner.id = t.assigner_id`
      );
      expect(tasks.length).toBeGreaterThan(0);
      tasks.forEach((t) => {
        expect(t.child).toBe('deniz@example.com');
        expect(t.due_date >= thisWeek().start && t.due_date <= nextWeekEnd()).toBe(true);
      });
      expect(new Set(tasks.map((t) => t.development_area))).toEqual(
        new Set(['motor', 'language', 'cognitive', 'social-emotional', 'self-care'])
      );
      expect(new Set(tasks.map((t) => t.status))).toEqual(new Set(['todo', 'done']));
      expect(new Set(tasks.map((t) => t.assigner))).toEqual(new Set(['selin@example.com', 'burak@example.com']));
    });

    test('done tasks have a done date and tasks to do do not', async () => {
      runSeed(dbPath);

      const tasks = await query(dbPath, 'SELECT id, status, done_at FROM tasks');

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.filter((t) => t.status === 'done' && t.done_at === null)).toEqual([]);
      expect(tasks.filter((t) => t.status === 'todo' && t.done_at !== null)).toEqual([]);
    });

    test('Zeynep and Ali get no events or tasks', async () => {
      runSeed(dbPath);

      const rows = await query(
        dbPath,
        `SELECT u.email,
           (SELECT COUNT(*) FROM calendar_events e WHERE e.child_id = u.id) AS events,
           (SELECT COUNT(*) FROM tasks t WHERE t.child_id = u.id) AS tasks
         FROM users u WHERE u.email IN ('zeynep@example.com', 'ali@example.com')
         ORDER BY u.email`
      );
      expect(rows).toEqual([
        { email: 'ali@example.com', events: 0, tasks: 0 },
        { email: 'zeynep@example.com', events: 0, tasks: 0 },
      ]);
    });

    test('adds specialist entries of all three types by Burak, in the last two weeks and never in the future', async () => {
      runSeed(dbPath);

      const entries = await query(
        dbPath,
        `SELECT e.entry_date, e.entry_type, e.is_edited, e.updated_at,
                child.email AS child, author.email AS author
         FROM specialist_entries e
         JOIN users child ON child.id = e.child_id
         JOIN users author ON author.id = e.author_id`
      );
      expect(entries.length).toBeGreaterThan(0);
      entries.forEach((e) => {
        expect(e.child).toBe('deniz@example.com');
        expect(e.author).toBe('burak@example.com');
        expect(e.entry_date >= addDays(today(), -13) && e.entry_date <= today()).toBe(true);
      });
      expect(new Set(entries.map((e) => e.entry_type))).toEqual(
        new Set(['observation', 'session-note', 'evaluation'])
      );
      // One entry is edited, so the demo shows the "Edited" label
      expect(entries.filter((e) => e.is_edited === 1 && e.updated_at !== null)).toHaveLength(1);
    });

    test('Zeynep and Ali get no specialist entries', async () => {
      runSeed(dbPath);

      const rows = await query(
        dbPath,
        `SELECT COUNT(*) AS count FROM specialist_entries e
         JOIN users u ON u.id = e.child_id
         WHERE u.email IN ('zeynep@example.com', 'ali@example.com')`
      );
      expect(rows).toEqual([{ count: 0 }]);
    });
  });
});
