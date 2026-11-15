import { isValidDate } from './week.js'

// Görevlerle ilgili ortak yardımcılar. Parent ve specialist görev sayfası ile çocuğun
// "My tasks" sayfası aynı biçimleri ve sıralamayı kullanır.

// Backend'deki DEVELOPMENT_AREAS ile aynı olmalı (server/src/routes/tasks.js)
export const DEVELOPMENT_AREAS = [
  { value: 'motor', label: 'Motor' },
  { value: 'language', label: 'Language' },
  { value: 'cognitive', label: 'Cognitive' },
  { value: 'social-emotional', label: 'Social-emotional' },
  { value: 'self-care', label: 'Self-care' },
]

const AREA_LABELS = Object.fromEntries(DEVELOPMENT_AREAS.map(({ value, label }) => [value, label]))

// Bilinmeyen bir değer gelirse olduğu gibi gösterilir
export const areaLabel = (value) => AREA_LABELS[value] ?? value

const STATUS_LABELS = { todo: 'To do', done: 'Done' }
export const statusLabel = (value) => STATUS_LABELS[value] ?? value

// Önce son tarihe, aynı tarihte id'ye göre: backend'deki ORDER BY due_date, id ile aynı sıra.
// Tarihler YYYY-MM-DD olduğu için metin olarak karşılaştırmak doğru sonucu verir.
export const byDueDate = (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id

// Backend'in döndürdüğü bir görev beklenen biçimde mi? Beklenmeyen bir cevap sayfayı
// çökertmesin, hata olarak gösterilsin diye liste bu kontrolden geçirilir.
export const isTask = (task) =>
  task !== null &&
  typeof task === 'object' &&
  Number.isInteger(task.id) &&
  typeof task.title === 'string' &&
  typeof task.description === 'string' &&
  typeof task.developmentArea === 'string' &&
  isValidDate(task.dueDate) &&
  (task.status === 'todo' || task.status === 'done') &&
  typeof task.assignerName === 'string'
