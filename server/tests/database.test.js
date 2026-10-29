// Test ortamında in-memory veritabanı kullanmak için DB_PATH'i :memory: yapıyoruz
process.env.DB_PATH = ':memory:';

const db = require('../src/db/database');

describe('Database and Table Tests', () => {
  afterAll((done) => {
    db.close(done);
  });

  test('users table should be created with correct columns and check constraints', (done) => {
    // Tablonun varlığını ve kolonlarını kontrol etmek için PRAGMA kullanıyoruz
    db.all("PRAGMA table_info(users);", (err, rows) => {
      expect(err).toBeNull();
      const columns = rows.map(r => r.name);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('email');
      expect(columns).toContain('role');
      done();
    });
  });

  test('should allow inserting valid roles (parent, specialist, child)', (done) => {
    db.run(
      `INSERT INTO users (name, email, role) VALUES (?, ?, ?)`,
      ['Test Parent', 'parent@test.com', 'parent'],
      function (err) {
        expect(err).toBeNull();
        expect(this.lastID).toBeGreaterThan(0);
        done();
      }
    );
  });

  test('should fail when inserting an invalid role due to CHECK constraint', (done) => {
    db.run(
      `INSERT INTO users (name, email, role) VALUES (?, ?, ?)`,
      ['Test Invalid', 'invalid@test.com', 'SuperAdmin'],
      (err) => {
        expect(err).not.toBeNull(); // CHECK kısıtından dolayı hata bekliyoruz
        done();
      }
    );
  });
});