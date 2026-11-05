const crypto = require('crypto');
const path = require('path');

// server/.env varsa okur; zaten tanımlı ortam değişkenlerini ezmez
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

// Repoya sabit secret koymuyoruz. .env yoksa uygulama yine çalışır;
// tek farkı, sunucu yeniden başlayınca eski token'ların geçersiz olmasıdır.
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('JWT_SECRET is not set: using a random secret, so logins end when the server restarts.');
}

module.exports = { jwtSecret };
