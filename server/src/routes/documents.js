const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { all, get, run } = require('../db/helpers');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireChildAccess } = require('../middleware/childAccess');
const { uploadLimiter } = require('../middleware/rateLimit');
const { uploadDir } = require('../config');

// FR-M6-06; must match the CHECK constraint on documents.size_bytes
const MAX_SIZE = 10 * 1024 * 1024;
const NAME_MAX = 255;

// FR-M6-02: the type is decided by the first bytes of the file, not by its name or by
// the type the browser sends, because the uploader controls both of those. A file that
// only claims to be a PDF (for example an HTML page renamed to .pdf) is rejected.
// Must match the CHECK constraint on documents.mime_type.
const FILE_TYPES = [
  { mimeType: 'application/pdf', signature: Buffer.from('%PDF-'), extensions: ['.pdf'] },
  {
    mimeType: 'image/png',
    signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    extensions: ['.png'],
  },
  { mimeType: 'image/jpeg', signature: Buffer.from([0xff, 0xd8, 0xff]), extensions: ['.jpg', '.jpeg'] },
];

const detectType = (buffer) =>
  FILE_TYPES.find((type) => buffer.subarray(0, type.signature.length).equals(type.signature));

// stored_name is always made by crypto.randomUUID(); it is checked again before it is
// used as a file name, so a changed database row can never point outside uploadDir.
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Control characters, and the Unicode direction marks that can make "invoice[U+202E]fdp.exe"
// look like "invoiceexe.pdf". Matching control characters is the point here.
// oxlint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

// The name shown in the list and offered when downloading. Only the last part of a path
// is kept, and the extension always matches the type found in the content, so a PNG
// uploaded as "photo.exe" is offered as "photo.exe.png".
function displayName(originalName, type) {
  let name = String(originalName ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(UNSAFE_CHARACTERS, '')
    .trim();
  if (!name) name = 'document';
  if (!type.extensions.includes(path.extname(name).toLowerCase())) name += type.extensions[0];
  if (name.length > NAME_MAX) {
    const extension = path.extname(name);
    name = name.slice(0, NAME_MAX - extension.length) + extension;
  }
  return name;
}

// The file is kept in memory until its type is checked, so a rejected file never
// reaches the disk. Only one file part named "file" is accepted, and no other fields.
// defParamCharset: browsers send the file name in UTF-8, so Turkish names stay readable.
const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 1, fields: 0, parts: 1 },
  defParamCharset: 'utf8',
}).single('file');

// Turns multer's errors into the API's { error } format
function receiveFile(req, res, next) {
  receive(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'The file must be at most 10 MB' });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Send exactly one file in the "file" field' });
    }
    // A broken multipart body (for example one that ends too early)
    return res.status(400).json({ error: 'The upload could not be read' });
  });
}

// Mounted under /api/children/:childId/documents, so :childId comes from the parent path
const router = express.Router({ mergeParams: true });

// uploadedAt is ISO 8601 in UTC, so the browser does not read it as local time
const SELECT_SQL = `SELECT d.id, d.original_name AS name, d.mime_type AS mimeType,
    d.size_bytes AS sizeBytes, u.name AS uploaderName,
    strftime('%Y-%m-%dT%H:%M:%SZ', d.uploaded_at) AS uploadedAt
  FROM documents d
  JOIN users u ON u.id = d.uploader_id`;

// FR-M6-03, FR-M6-05: the parent and every linked specialist see the child's documents,
// newest first; the child is rejected by requireRole
router.get('/', authenticate, requireRole('parent', 'specialist'), requireChildAccess, async (req, res) => {
  const documents = await all(`${SELECT_SQL} WHERE d.child_id = ? ORDER BY d.uploaded_at DESC, d.id DESC`, [
    req.child.id,
  ]);
  res.json({ documents });
});

// FR-M6-01, FR-M6-02, FR-M6-06: the parent or a linked specialist uploads a PDF, PNG or
// JPEG of at most 10 MB. The checks run before the body is read: who the user is, the
// upload limit, and access to the child.
router.post(
  '/',
  authenticate,
  requireRole('parent', 'specialist'),
  uploadLimiter,
  requireChildAccess,
  receiveFile,
  async (req, res) => {
    const { file } = req;
    if (!file) return res.status(400).json({ error: 'Choose a file to upload' });

    const type = detectType(file.buffer);
    if (!type) return res.status(400).json({ error: 'Only PDF, PNG and JPEG files can be uploaded' });

    const storedName = crypto.randomUUID();
    const filePath = path.join(uploadDir, storedName);
    await fs.mkdir(uploadDir, { recursive: true });
    // wx: never overwrite an existing file; 0o600: readable only by the server's user
    await fs.writeFile(filePath, file.buffer, { flag: 'wx', mode: 0o600 });

    let lastID;
    try {
      ({ lastID } = await run(
        `INSERT INTO documents (child_id, uploader_id, original_name, stored_name, mime_type, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.child.id, req.user.id, displayName(file.originalname, type), storedName, type.mimeType, file.size]
      ));
    } catch (err) {
      // No row points to the file, so it is removed instead of being left on disk
      await fs.rm(filePath, { force: true });
      throw err;
    }

    const document = await get(`${SELECT_SQL} WHERE d.id = ?`, [lastID]);
    res.status(201).json({ document });
  }
);

// FR-M6-04: download one of the child's documents. A document of another child, and one
// that does not exist, give the same 404. The file is always sent as a download with the
// type stored for it, and the browser may not guess another type (nosniff).
router.get(
  '/:documentId/download',
  authenticate,
  requireRole('parent', 'specialist'),
  requireChildAccess,
  async (req, res, next) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params.documentId)) {
      return res.status(400).json({ error: 'Invalid document id' });
    }
    const document = await get(
      'SELECT original_name, stored_name, mime_type FROM documents WHERE id = ? AND child_id = ?',
      [Number(req.params.documentId), req.child.id]
    );
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (!STORED_NAME.test(document.stored_name)) throw new Error('Unexpected stored file name');

    res.attachment(document.original_name);
    res.set({
      'Content-Type': document.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'private, no-store',
    });
    res.sendFile(document.stored_name, { root: uploadDir, dotfiles: 'deny' }, (err) => {
      if (!err || res.headersSent) return;
      // Undo the download headers, so the error is a normal JSON answer (res.json keeps
      // a Content-Type that is already set, so it must be removed too)
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Security-Policy');
      if (err.code === 'ENOENT' || err.status === 404) {
        return res.status(404).json({ error: 'Document not found' });
      }
      // A new error, so the answer never contains the file path from the original one;
      // the original is kept as the cause and logged by the error handler
      next(new Error('Could not send the document', { cause: err }));
    });
  }
);

module.exports = router;
