const path = require('path');

// Veritabanı yolu tek yerde: hem bağlantı hem seed aynı dosyayı kullansın
module.exports = process.env.DB_PATH || path.resolve(__dirname, '../../database.db');
