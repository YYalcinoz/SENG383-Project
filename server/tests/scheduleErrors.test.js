process.env.DB_PATH = ':memory:';

// Spy app'ten ÖNCE kurulmalı: routes/schedule.js yüklenirken `all`'u helpers'tan kopyalar,
// sonradan kurulan bir spy route'taki kopyayı değiştirmez ve test boşa geçer
const helpers = require('../src/db/helpers');
const allSpy = jest.spyOn(helpers, 'all');

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');

let token;
let childId;

beforeAll(async () => {
  const insert = 'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)';
  const parent = await helpers.run(insert, ['Parent', 'parent@test.com', 'test-hash', 'parent', null]);
  childId = (await helpers.run(insert, ['Child', 'child@test.com', 'test-hash', 'child', parent.lastID])).lastID;
  token = jwt.sign({ sub: String(parent.lastID), role: 'parent' }, jwtSecret, { algorithm: 'HS256', expiresIn: '2h' });
});

afterAll((done) => {
  jest.restoreAllMocks();
  db.close(done);
});

test('an unexpected error in the schedule routes returns 500 as JSON, without details', async () => {
  allSpy.mockRejectedValueOnce(new Error('SQLITE_ERROR: secret detail'));
  // Hata handler'ı 500'leri console.error ile yazar; test çıktısını kirletmesin
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const res = await request(app)
    .get(`/api/children/${childId}/schedule`)
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ error: 'Internal server error' });
  expect(res.text).not.toContain('secret detail');
  expect(allSpy).toHaveBeenCalled();
});
