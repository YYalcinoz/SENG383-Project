const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = ':memory:';
// Uploaded files go to a temporary folder, never to server/uploads
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-documents-'));
process.env.UPLOAD_DIR = uploadDir;

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/database');
const { jwtSecret } = require('../src/config');
const { get, run } = require('../src/db/helpers');
const { resetRateLimits } = require('../src/middleware/rateLimit');

const users = {};
const tokenFor = (key) =>
  jwt.sign({ sub: String(users[key].id), role: users[key].role }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '2h',
  });
const as = (key) => ({ Authorization: `Bearer ${tokenFor(key)}` });

async function addUser(key, role, parentKey = null) {
  const { lastID } = await run(
    'INSERT INTO users (name, email, password_hash, role, parent_id) VALUES (?, ?, ?, ?, ?)',
    [key, `${key.toLowerCase()}@test.com`, 'test-hash', role, parentKey ? users[parentKey].id : null]
  );
  users[key] = { id: lastID, role };
}

const docsUrl = (childKey) => `/api/children/${users[childKey].id}/documents`;
const downloadUrl = (childKey, id) => `${docsUrl(childKey)}/${id}/download`;

// Small files that start with the real signature of each type
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('test pdf body')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png body')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg body')]);

const upload = (userKey, childKey, buffer, filename, contentType) =>
  request(app)
    .post(docsUrl(childKey))
    .set(as(userKey))
    .attach('file', buffer, contentType ? { filename, contentType } : { filename });

const filesOnDisk = () => fs.readdirSync(uploadDir);
const documentCount = async () => (await get('SELECT COUNT(*) AS n FROM documents')).n;

beforeAll(async () => {
  await addUser('ParentA', 'parent');
  await addUser('ChildA', 'child', 'ParentA');
  await addUser('ParentB', 'parent');
  await addUser('ChildB', 'child', 'ParentB');
  await addUser('Linked', 'specialist');
  await addUser('Unlinked', 'specialist');
  await run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
    users.ChildA.id,
    users.Linked.id,
    'teacher',
  ]);
});

beforeEach(async () => {
  await resetRateLimits();
  await run('DELETE FROM documents');
  for (const name of filesOnDisk()) fs.rmSync(path.join(uploadDir, name), { recursive: true, force: true });
});

afterAll((done) => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
  db.close(done);
});

describe('POST /api/children/:childId/documents (FR-M6-01, FR-M6-02, FR-M6-06)', () => {
  test('the parent uploads a PDF; it is stored under a random name with the same bytes', async () => {
    const res = await upload('ParentA', 'ChildA', PDF, 'report.pdf');

    expect(res.status).toBe(201);
    expect(res.body.document).toEqual({
      id: expect.any(Number),
      name: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      uploaderName: 'ParentA',
      uploadedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    });
    const [stored] = filesOnDisk();
    expect(stored).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(fs.readFileSync(path.join(uploadDir, stored)).equals(PDF)).toBe(true);
    const row = await get('SELECT * FROM documents WHERE id = ?', [res.body.document.id]);
    expect(row).toMatchObject({ child_id: users.ChildA.id, uploader_id: users.ParentA.id, stored_name: stored });
  });

  test.each([
    ['PNG', PNG, 'photo.png', 'image/png'],
    ['JPEG', JPEG, 'scan.jpg', 'image/jpeg'],
    ['JPEG with .jpeg', JPEG, 'scan.jpeg', 'image/jpeg'],
  ])('a linked specialist uploads a %s', async (_, buffer, filename, mimeType) => {
    const res = await upload('Linked', 'ChildA', buffer, filename);

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ name: filename, mimeType, uploaderName: 'Linked' });
  });

  test('the stored file can be read only by the server', async () => {
    if (process.platform === 'win32') return; // Windows has no Unix file modes
    await upload('ParentA', 'ChildA', PDF, 'report.pdf');

    const [stored] = filesOnDisk();

    expect(fs.statSync(path.join(uploadDir, stored)).mode & 0o777).toBe(0o600);
  });

  test('the type comes from the content, not from the name or the type the browser sends', async () => {
    const res = await upload('ParentA', 'ChildA', PNG, 'photo.png', 'application/pdf');

    expect(res.status).toBe(201);
    expect(res.body.document.mimeType).toBe('image/png');
  });

  test.each([
    ['a text file named .pdf', Buffer.from('just text'), 'notes.pdf', 'application/pdf'],
    ['an HTML page named .png', Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', 'image/png'],
    ['an SVG image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg', 'image/svg+xml'],
    ['a GIF image', Buffer.from('GIF89a....'), 'x.gif', 'image/gif'],
    ['a Windows program', Buffer.from('MZ\x90\x00 program'), 'tool.exe', 'application/octet-stream'],
    ['an empty file', Buffer.alloc(0), 'empty.pdf', 'application/pdf'],
    ['a file that only starts with part of a signature', Buffer.from('%PD'), 'short.pdf', 'application/pdf'],
  ])('rejects %s and stores nothing', async (_, buffer, filename, contentType) => {
    const res = await upload('ParentA', 'ChildA', buffer, filename, contentType);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Only PDF, PNG and JPEG files can be uploaded' });
    expect(filesOnDisk()).toEqual([]);
    expect(await documentCount()).toBe(0);
  });

  test('a file of exactly 10 MB is accepted', async () => {
    const buffer = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 - PDF.length)]);

    const res = await upload('ParentA', 'ChildA', buffer, 'big.pdf');

    expect(res.status).toBe(201);
    expect(res.body.document.sizeBytes).toBe(10 * 1024 * 1024);
  });

  test('a file one byte over 10 MB is rejected with 413 and nothing is stored', async () => {
    const buffer = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 - PDF.length + 1)]);

    const res = await upload('ParentA', 'ChildA', buffer, 'too-big.pdf');

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'The file must be at most 10 MB' });
    expect(filesOnDisk()).toEqual([]);
    expect(await documentCount()).toBe(0);
  });

  test('a request without a file is rejected', async () => {
    const res = await request(app).post(docsUrl('ChildA')).set(as('ParentA')).send({ name: 'x.pdf' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Choose a file to upload' });
  });

  test.each([
    ['two files', (req) => req.attach('file', PDF, 'a.pdf').attach('file', PDF, 'b.pdf')],
    ['a file under another field name', (req) => req.attach('document', PDF, 'a.pdf')],
    ['an extra text field', (req) => req.field('title', 'x').attach('file', PDF, 'a.pdf')],
  ])('%s is rejected and nothing is stored', async (_, build) => {
    const res = await build(request(app).post(docsUrl('ChildA')).set(as('ParentA')));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Send exactly one file in the "file" field' });
    expect(filesOnDisk()).toEqual([]);
    expect(await documentCount()).toBe(0);
  });

  test('a broken multipart body is rejected', async () => {
    const res = await request(app)
      .post(docsUrl('ChildA'))
      .set(as('ParentA'))
      .set('Content-Type', 'multipart/form-data; boundary=XYZ')
      .send('--XYZ\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n%PDF-');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'The upload could not be read' });
    expect(filesOnDisk()).toEqual([]);
  });

  test.each([
    ['the child', 'ChildA', 'ChildA'],
    ['an unlinked specialist', 'Unlinked', 'ChildA'],
    ["another child's parent", 'ParentB', 'ChildA'],
  ])('%s cannot upload, and nothing is stored', async (_, userKey, childKey) => {
    const res = await upload(userKey, childKey, PDF, 'a.pdf');

    expect(res.status).toBe(403);
    expect(filesOnDisk()).toEqual([]);
    expect(await documentCount()).toBe(0);
  });

  test('an upload without a token is rejected', async () => {
    const res = await request(app).post(docsUrl('ChildA')).attach('file', PDF, 'a.pdf');

    expect(res.status).toBe(401);
    expect(filesOnDisk()).toEqual([]);
  });
});

describe('file names', () => {
  test.each([
    ['a Unix path', '../../etc/passwd.pdf', 'passwd.pdf'],
    ['a Windows path', 'C:\\Users\\ayse\\rapor.pdf', 'rapor.pdf'],
    ['a Turkish name', 'Değerlendirme raporu ğüşiöç.pdf', 'Değerlendirme raporu ğüşiöç.pdf'],
    ['an extension that does not match the content', 'photo.exe', 'photo.exe.pdf'],
    ['no extension', 'report', 'report.pdf'],
    ['an upper-case extension', 'REPORT.PDF', 'REPORT.PDF'],
    ['spaces around the name', '   report.pdf  ', 'report.pdf'],
    ['only an extension', '.pdf', 'document.pdf'],
    ['a hidden-file name', '.hidden.pdf', 'hidden.pdf'],
    ['several leading dots', '...report.pdf', 'report.pdf'],
  ])('%s: "%s" is shown as "%s"', async (_, filename, shown) => {
    const res = await upload('ParentA', 'ChildA', PDF, filename);

    expect(res.status).toBe(201);
    expect(res.body.document.name).toBe(shown);
  });

  test('direction marks and control characters are removed from the name', async () => {
    // "invoice" + RIGHT-TO-LEFT OVERRIDE + "fdp.exe" would be shown as "invoiceexe.pdf";
    // a tab is the only control character a browser can send in a file name
    const rtlo = String.fromCharCode(0x202e);
    const filename = `invoice${rtlo}fdp.exe${String.fromCharCode(9)}x`;

    const res = await upload('ParentA', 'ChildA', PDF, filename);

    expect(res.body.document.name).toBe('invoicefdp.exex.pdf');
  });

  test('a name with other control characters is rejected before it reaches the route', async () => {
    const res = await upload('ParentA', 'ChildA', PDF, `a${String.fromCharCode(7)}.pdf`);

    expect(res.status).toBe(400);
    expect(filesOnDisk()).toEqual([]);
  });

  test('a name that is only removed characters becomes "document"', async () => {
    const res = await upload('ParentA', 'ChildA', PNG, String.fromCharCode(0x202e, 0x2066));

    expect(res.body.document.name).toBe('document.png');
  });

  test('shortening counts characters, so an emoji at the cut is never split in half', async () => {
    const emoji = String.fromCodePoint(0x1f600);
    const filename = `${'a'.repeat(249)}${emoji.repeat(5)}.pdf`;

    const res = await upload('ParentA', 'ChildA', PDF, filename);

    expect(res.status).toBe(201);
    const shown = res.body.document.name;
    expect(Array.from(shown)).toHaveLength(255);
    expect(shown).toBe(`${'a'.repeat(249)}${emoji.repeat(2)}.pdf`);
    // No half of a character (a lone surrogate) anywhere in the name
    expect(shown.isWellFormed()).toBe(true);
    const row = await get('SELECT original_name FROM documents WHERE id = ?', [res.body.document.id]);
    expect(row.original_name).toBe(shown);
  });

  test('a long name is shortened to 255 characters and keeps its extension', async () => {
    const res = await upload('ParentA', 'ChildA', PDF, `${'a'.repeat(300)}.pdf`);

    expect(res.body.document.name).toHaveLength(255);
    expect(res.body.document.name.endsWith('a.pdf')).toBe(true);
  });
});

describe('GET /api/children/:childId/documents (FR-M6-03, FR-M6-05)', () => {
  test('the parent and a linked specialist see the documents, newest first, with uploader and date', async () => {
    const first = (await upload('ParentA', 'ChildA', PDF, 'first.pdf')).body.document;
    const second = (await upload('Linked', 'ChildA', PNG, 'second.png')).body.document;
    await upload('ParentB', 'ChildB', PDF, 'other-child.pdf');

    for (const userKey of ['ParentA', 'Linked']) {
      const res = await request(app).get(docsUrl('ChildA')).set(as(userKey));

      expect(res.status).toBe(200);
      expect(res.body.documents).toEqual([second, first]);
    }
  });

  test('a child without documents has an empty list', async () => {
    const res = await request(app).get(docsUrl('ChildA')).set(as('ParentA'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ documents: [] });
  });

  test.each([
    ['the child', 'ChildA'],
    ['an unlinked specialist', 'Unlinked'],
    ["another child's parent", 'ParentB'],
  ])('%s cannot list the documents', async (_, userKey) => {
    await upload('ParentA', 'ChildA', PDF, 'a.pdf');

    const res = await request(app).get(docsUrl('ChildA')).set(as(userKey));

    expect(res.status).toBe(403);
    expect(res.body.documents).toBeUndefined();
  });
});

describe('GET /api/children/:childId/documents/:documentId/download (FR-M6-04, FR-M6-05)', () => {
  test('the parent downloads the same bytes, as an attachment of the stored type', async () => {
    const { id } = (await upload('Linked', 'ChildA', PDF, 'report.pdf')).body.document;

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA')).buffer(true);

    expect(res.status).toBe(200);
    expect(res.body.equals(PDF)).toBe(true);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename=report.pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'");
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('a linked specialist downloads a document the parent uploaded', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PNG, 'photo.png')).body.document;

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('Linked')).buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  test('a Turkish name is sent in the encoded form browsers understand', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'Değerlendirme.pdf')).body.document;

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA')).buffer(true);

    expect(res.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('Değerlendirme.pdf')}`);
  });

  test.each([
    ['the child', 'ChildA'],
    ['an unlinked specialist', 'Unlinked'],
    ["another child's parent", 'ParentB'],
  ])('%s cannot download', async (_, userKey) => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'a.pdf')).body.document;

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as(userKey));

    expect(res.status).toBe(403);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  test("a document of another child gives 404, even through the user's own child", async () => {
    const { id } = (await upload('ParentB', 'ChildB', PDF, 'b.pdf')).body.document;

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Document not found' });
  });

  test('a document that does not exist gives 404', async () => {
    const res = await request(app).get(downloadUrl('ChildA', 999999)).set(as('ParentA'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Document not found' });
  });

  test.each(['abc', '0', '-1', '1.5', '1e3', '01', '12345678901', '%2E%2E%2Fx'])(
    'an invalid document id (%s) gives 400',
    async (documentId) => {
      const res = await request(app).get(downloadUrl('ChildA', documentId)).set(as('ParentA'));

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid document id' });
    }
  );

  test('a document whose file is missing on disk gives a JSON 404, not a download', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'a.pdf')).body.document;
    for (const name of filesOnDisk()) fs.rmSync(path.join(uploadDir, name));

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA'));

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body).toEqual({ error: 'Document not found' });
  });

  test('a changed stored name in the database is never used as a path', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'a.pdf')).body.document;
    await run('UPDATE documents SET stored_name = ? WHERE id = ?', ['../../package.json', id]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(res.headers['content-disposition']).toBeUndefined();
    console.error.mockRestore();
  });

  test('a stored name that is not a random server name is never sent, even for a file inside the folder', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'a.pdf')).body.document;
    fs.writeFileSync(path.join(uploadDir, 'secret.txt'), 'not a document');
    await run('UPDATE documents SET stored_name = ? WHERE id = ?', ['secret.txt', id]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    console.error.mockRestore();
  });

  test('the Content-Type comes from the type found at upload, never from the file name', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PNG, 'photo.png')).body.document;
    await run('UPDATE documents SET original_name = ? WHERE id = ?', ['page.html', id]);

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA')).buffer(true);

    expect(res.headers['content-type']).toBe('image/png');
  });

  test('another error while sending the file is a JSON 500 without the file path', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'a.pdf')).body.document;
    // The stored name now points to a folder, which cannot be sent as a file
    const [stored] = filesOnDisk();
    fs.rmSync(path.join(uploadDir, stored));
    fs.mkdirSync(path.join(uploadDir, stored));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA'));

    expect([404, 500]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(JSON.stringify(res.body)).not.toContain(uploadDir);
    expect(res.headers['content-disposition']).toBeUndefined();
    console.error.mockRestore();
  });
});

describe('upload limit (20 uploads per user in 15 minutes)', () => {
  test('the 21st upload of a user is rejected; another user can still upload', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await upload('ParentA', 'ChildA', PDF, `a${i}.pdf`);
      expect(res.status).toBe(201);
    }

    const res = await upload('ParentA', 'ChildA', PDF, 'a20.pdf');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many uploads, please try again in 15 minutes' });
    expect(filesOnDisk()).toHaveLength(20);
    expect((await upload('Linked', 'ChildA', PDF, 'b.pdf')).status).toBe(201);
  });

  test('listing and downloading do not count as uploads', async () => {
    const { id } = (await upload('ParentA', 'ChildA', PDF, 'a.pdf')).body.document;
    for (let i = 0; i < 25; i++) {
      await request(app).get(docsUrl('ChildA')).set(as('ParentA'));
      await request(app).get(downloadUrl('ChildA', id)).set(as('ParentA'));
    }

    expect((await upload('ParentA', 'ChildA', PDF, 'b.pdf')).status).toBe(201);
  });
});
