const sqlite3 = require('sqlite3').verbose();
const dbPath = require('./path');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    // Veritabanı açılamazsa devam etmek yerine dur: yoksa sunucu sağlıklı
    // görünür ama veritabanı kullanan istekler hiç cevap almadan bekler
    console.error(`Cannot open the database at ${dbPath}: ${err.message}`);
    process.exit(1);
  }
  console.log('Successfully connected to the SQLite database.');
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

  // M3: haftalık program. Tarih YYYY-MM-DD, saat HH:MM olarak saklanır; biçim
  // veritabanında da kontrol edilir, çünkü haftalık görünüm ve M8 tarihleri
  // metin olarak karşılaştırır (event_date BETWEEN ...) ve bu sadece tüm
  // tarihler aynı biçimdeyse doğru çalışır. date()/time() geçersiz bir tarih
  // ya da saat için NULL döner, IS de NULL'u eşit saymaz. SQLite "24:00"ı
  // geçerli saydığı için ayrıca < '24:00' kontrol edilir.
  db.run(`CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES users(id),
    creator_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    event_date TEXT NOT NULL CHECK(date(event_date) IS event_date),
    start_time TEXT NOT NULL CHECK(time(start_time) IS (start_time || ':00') AND start_time < '24:00'),
    end_time TEXT CHECK(end_time IS NULL OR (
      time(end_time) IS (end_time || ':00') AND end_time < '24:00' AND end_time > start_time
    )),
    event_type TEXT NOT NULL CHECK(event_type IN ('school', 'support', 'health', 'sports', 'other')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // M4: görevler. due_date, calendar_events.event_date ile aynı kuralla YYYY-MM-DD
  // olarak saklanır ve biçim veritabanında da kontrol edilir (M7 haftalık sayımı
  // tarihleri metin olarak karşılaştırır). description boş bırakılabilir, bu yüzden
  // varsayılanı ''. done_at yalnızca çocuk görevi bitirince dolar.
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES users(id),
    assigner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    development_area TEXT NOT NULL CHECK(development_area IN (
      'motor', 'language', 'cognitive', 'social-emotional', 'self-care'
    )),
    due_date TEXT NOT NULL CHECK(date(due_date) IS due_date),
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_at TEXT
  )`);
});

module.exports = db;