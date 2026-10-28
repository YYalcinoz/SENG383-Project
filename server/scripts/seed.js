const db = require('../src/db/database');

const sampleUsers = [
  { name: 'Ayşe Yılmaz', email: 'ayse@example.com', role: 'Admin' },
  { name: 'Mehmet Demir', email: 'mehmet@example.com', role: 'User' },
  { name: 'Zeynep Kaya', email: 'zeynep@example.com', role: 'User' }
];

db.serialize(() => {
  console.log('Seed process started...');

  const stmt = db.prepare(`INSERT OR IGNORE INTO users (name, email, role) VALUES (?, ?, ?)`);

  sampleUsers.forEach(user => {
    stmt.run(user.name, user.email, user.role, (err) => {
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