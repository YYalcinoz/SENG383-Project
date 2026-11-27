import { formatDate, today } from './week.js'

// Shared helpers for documents (M6)

// The types the backend accepts (server/src/routes/documents.js), with their labels.
// Only these types are ever used to open a document in the browser.
export const DOCUMENT_TYPES = {
  'application/pdf': 'PDF',
  'image/png': 'PNG image',
  'image/jpeg': 'JPEG image',
}

// For the file picker; the backend checks the real type from the file's content
export const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

// FR-M6-06: the same limit as the backend, so a large file is rejected before it is sent
export const MAX_SIZE = 10 * 1024 * 1024

export const typeLabel = (mimeType) => DOCUMENT_TYPES[mimeType] ?? mimeType

// 532 → '532 B', 12_595 → '12.3 KB', 4_718_592 → '4.5 MB'
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// uploadedAt is ISO 8601 in UTC; the date is shown in the user's own time zone
export const formatUploadDate = (uploadedAt) => formatDate(today(new Date(uploadedAt)))

// Newest first, the same order as the backend (ORDER BY uploaded_at DESC, id DESC).
// ISO 8601 strings in UTC sort in time order.
export const byUploadedAt = (a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id - a.id

// Is a document from the backend in the expected shape? An unexpected answer is shown
// as an error instead of breaking the page. The type must be one of the three accepted
// types, because it decides how the browser opens the file.
export const isDocument = (document) =>
  document !== null &&
  typeof document === 'object' &&
  Number.isInteger(document.id) &&
  typeof document.name === 'string' &&
  document.name !== '' &&
  Object.hasOwn(DOCUMENT_TYPES, document.mimeType) &&
  Number.isInteger(document.sizeBytes) &&
  document.sizeBytes > 0 &&
  typeof document.uploaderName === 'string' &&
  typeof document.uploadedAt === 'string' &&
  !Number.isNaN(Date.parse(document.uploadedAt))
