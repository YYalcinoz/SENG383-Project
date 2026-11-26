const { rateLimit, MemoryStore } = require('express-rate-limit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Each limiter has its own store, kept here so resetRateLimits() can clear them
const stores = [];

// All limiters count requests in a 15-minute window and answer 429 in the same
// { error } format as the rest of the API. The counts are kept in memory, so they
// start again from zero when the server restarts; this is enough for a single
// server process.
//
// The client's IP is taken from the connection. `trust proxy` is deliberately not
// set: with it, a client could choose its own IP by sending an X-Forwarded-For
// header and so never reach a limit. In development every request comes through
// the Vite proxy from localhost, so all users of one machine share the same limit.
function createLimiter({ limit, message, ...options }) {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    store,
    windowMs: FIFTEEN_MINUTES,
    limit,
    // RateLimit and RateLimit-Policy headers tell the client its limit and when
    // the window resets; the old X-RateLimit-* headers are not sent
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
    ...options,
  });
}

// Every /api request, per IP. High enough that normal use never reaches it
// (a page makes only a few requests); it stops a single client from flooding the API.
const apiLimiter = createLimiter({
  limit: 1000,
  message: 'Too many requests, please try again later',
});

// Login, per IP. Only failed attempts (status 400 or higher) count, so a user who
// logs in and out often is never blocked, while guessing passwords is limited to
// 10 tries per 15 minutes. The limit is per IP and not per email: a limit per email
// would let anyone lock a user out by entering wrong passwords for their email.
const loginLimiter = createLimiter({
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many failed login attempts, please try again in 15 minutes',
});

// Linking a specialist, per logged-in parent (so it must run after authenticate).
// Every answer tells the parent whether an email belongs to a specialist, so failed
// attempts are limited to stop a parent account from checking many emails. A
// successful attempt creates a link the parent can see, so it is not counted.
const linkSpecialistLimiter = createLimiter({
  limit: 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: 'Too many failed attempts to link a specialist, please try again in 15 minutes',
});

// Uploading a document (M6), per logged-in user (so it must run after authenticate).
// Every upload is counted, successful or not: each one can store up to 10 MB on disk,
// so this keeps one account from filling the disk.
const uploadLimiter = createLimiter({
  limit: 20,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: 'Too many uploads, please try again in 15 minutes',
});

// For tests only; the server never calls it. A test file shares one app, so its
// failed attempts add up across tests. A test file that does not test the limits
// calls this in beforeEach, so a new test can never fail with an unexpected 429.
async function resetRateLimits() {
  await Promise.all(stores.map((store) => store.resetAll()));
}

module.exports = { apiLimiter, loginLimiter, linkSpecialistLimiter, uploadLimiter, resetRateLimits };
