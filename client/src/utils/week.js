// Haftalık görünüm için tarih yardımcıları. Tarihler backend'deki gibi YYYY-MM-DD metni
// olarak taşınır ve hesaplar UTC'de yapılır, böylece tarayıcının saat dilimi ya da yaz saati
// geçişi bir günü kaydıramaz (server/src/utils/week.js ile aynı kurallar).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const toDate = (dateString) => new Date(`${dateString}T00:00:00Z`)

// Gerçek bir takvim günü mü: 2026-02-30 doğru biçimde ama böyle bir gün yok
export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const date = toDate(value)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addDays(dateString, days) {
  const date = toDate(dateString)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// Verilen günün haftasının Pazartesi'si
export function weekStartOf(dateString) {
  const dayOfWeek = toDate(dateString).getUTCDay() // 0 = Pazar, 1 = Pazartesi
  return addDays(dateString, -((dayOfWeek + 6) % 7))
}

// Pazartesi'den Pazar'a haftanın yedi günü
export const weekDays = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

// '2026-11-16' → 'Mon 16 Nov'
export const formatDay = (dateString) =>
  toDate(dateString).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

// '2026-11-16' → '16 Nov 2026'
export const formatDate = (dateString) =>
  toDate(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
