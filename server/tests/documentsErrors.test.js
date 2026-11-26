const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = ':memory:';
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-documents-errors-'));
process.env.UPLOAD_DIR = uploadDir;

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { run } = require('../src/db/helpers');

let parentId;
let childId;

beforeAll(async () => {
  parentId = (await run("INSERT INTO users (name, email, password_hash, role) VALUES ('P', 'p@x', 'h', 'parent')"))
    .lastID;
  childId = (
    await run("INSERT INTO users (name, email, password_hash, role, parent_id) VALUES ('C', 'c@x', 'h', 'child', ?)", [
      parentId,
    ])
  ).lastID;
  // Every query on documents now fails, as if the database had a problem
  await run('DROP TABLE documents');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll((done) => {
  jest.restoreAllMocks();
  fs.rmSync(uploadDir, { recursive: true, force: true });
  db.close(done);
});

test('when the database cannot save the upload, the file is removed from the disk again', async () => {
  const token = jwt.sign({ sub: String(parentId), role: 'parent' }, jwtSecret, { algorithm: 'HS256' });

  const res = await request(app)
    .post(`/api/children/${childId}/documents`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('%PDF-1.7 body'), 'a.pdf');

  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Internal server error' });
  expect(fs.readdirSync(uploadDir)).toEqual([]);
});
