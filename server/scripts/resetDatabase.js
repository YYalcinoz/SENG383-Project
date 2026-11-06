const fs = require('fs');

// Windows, kullanımdaki bir dosyanın silinmesine izin vermez ve bu hatalardan
// birini verir. EPERM salt okunur bir dosyada da gelebilir.
const FILE_IN_USE_CODES = ['EBUSY', 'EPERM'];

// Seed'den önce veritabanı dosyasını siler. Dosya kullanımdaysa false döner;
// beklenmeyen hatalar gizlenmesin diye diğer hatalar fırlatılır.
// removeFile, testlerde Windows'taki hatayı taklit edebilmek için parametre.
function resetDatabase(dbPath, removeFile = fs.rmSync) {
  if (dbPath === ':memory:') {
    return true;
  }

  try {
    removeFile(dbPath, { force: true });
    return true;
  } catch (err) {
    if (FILE_IN_USE_CODES.includes(err.code)) {
      return false;
    }
    throw err;
  }
}

module.exports = { resetDatabase };
