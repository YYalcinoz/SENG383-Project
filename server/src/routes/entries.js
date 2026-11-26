const express = require('express');
const { all, get, run } = require('../db/helpers');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireChildAccess } = require('../middleware/childAccess');
const { isValidDate, today } = require('../utils/week');
// The same development areas as tasks (M4), so M7 and M8 can group both the same way
const { DEVELOPMENT_AREAS } = require('./tasks');

// Must match the CHECK constraint on specialist_entries.entry_type
const ENTRY_TYPES = ['observation', 'session-note', 'evaluation'];
// Same limit as task and event titles, so the modules behave the same
const TITLE_MAX = 200;
const TEXT_MAX = 5000;

// Mounted under /api/children/:childId/entries, so :childId comes from the parent path
const router = express.Router({ mergeParams: true });

// The first ? is the id of the user who asks: isOwn tells the page which entries the
// user may edit, so the author's id is never sent. Only the author's name is returned.
// createdAt and updatedAt are ISO 8601 in UTC; updatedAt is null until the entry is
// edited (strftime of NULL is NULL).
const SELECT_SQL = `SELECT e.id, e.entry_date AS entryDate, e.entry_type AS entryType,
    e.development_area AS developmentArea, e.title, e.observation_text AS observationText,
    u.name AS authorName, e.is_edited AS isEdited, e.author_id = ? AS isOwn,
    strftime('%Y-%m-%dT%H:%M:%SZ', e.created_at) AS createdAt,
    strftime('%Y-%m-%dT%H:%M:%SZ', e.updated_at) AS updatedAt
  FROM specialist_entries e
  JOIN users u ON u.id = e.author_id`;

// SQLite returns 0 and 1; the API sends true and false
const toEntry = (row) => ({ ...row, isEdited: row.isEdited === 1, isOwn: row.isOwn === 1 });

const isEmpty = (value) => value === undefined || value === null || value === '';

// Returns the first problem as a message, or null when the body is valid (FR-M5-02).
// The same rules apply when an entry is added and when it is edited.
function validateEntry(body) {
  const { entryDate, entryType, developmentArea, title, observationText } = body || {};

  if (isEmpty(entryDate)) return 'Date is required';
  if (!isValidDate(entryDate)) return 'Date must be a valid date in YYYY-MM-DD format';
  // An entry records something that already happened. YYYY-MM-DD strings compare in
  // the same order as the dates; "today" is the server's local date, as in M3.
  if (entryDate > today()) return 'Date cannot be in the future';
  if (!ENTRY_TYPES.includes(entryType)) return `Entry type must be one of: ${ENTRY_TYPES.join(', ')}`;
  if (!DEVELOPMENT_AREAS.includes(developmentArea)) {
    return `Development area must be one of: ${DEVELOPMENT_AREAS.join(', ')}`;
  }
  if (typeof title !== 'string' || !title.trim()) return 'Title is required';
  if (title.trim().length > TITLE_MAX) return `Title must be at most ${TITLE_MAX} characters`;
  if (typeof observationText !== 'string' || !observationText.trim()) return 'Text is required';
  if (observationText.trim().length > TEXT_MAX) return `Text must be at most ${TEXT_MAX} characters`;
  return null;
}

// Only the fields a specialist writes; author, child and dates never come from the body
const fieldsOf = (body) => ({
  entryDate: body.entryDate,
  entryType: body.entryType,
  developmentArea: body.developmentArea,
  title: body.title.trim(),
  observationText: body.observationText.trim(),
});

// FR-M5-03, FR-M5-06: the parent and every linked specialist see all of the child's
// entries, the newest observation first. The child is rejected by requireRole.
router.get('/', authenticate, requireRole('parent', 'specialist'), requireChildAccess, async (req, res) => {
  const rows = await all(`${SELECT_SQL} WHERE e.child_id = ? ORDER BY e.entry_date DESC, e.id DESC`, [
    req.user.id,
    req.child.id,
  ]);
  res.json({ entries: rows.map(toEntry) });
});

// FR-M5-01, FR-M5-02, FR-M5-06: a linked specialist adds an entry; the parent and the
// child cannot
router.post('/', authenticate, requireRole('specialist'), requireChildAccess, async (req, res) => {
  const error = validateEntry(req.body);
  if (error) return res.status(400).json({ error });

  const entry = fieldsOf(req.body);
  // author_id comes from the token, never from the request body
  const { lastID } = await run(
    `INSERT INTO specialist_entries
      (child_id, author_id, entry_date, entry_type, development_area, title, observation_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.child.id, req.user.id, entry.entryDate, entry.entryType, entry.developmentArea, entry.title, entry.observationText]
  );

  const row = await get(`${SELECT_SQL} WHERE e.id = ?`, [req.user.id, lastID]);
  res.status(201).json({ entry: toEntry(row) });
});

// FR-M5-04, FR-M5-05: the specialist who wrote an entry edits it, and it is marked as
// edited. A linked specialist who is not the author already sees the entry in the list,
// so a 403 reveals nothing; another child's entry and a missing one give the same 404.
router.patch('/:entryId', authenticate, requireRole('specialist'), requireChildAccess, async (req, res) => {
  if (!/^[1-9]\d{0,9}$/.test(req.params.entryId)) {
    return res.status(400).json({ error: 'Invalid entry id' });
  }
  const id = Number(req.params.entryId);

  const current = await get(
    `SELECT author_id, entry_date AS entryDate, entry_type AS entryType,
        development_area AS developmentArea, title, observation_text AS observationText
      FROM specialist_entries WHERE id = ? AND child_id = ?`,
    [id, req.child.id]
  );
  if (!current) return res.status(404).json({ error: 'Entry not found' });
  if (current.author_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own entries' });
  }

  const error = validateEntry(req.body);
  if (error) return res.status(400).json({ error });

  const entry = fieldsOf(req.body);
  // Saving without a change (for example pressing Save twice) does not mark the entry
  // as edited
  const changed = Object.keys(entry).some((key) => entry[key] !== current[key]);
  if (changed) {
    await run(
      `UPDATE specialist_entries
        SET entry_date = ?, entry_type = ?, development_area = ?, title = ?, observation_text = ?,
          is_edited = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND child_id = ? AND author_id = ?`,
      [
        entry.entryDate,
        entry.entryType,
        entry.developmentArea,
        entry.title,
        entry.observationText,
        id,
        req.child.id,
        req.user.id,
      ]
    );
  }

  const row = await get(`${SELECT_SQL} WHERE e.id = ?`, [req.user.id, id]);
  res.json({ entry: toEntry(row) });
});

module.exports = router;
module.exports.ENTRY_TYPES = ENTRY_TYPES;
