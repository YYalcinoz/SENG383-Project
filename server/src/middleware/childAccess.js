const { get } = require('../db/helpers');

// Rejects with the same 403 whether the child does not exist or belongs to
// someone else, so the response does not reveal which child ids exist
const FORBIDDEN = { error: 'You do not have access to this child' };

async function canAccess(user, child) {
  if (user.role === 'parent') return child.parent_id === user.id;
  if (user.role === 'child') return child.id === user.id;
  if (user.role === 'specialist') {
    // Checked in the database on every request, not stored in the token, so an
    // unlinked specialist loses access even while their JWT is still valid
    const link = await get(
      'SELECT 1 FROM specialist_links WHERE child_id = ? AND specialist_id = ?',
      [child.id, user.id]
    );
    return Boolean(link);
  }
  return false;
}

// Use after authenticate on every route with :childId in the URL
async function requireChildAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!/^[1-9]\d{0,9}$/.test(req.params.childId)) {
    return res.status(400).json({ error: 'Invalid child id' });
  }

  const child = await get("SELECT id, parent_id FROM users WHERE id = ? AND role = 'child'", [
    Number(req.params.childId),
  ]);

  if (!child || !(await canAccess(req.user, child))) {
    return res.status(403).json(FORBIDDEN);
  }

  req.child = { id: child.id, parentId: child.parent_id };
  next();
}

module.exports = { requireChildAccess };
