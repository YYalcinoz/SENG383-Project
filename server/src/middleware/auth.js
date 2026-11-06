const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

function authenticate(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');

  if (!match) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // algorithms listesi şart: token'ın kendi "alg" alanına güvenmiyoruz
    const payload = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
    const id = Number(payload.sub);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = { id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    // authenticate unutulursa 500 değil, güvenli tarafta kalıp 401 dönsün
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }

    next();
  };
}

module.exports = { authenticate, requireRole };
