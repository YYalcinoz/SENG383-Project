const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Veritabanı yolunu process.env.DB_PATH üzerinden veya server/ klasöründe olacak şekilde ayarladık
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
  } else {
    console.log('Successfully connected to the SQLite database.');
  }
});

// İlk tablolarımızı oluşturalım (roller: parent, specialist, child)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('parent', 'specialist', 'child'))
  )`);
});

module.exports = db;