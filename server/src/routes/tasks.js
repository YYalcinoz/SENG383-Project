const express = require('express');
const { all, get, run } = require('../db/helpers');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireChildAccess } = require('../middleware/childAccess');
const { isValidDate } = require('../utils/week');

// Must match the CHECK constraint on tasks.development_area
const DEVELOPMENT_AREAS = ['motor', 'language', 'cognitive', 'social-emotional', 'self-care'];
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

// Mounted under /api/children/:childId/tasks, so :childId comes from the parent path
const router = express.Router({ mergeParams: true });

// dueDate is a plain date (YYYY-MM-DD). createdAt and doneAt are ISO 8601 in UTC,
// so the browser does not read them as local time; doneAt is null until the child
// marks the task as done (strftime of NULL is NULL).
const SELECT_SQL = `SELECT t.id, t.title, t.description,
    t.development_area AS developmentArea, t.due_date AS dueDate, t.status,
    u.name AS assignerName,
    strftime('%Y-%m-%dT%H:%M:%SZ', t.created_at) AS createdAt,
    strftime('%Y-%m-%dT%H:%M:%SZ', t.done_at) AS doneAt
  FROM tasks t
  JOIN users u ON u.id = t.assigner_id`;

// Returns the first problem as a message, or null when the body is valid (FR-M4-02)
function validateNewTask(body) {
  const { title, description, developmentArea, dueDate } = body || {};

  if (typeof title !== 'string' || !title.trim()) return 'Title is required';
  if (title.trim().length > TITLE_MAX) return `Title must be at most ${TITLE_MAX} characters`;
  if (!DEVELOPMENT_AREAS.includes(developmentArea)) {
    return `Development area must be one of: ${DEVELOPMENT_AREAS.join(', ')}`;
  }
  if (!isValidDate(dueDate)) return 'Due date must be a valid date in YYYY-MM-DD format';
  // The description is optional
  if (
    description !== undefined &&
    description !== null &&
    (typeof description !== 'string' || description.trim().length > DESCRIPTION_MAX)
  ) {
    return `Description must be text of at most ${DESCRIPTION_MAX} characters`;
  }
  return null;
}

// FR-M4-04, FR-M4-07: the parent and every linked specialist see all of the child's
// tasks, and the child sees their own. requireChildAccess already limits who may ask
// about this child, so no extra role check is needed here.
router.get('/', authenticate, requireChildAccess, async (req, res) => {
  const tasks = await all(`${SELECT_SQL} WHERE t.child_id = ? ORDER BY t.due_date, t.id`, [req.child.id]);
  res.json({ tasks });
});

// FR-M4-01, FR-M4-02, FR-M4-03, FR-M4-08: the parent or a linked specialist assigns a
// task; a child cannot
router.post('/', authenticate, requireRole('parent', 'specialist'), requireChildAccess, async (req, res) => {
  const error = validateNewTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { title, description, developmentArea, dueDate } = req.body;

  // assigner_id comes from the token, never from the request body. status and
  // done_at are not read from the body either: every new task starts as "todo".
  const { lastID } = await run(
    `INSERT INTO tasks (child_id, assigner_id, title, description, development_area, due_date)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [req.child.id, req.user.id, title.trim(), (description ?? '').trim(), developmentArea, dueDate]
  );

  const task = await get(`${SELECT_SQL} WHERE t.id = ?`, [lastID]);
  res.status(201).json({ task });
});

// FR-M4-05, FR-M4-06: only the child marks a task as done. Marking it again is not an
// error (a double click or a retried request), and doneAt keeps the first time.
router.patch('/:taskId/done', authenticate, requireRole('child'), requireChildAccess, async (req, res) => {
  if (!/^[1-9]\d{0,9}$/.test(req.params.taskId)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }

  // The child_id condition makes a missing task and another child's task look the
  // same (404), so the response does not reveal which task ids exist
  const { changes } = await run(
    `UPDATE tasks SET status = 'done', done_at = COALESCE(done_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND child_id = ?`,
    [Number(req.params.taskId), req.child.id]
  );
  if (changes === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const task = await get(`${SELECT_SQL} WHERE t.id = ?`, [Number(req.params.taskId)]);
  res.json({ task });
});

module.exports = router;
module.exports.DEVELOPMENT_AREAS = DEVELOPMENT_AREAS;
