const bcrypt = require('bcryptjs');
const dbPath = require('../src/db/path');
const { resetDatabase } = require('./resetDatabase');

// Seed her seferinde sıfırdan kurar. CREATE TABLE IF NOT EXISTS eski tabloları
// değiştirmediği için şema değişince eski dosya uygulamayı bozardı. Veriler sentetik.
if (!resetDatabase(dbPath)) {
  console.error(
    'Cannot delete the database file, probably because the backend is still running. ' +
      'Stop the backend and run npm run seed again.'
  );
  process.exit(1);
}

const db = require('../src/db/database');
const { run } = require('../src/db/helpers');
const { addDays, getWeekRange } = require('../src/utils/week');

// Sadece sentetik demo hesapları için
const passwordHash = bcrypt.hashSync('password123', 10);

// Üç aile var. İkinci aile, bir kullanıcının başka ailenin çocuğuna erişemediğini test
// edebilmek için; üçüncüsü (Selin, Deniz) demo verisi için.
//
// E2E testleri bu hesaplara dayanır, bu yüzden ilk iki aile ve bağlantıları değiştirilmemeli:
// Ayşe sadece Zeynep'i, Mehmet sadece Zeynep'i görür; Fatma, Ali ve Elif'in hiç bağlantısı
// yoktur (Flow 1 E2E testi Elif'i Ali'ye bağlayıp geri alır). Demo verisi bu yüzden yeni bir
// aileye eklenir.
const families = [
  {
    parent: { name: 'Ayşe Yılmaz', email: 'ayse@example.com' },
    children: [{ name: 'Zeynep Yılmaz', email: 'zeynep@example.com' }],
  },
  {
    parent: { name: 'Fatma Şahin', email: 'fatma@example.com' },
    children: [{ name: 'Ali Şahin', email: 'ali@example.com' }],
  },
  {
    parent: { name: 'Selin Kaya', email: 'selin@example.com' },
    children: [{ name: 'Deniz Kaya', email: 'deniz@example.com' }],
  },
];

// Elif hiçbir çocuğa bağlı değil: ebeveynin uzman bağlama akışını (Flow 1)
// demo ve E2E testlerinde gösterebilmek için
const specialists = [
  { name: 'Mehmet Demir', email: 'mehmet@example.com' },
  { name: 'Elif Arslan', email: 'elif@example.com' },
  { name: 'Burak Öztürk', email: 'burak@example.com' },
];

// Mehmet sadece Zeynep'e bağlı. Ali'ye bağlı olmaması, bağlı olmayan bir
// uzmanın çocuğun verisini göremediğini test etmek için kullanılır.
// Burak sadece demo çocuğu Deniz'e bağlı.
const links = [
  { specialist: 'mehmet@example.com', child: 'zeynep@example.com', type: 'teacher' },
  { specialist: 'burak@example.com', child: 'deniz@example.com', type: 'psychologist' },
];

// --- Demo verisi (sadece Deniz için) ---
// Tarihler seed'in çalıştığı haftanın Pazartesi'sine göredir: day 0 bu Pazartesi, day 7 gelecek
// Pazartesi. Böylece demo hangi gün yapılırsa yapılsın bu hafta ve gelecek hafta dolu görünür.
const SELIN = 'selin@example.com';
const BURAK = 'burak@example.com';

const demoEvents = [
  // Bu hafta
  { day: 0, start: '08:30', end: '15:30', title: 'School', type: 'school', by: SELIN },
  { day: 1, start: '16:00', end: '17:00', title: 'Swimming class', type: 'sports', by: SELIN },
  { day: 2, start: '14:00', end: '14:45', title: 'Session with Burak', type: 'support', by: BURAK },
  { day: 3, start: '10:30', end: null, title: 'Dentist check-up', type: 'health', by: SELIN },
  { day: 5, start: '11:00', end: '13:00', title: 'Visit to grandma', type: 'other', by: SELIN },
  // Gelecek hafta
  { day: 7, start: '08:30', end: '15:30', title: 'School', type: 'school', by: SELIN },
  { day: 8, start: '16:00', end: '17:00', title: 'Swimming class', type: 'sports', by: SELIN },
  { day: 9, start: '14:00', end: '14:45', title: 'Session with Burak', type: 'support', by: BURAK },
  { day: 11, start: '15:00', end: null, title: 'School play rehearsal', type: 'school', by: SELIN },
  { day: 12, start: '10:00', end: '12:00', title: 'Football match', type: 'sports', by: SELIN },
];

const demoTasks = [
  // Bu hafta: bazıları tamamlanmış
  {
    day: 1,
    title: 'Read a picture book for 15 minutes',
    description: 'Read it aloud and tell what happened in the story.',
    area: 'language',
    by: SELIN,
    done: true,
  },
  { day: 2, title: 'Tie your shoelaces by yourself', description: '', area: 'self-care', by: SELIN, done: true },
  {
    day: 3,
    title: 'Name three feelings you had today',
    description: 'Write them down or tell them to your mum.',
    area: 'social-emotional',
    by: BURAK,
    done: false,
  },
  { day: 4, title: 'Sort the toy blocks by colour', description: '', area: 'cognitive', by: BURAK, done: true },
  { day: 5, title: 'Throw and catch a ball ten times', description: '', area: 'motor', by: SELIN, done: false },
  // Gelecek hafta: hepsi yapılacak
  { day: 7, title: 'Tell about your weekend in five sentences', description: '', area: 'language', by: SELIN, done: false },
  { day: 8, title: 'Draw a picture of your family', description: '', area: 'motor', by: BURAK, done: false },
  { day: 10, title: 'Help to set the table for dinner', description: '', area: 'self-care', by: SELIN, done: false },
];

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

  await seedDemoData(ids);
}

async function seedDemoData(ids) {
  const monday = getWeekRange().start;
  const childId = ids['deniz@example.com'];

  for (const event of demoEvents) {
    await run(
      `INSERT INTO calendar_events
        (child_id, creator_id, title, event_date, start_time, end_time, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [childId, ids[event.by], event.title, addDays(monday, event.day), event.start, event.end, event.type]
    );
  }
  console.log(`Added ${demoEvents.length} calendar events for Deniz Kaya`);

  for (const task of demoTasks) {
    const { lastID } = await run(
      `INSERT INTO tasks (child_id, assigner_id, title, description, development_area, due_date)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [childId, ids[task.by], task.title, task.description, task.area, addDays(monday, task.day)]
    );
    if (task.done) {
      // API'deki PATCH .../done ile aynı: done_at tamamlandığı an. Seed'in çalıştığı an
      // kullanılır, böylece bir görev hiçbir zaman gelecekte tamamlanmış görünmez.
      await run("UPDATE tasks SET status = 'done', done_at = CURRENT_TIMESTAMP WHERE id = ?", [lastID]);
    }
  }
  console.log(`Added ${demoTasks.length} tasks for Deniz Kaya`);
}

console.log('Seed process started...');

seed()
  .then(() => console.log('Seed process completed.'))
  .catch((err) => {
    console.error('Seed process failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
