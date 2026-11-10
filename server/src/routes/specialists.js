const express = require('express');
const { all, get, run } = require('../db/helpers');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireChildAccess } = require('../middleware/childAccess');

// Must match the CHECK constraint on specialist_links.specialist_type
const SPECIALIST_TYPES = ['teacher', 'psychologist', 'doctor', 'special education teacher', 'coach'];

// Mounted under /api/children/:childId/specialists, so :childId comes from the parent path
const router = express.Router({ mergeParams: true });

// linkedAt is returned as ISO 8601 in UTC, so the browser does not read it as local time
const LIST_SQL = `SELECT u.id, u.name, l.specialist_type AS specialistType,
    strftime('%Y-%m-%dT%H:%M:%SZ', l.created_at) AS linkedAt
  FROM specialist_links l
  JOIN users u ON u.id = l.specialist_id
  WHERE l.child_id = ?`;

// FR-M2-03: only the parent manages the links, so only the parent sees the list.
// A specialist does not need to know which other specialists (e.g. a psychologist
// or a doctor) work with the child.
router.get('/', authenticate, requireRole('parent'), requireChildAccess, async (req, res) => {
  const specialists = await all(`${LIST_SQL} ORDER BY u.name`, [req.child.id]);
  res.json({ specialists });
});

// FR-M2-01, FR-M2-02, FR-M2-05: only the child's parent links a specialist
router.post('/', authenticate, requireRole('parent'), requireChildAccess, async (req, res) => {
  const { email, specialistType } = req.body || {};

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!SPECIALIST_TYPES.includes(specialistType)) {
    return res.status(400).json({ error: `Specialist type must be one of: ${SPECIALIST_TYPES.join(', ')}` });
  }

  // Same message whether the email is unknown or belongs to a parent or a child,
  // so the parent learns nothing about accounts that are not specialists
  const specialist = await get("SELECT id FROM users WHERE email = ? AND role = 'specialist'", [
    email.trim().toLowerCase(),
  ]);
  if (!specialist) {
    return res.status(400).json({ error: 'No registered specialist with this email' });
  }

  try {
    await run('INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)', [
      req.child.id,
      specialist.id,
      specialistType,
    ]);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' && /UNIQUE/.test(err.message)) {
      return res.status(409).json({ error: 'This specialist is already linked to the child' });
    }
    throw err;
  }

  const linked = await get(`${LIST_SQL} AND u.id = ?`, [req.child.id, specialist.id]);
  res.status(201).json({ specialist: linked });
});

// FR-M2-04, FR-M2-05: only the child's parent unlinks. The confirmation step is in the UI.
router.delete(
  '/:specialistId',
  authenticate,
  requireRole('parent'),
  requireChildAccess,
  async (req, res) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params.specialistId)) {
      return res.status(400).json({ error: 'Invalid specialist id' });
    }

    const { changes } = await run('DELETE FROM specialist_links WHERE child_id = ? AND specialist_id = ?', [
      req.child.id,
      Number(req.params.specialistId),
    ]);
    if (changes === 0) {
      return res.status(404).json({ error: 'This specialist is not linked to the child' });
    }

    // The specialist loses access on their next request, because requireChildAccess
    // reads the links from the database every time (FR-M2-08)
    res.status(204).end();
  }
);

module.exports = router;
module.exports.SPECIALIST_TYPES = SPECIALIST_TYPES;
