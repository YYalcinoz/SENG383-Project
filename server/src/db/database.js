require('../config');
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

// Tablolar (roller: parent, specialist, child)
db.serialize(() => {
  // SQLite yabancı anahtarları varsayılan olarak uygulamaz; her bağlantıda açılmalı
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('parent', 'specialist', 'child')),
    parent_id INTEGER REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS specialist_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES users(id),
    specialist_id INTEGER NOT NULL REFERENCES users(id),
    specialist_type TEXT NOT NULL CHECK(specialist_type IN (
      'teacher', 'psychologist', 'doctor', 'special education teacher', 'coach'
    )),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (child_id, specialist_id)
  )`);
});

module.exports = db;