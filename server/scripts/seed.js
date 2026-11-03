const bcrypt = require('bcryptjs');
const db = require('../src/db/database');

// Sadece sentetik demo hesapları için
const passwordHash = bcrypt.hashSync('password123', 10);

const sampleUsers = [
  { name: 'Ayşe Yılmaz', email: 'ayse@example.com', role: 'parent' },
  { name: 'Mehmet Demir', email: 'mehmet@example.com', role: 'specialist' },
  { name: 'Zeynep Kaya', email: 'zeynep@example.com', role: 'child' }
];

db.serialize(() => {
  console.log('Seed process started...');

  const stmt = db.prepare(`INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`);

  sampleUsers.forEach(user => {
    stmt.run(user.name, user.email, passwordHash, user.role, (err) => {
      if (err) {
        console.error('Error inserting user:', err.message);
      } else {
        console.log(`Added: ${user.name}`);
      }
    });
  });

  stmt.finalize(() => {
    console.log('Seed process completed.');
    db.close();
  });
});