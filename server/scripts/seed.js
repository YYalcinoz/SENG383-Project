const fs = require('fs');
const bcrypt = require('bcryptjs');
const dbPath = require('../src/db/path');

// Seed her seferinde sıfırdan kurar. CREATE TABLE IF NOT EXISTS eski tabloları
// değiştirmediği için şema değişince eski dosya uygulamayı bozardı. Veriler sentetik.
if (dbPath !== ':memory:') {
  fs.rmSync(dbPath, { force: true });
}

const db = require('../src/db/database');
const { run } = require('../src/db/helpers');

// Sadece sentetik demo hesapları için
const passwordHash = bcrypt.hashSync('password123', 10);

// İki aile var: ikinci aile, bir kullanıcının başka ailenin çocuğuna
// erişemediğini test edebilmek için
const families = [
  {
    parent: { name: 'Ayşe Yılmaz', email: 'ayse@example.com' },
    children: [{ name: 'Zeynep Yılmaz', email: 'zeynep@example.com' }],
  },
  {
    parent: { name: 'Fatma Şahin', email: 'fatma@example.com' },
    children: [{ name: 'Ali Şahin', email: 'ali@example.com' }],
  },
];

const specialists = [{ name: 'Mehmet Demir', email: 'mehmet@example.com' }];

// Mehmet sadece Zeynep'e bağlı. Ali'ye bağlı olmaması, bağlı olmayan bir
// uzmanın çocuğun verisini göremediğini test etmek için kullanılır.
const links = [{ specialist: 'mehmet@example.com', child: 'zeynep@example.com', type: 'teacher' }];

async function insertUser(user, role, parentId = null) {
  const { lastID } = await run(
    'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
    [user.name, user.email, passwordHash, role, parentId]
  );
  console.log(`Added ${role}: ${user.name}`);
  return lastID;
}

async function seed() {
  // e-posta -> id; çocukların parent_id'si ve bağlantılar için gerekiyor
  const ids = {};

  // Çocuğun parent_id'si ebeveynin id'sini gösterdiği için önce ebeveyn eklenir
  for (const { parent, children } of families) {
    ids[parent.email] = await insertUser(parent, 'parent');
    for (const child of children) {
      ids[child.email] = await insertUser(child, 'child', ids[parent.email]);
    }
  }

  for (const specialist of specialists) {
    ids[specialist.email] = await insertUser(specialist, 'specialist');
  }

  for (const link of links) {
    await run(
      'INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)',
      [ids[link.child], ids[link.specialist], link.type]
    );
    console.log(`Linked ${link.specialist} to ${link.child} as ${link.type}`);
  }
}

console.log('Seed process started...');

seed()
  .then(() => console.log('Seed process completed.'))
  .catch((err) => {
    console.error('Seed process failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
