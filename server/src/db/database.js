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
  // varsayılanı ''. done_at yalnızca çocuk görevi bitirince dolar: status 'done' ise done_at dolu,
  // 'todo' ise boştur (son CHECK) ve done_at, CURRENT_TIMESTAMP ile aynı biçimde (UTC) olmalıdır.
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
    done_at TEXT CHECK(done_at IS NULL OR datetime(done_at) IS done_at),
    CHECK((status = 'done') = (done_at IS NOT NULL))
  )`);

  // M5: uzman girişleri. entry_date gözlemin tarihidir (uzman seçer) ve diğer tarihler gibi
  // YYYY-MM-DD olarak saklanır; M8 haftanın girişlerini bu sütunla seçer. created_at girişin
  // kaydedildiği zamandır. is_edited ve updated_at birlikte değişir: düzenlenmemiş bir
  // girişte 0 ve boş, düzenlenmiş bir girişte 1 ve dolu (FR-M5-05, son CHECK); updated_at,
  // CURRENT_TIMESTAMP ile aynı biçimde (UTC). development_area, tasks ile aynı listedir.
  db.run(`CREATE TABLE IF NOT EXISTS specialist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES users(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    entry_date TEXT NOT NULL CHECK(date(entry_date) IS entry_date),
    entry_type TEXT NOT NULL CHECK(entry_type IN ('observation', 'session-note', 'evaluation')),
    development_area TEXT NOT NULL CHECK(development_area IN (
      'motor', 'language', 'cognitive', 'social-emotional', 'self-care'
    )),
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    observation_text TEXT NOT NULL CHECK(length(trim(observation_text)) > 0),
    is_edited INTEGER NOT NULL DEFAULT 0 CHECK(is_edited IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT CHECK(updated_at IS NULL OR datetime(updated_at) IS updated_at),
    CHECK((is_edited = 1) = (updated_at IS NOT NULL))
  )`);

  // M6: documents. The file itself is on disk under stored_name, a random name made by
  // the server, so the name the user chose (original_name) is only shown, never used as
  // a path. mime_type is the type found in the file's content, not the one the browser
  // sent; the limits match routes/documents.js.
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES users(id),
    uploader_id INTEGER NOT NULL REFERENCES users(id),
    original_name TEXT NOT NULL CHECK(length(original_name) BETWEEN 1 AND 255),
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
    size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;
