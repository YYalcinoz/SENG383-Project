import { expect, test } from 'vitest'
import { byUploadedAt, formatSize, formatUploadDate, isDocument, MAX_SIZE, typeLabel } from './documents.js'

const doc = (id, uploadedAt, extra = {}) => ({
  id,
  name: 'report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1000,
  uploaderName: 'Selin Kaya',
  uploadedAt,
  ...extra,
})

test('the size limit is 10 MB, the same as the backend', () => {
  expect(MAX_SIZE).toBe(10485760)
})

test('typeLabel names the three accepted types and shows anything else as it is', () => {
  expect(typeLabel('application/pdf')).toBe('PDF')
  expect(typeLabel('image/png')).toBe('PNG image')
  expect(typeLabel('image/jpeg')).toBe('JPEG image')
  expect(typeLabel('text/html')).toBe('text/html')
})

test.each([
  [1, '1 B'],
  [1023, '1023 B'],
  [1024, '1.0 KB'],
  [12595, '12.3 KB'],
  [1024 * 1024 - 1, '1024.0 KB'],
  [1024 * 1024, '1.0 MB'],
  [4718592, '4.5 MB'],
  [MAX_SIZE, '10.0 MB'],
])('formatSize(%i) is %s', (bytes, text) => {
  expect(formatSize(bytes)).toBe(text)
})

test('formatUploadDate shows the date of the upload', () => {
  // Midday in UTC is the same date in every time zone from UTC-11 to UTC+11
  expect(formatUploadDate('2026-11-24T12:00:00Z')).toBe('24 Nov 2026')
})

test("formatUploadDate uses the user's time zone, not UTC", () => {
  const zone = process.env.TZ
  try {
    // 22:30 UTC on 24 Nov is already 25 Nov in Turkey (UTC+3) and still 24 Nov in New York
    process.env.TZ = 'Europe/Istanbul'
    expect(formatUploadDate('2026-11-24T22:30:00Z')).toBe('25 Nov 2026')
    process.env.TZ = 'America/New_York'
    expect(formatUploadDate('2026-11-25T02:00:00Z')).toBe('24 Nov 2026')
  } finally {
    process.env.TZ = zone
  }
})

test('byUploadedAt puts the newest first, and the later upload first at the same second', () => {
  const sorted = [
    doc(1, '2026-11-20T10:00:00Z'),
    doc(2, '2026-11-24T09:00:00Z'),
    doc(3, '2026-11-20T10:00:00Z'),
    doc(4, '2026-11-01T23:59:59Z'),
  ].sort(byUploadedAt)
  expect(sorted.map((d) => d.id)).toEqual([2, 3, 1, 4])
})

test.each(['application/pdf', 'image/png', 'image/jpeg'])('isDocument accepts a %s document', (mimeType) => {
  expect(isDocument(doc(1, '2026-11-24T12:00:00Z', { mimeType }))).toBe(true)
})

test.each([
  ['null', null],
  ['a string', 'report.pdf'],
  ['a document without an id', doc(undefined, '2026-11-24T12:00:00Z')],
  ['a document whose id is text', doc('1', '2026-11-24T12:00:00Z')],
  ['a document without a name', doc(1, '2026-11-24T12:00:00Z', { name: '' })],
  ['an HTML document', doc(1, '2026-11-24T12:00:00Z', { mimeType: 'text/html' })],
  ['an SVG image', doc(1, '2026-11-24T12:00:00Z', { mimeType: 'image/svg+xml' })],
  ['a type that only looks like a key', doc(1, '2026-11-24T12:00:00Z', { mimeType: 'toString' })],
  ['an empty file', doc(1, '2026-11-24T12:00:00Z', { sizeBytes: 0 })],
  ['a size that is not a whole number', doc(1, '2026-11-24T12:00:00Z', { sizeBytes: 1.5 })],
  ['a document without an uploader', doc(1, '2026-11-24T12:00:00Z', { uploaderName: null })],
  ['a document with an invalid upload time', doc(1, 'yesterday')],
  ['a document without an upload time', doc(1, undefined)],
])('isDocument rejects %s', (_name, value) => {
  expect(isDocument(value)).toBe(false)
})
