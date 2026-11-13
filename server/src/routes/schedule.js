const express = require('express');
const { all, get, run } = require('../db/helpers');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireChildAccess } = require('../middleware/childAccess');
const { isValidDate, getWeekRange } = require('../utils/week');

// Must match the CHECK constraint on calendar_events.event_type
const EVENT_TYPES = ['school', 'support', 'health', 'sports', 'other'];
// Same limit as task titles (M4), so the modules behave the same
const TITLE_MAX = 200;
// HH:MM from 00:00 to 23:59, the same rule as the CHECK constraints on calendar_events
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Mounted under /api/children/:childId/schedule, so :childId comes from the parent path
const router = express.Router({ mergeParams: true });

// createdAt is ISO 8601 in UTC, so the browser does not read it as local time.
// Only the creator's name is returned, not their email address or id.
const SELECT_SQL = `SELECT e.id, e.title, e.event_date AS eventDate,
    e.start_time AS startTime, e.end_time AS endTime, e.event_type AS eventType,
    u.name AS creatorName,
    strftime('%Y-%m-%dT%H:%M:%SZ', e.created_at) AS createdAt
  FROM calendar_events e
  JOIN users u ON u.id = e.creator_id`;

const isEmpty = (value) => value === undefined || value === null || value === '';

// Returns the first problem as a message, or null when the body is valid (FR-M3-02)
function validateNewEvent(body) {
  const { title, eventDate, startTime, endTime, eventType } = body || {};

  if (typeof title !== 'string' || !title.trim()) return 'Title is required';
  if (title.trim().length > TITLE_MAX) return `Title must be at most ${TITLE_MAX} characters`;
  if (isEmpty(eventDate)) return 'Date is required';
  if (!isValidDate(eventDate)) return 'Date must be a valid date in YYYY-MM-DD format';
  if (isEmpty(startTime)) return 'Start time is required';
  if (typeof startTime !== 'string' || !TIME_PATTERN.test(startTime)) {
    return 'Start time must be a time in HH:MM format';
  }
  // The end time is optional (FR-M3-01 asks for one time)
  if (!isEmpty(endTime)) {
    if (typeof endTime !== 'string' || !TIME_PATTERN.test(endTime)) {
      return 'End time must be a time in HH:MM format';
    }
    // HH:MM strings compare in the same order as the times they stand for
    if (endTime <= startTime) return 'End time must be after the start time';
  }
  if (!EVENT_TYPES.includes(eventType)) {
    return `Event type must be one of: ${EVENT_TYPES.join(', ')}`;
  }
  return null;
}

// FR-M3-03, FR-M3-04: the parent, every linked specialist and the child see the
// child's events for one week (Monday–Sunday). requireChildAccess already limits
// who may ask about this child, so no extra role check is needed here.
router.get('/', authenticate, requireChildAccess, async (req, res) => {
  const { weekStart } = req.query;
  // An array (?weekStart=a&weekStart=b) is not a valid date either
  if (weekStart !== undefined && !isValidDate(weekStart)) {
    return res.status(400).json({ error: 'weekStart must be a date in YYYY-MM-DD format' });
  }

  // Any day of the week is accepted and turned into its Monday; without it, this week
  const week = getWeekRange(weekStart);
  const events = await all(
    `${SELECT_SQL}
      WHERE e.child_id = ? AND e.event_date BETWEEN ? AND ?
      ORDER BY e.event_date, e.start_time, e.id`,
    [req.child.id, week.start, week.end]
  );

  res.json({ weekStart: week.start, weekEnd: week.end, events });
});

// FR-M3-01, FR-M3-02, FR-M3-05: the parent or a linked specialist adds an event;
// a child, another family's parent and an unlinked specialist cannot
router.post(
  '/',
  authenticate,
  requireRole('parent', 'specialist'),
  requireChildAccess,
  async (req, res) => {
    const error = validateNewEvent(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { title, eventDate, startTime, endTime, eventType } = req.body;

    // creator_id comes from the token and child_id from requireChildAccess, never
    // from the request body
    const { lastID } = await run(
      `INSERT INTO calendar_events
        (child_id, creator_id, title, event_date, start_time, end_time, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.child.id,
        req.user.id,
        title.trim(),
        eventDate,
        startTime,
        isEmpty(endTime) ? null : endTime,
        eventType,
      ]
    );

    const event = await get(`${SELECT_SQL} WHERE e.id = ?`, [lastID]);
    res.status(201).json({ event });
  }
);

module.exports = router;
module.exports.EVENT_TYPES = EVENT_TYPES;
