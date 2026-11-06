const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const { get } = require('../db/helpers');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Kullanıcı yoksa da bcrypt çalışsın diye: yoksa cevap süresi hangi
// e-postaların kayıtlı olduğunu ele verir
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // E-postalar küçük harfle saklanır; " Ayse@Example.com " ile de giriş yapılabilsin
  const normalizedEmail = email.trim().toLowerCase();
  const user = await get('SELECT id, name, role, password_hash FROM users WHERE email = ?', [
    normalizedEmail,
  ]);
  const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ sub: String(user.id), role: user.role }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '2h',
  });

  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await get('SELECT id, name, role FROM users WHERE id = ?', [req.user.id]);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  res.json({ user });
});

module.exports = router;
