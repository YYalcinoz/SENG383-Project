const express = require('express');
const { all } = require('../db/helpers');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/children: the parent's own children, or the children a specialist is
// linked to. A child has no list of children, so the role check returns 403.
router.get('/', authenticate, requireRole('parent', 'specialist'), async (req, res) => {
  const children =
    req.user.role === 'parent'
      ? await all(
          "SELECT id, name FROM users WHERE role = 'child' AND parent_id = ? ORDER BY name",
          [req.user.id]
        )
      : await all(
          `SELECT u.id, u.name, l.specialist_type AS specialistType
           FROM specialist_links l
           JOIN users u ON u.id = l.child_id AND u.role = 'child'
           WHERE l.specialist_id = ?
           ORDER BY u.name`,
          [req.user.id]
        );

  res.json({ children });
});

module.exports = router;
