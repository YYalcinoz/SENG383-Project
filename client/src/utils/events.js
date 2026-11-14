// Takvim etkinlikleri için ortak yardımcılar (M3)

// Backend'in sırasıyla aynı: tarih, başlangıç saati, id
export const byDateAndTime = (a, b) =>
  a.eventDate.localeCompare(b.eventDate) || a.startTime.localeCompare(b.startTime) || a.id - b.id

// '16:00–17:00', bitiş saati yoksa sadece '16:00'
export const timeOf = (event) => (event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime)
