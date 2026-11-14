// Tarih yardımcıları (M3, M7, M8). Tarihler her yerde YYYY-MM-DD metni olarak taşınır.
// Gün hesapları UTC'de yapılır: sunucunun saat dilimi ya da yaz saati geçişi bir günü
// kaydırmasın diye. Sadece "bugün" sunucunun yerel saatine göredir (SDD, M3 API format).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Gerçek bir takvim günü mü: 2026-02-30 doğru biçimde ama böyle bir gün yok
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Sunucunun yerel saatine göre bugünün tarihi. UTC kullanılsaydı Türkiye'de Pazartesi
// 00:00–03:00 arasında hâlâ geçen hafta gösterilirdi.
function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Verilen günün bulunduğu hafta, Pazartesi–Pazar: '2026-11-13' → { start: '2026-11-09', end: '2026-11-15' }.
// Tarih verilmezse bu hafta. Geçersiz bir tarih programlama hatasıdır, bu yüzden hata fırlatır;
// kullanıcıdan gelen tarihi önce isValidDate ile kontrol et.
function getWeekRange(dateString = today()) {
  if (!isValidDate(dateString)) {
    throw new RangeError(`Invalid date: ${dateString}`);
  }
  const dayOfWeek = new Date(`${dateString}T00:00:00Z`).getUTCDay(); // 0 = Pazar, 1 = Pazartesi
  const start = addDays(dateString, -((dayOfWeek + 6) % 7));
  return { start, end: addDays(start, 6) };
}

module.exports = { isValidDate, getWeekRange, today };
