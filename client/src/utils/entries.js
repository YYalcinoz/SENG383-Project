import { isValidDate } from './week.js'

// Uzman girişleriyle ilgili ortak yardımcılar (M5). Gelişim alanları görevlerle aynıdır,
// onlar için utils/tasks.js'teki DEVELOPMENT_AREAS ve areaLabel kullanılır.

// Backend'deki ENTRY_TYPES ile aynı olmalı (server/src/routes/entries.js)
export const ENTRY_TYPES = [
  { value: 'observation', label: 'Observation' },
  { value: 'session-note', label: 'Session note' },
  { value: 'evaluation', label: 'Evaluation' },
]

const TYPE_LABELS = Object.fromEntries(ENTRY_TYPES.map(({ value, label }) => [value, label]))

// Bilinmeyen bir değer gelirse olduğu gibi gösterilir
export const entryTypeLabel = (value) => TYPE_LABELS[value] ?? value

// Önce en yeni tarih, aynı tarihte sonra kaydedilen önce: backend'deki
// ORDER BY entry_date DESC, id DESC ile aynı sıra. YYYY-MM-DD metin olarak doğru sıralanır.
export const byEntryDate = (a, b) => b.entryDate.localeCompare(a.entryDate) || b.id - a.id

// Backend'in döndürdüğü bir giriş beklenen biçimde mi? Beklenmeyen bir cevap sayfayı
// çökertmesin, hata olarak gösterilsin diye liste bu kontrolden geçirilir.
export const isEntry = (entry) =>
  entry !== null &&
  typeof entry === 'object' &&
  Number.isInteger(entry.id) &&
  isValidDate(entry.entryDate) &&
  typeof entry.entryType === 'string' &&
  typeof entry.developmentArea === 'string' &&
  typeof entry.title === 'string' &&
  typeof entry.observationText === 'string' &&
  typeof entry.authorName === 'string' &&
  typeof entry.isEdited === 'boolean' &&
  typeof entry.isOwn === 'boolean'
