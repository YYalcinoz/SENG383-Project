import { expect, test } from 'vitest'
import { byEntryDate, entryTypeLabel, isEntry } from './entries.js'

const entry = (id, entryDate, extra = {}) => ({
  id,
  entryDate,
  entryType: 'observation',
  developmentArea: 'motor',
  title: 'Title',
  observationText: 'Text',
  authorName: 'Burak Öztürk',
  isEdited: false,
  isOwn: false,
  ...extra,
})

test('byEntryDate puts the newest date first, and the later saved entry first on the same date', () => {
  const sorted = [entry(1, '2026-11-20'), entry(2, '2026-11-10'), entry(3, '2026-11-20')].sort(byEntryDate)
  expect(sorted.map((e) => e.id)).toEqual([3, 1, 2])
})

test('entryTypeLabel shows the known types by name and an unknown value as it is', () => {
  expect(entryTypeLabel('session-note')).toBe('Session note')
  expect(entryTypeLabel('evaluation')).toBe('Evaluation')
  expect(entryTypeLabel('other')).toBe('other')
})

test('isEntry accepts an entry in the API format', () => {
  expect(isEntry(entry(1, '2026-11-20'))).toBe(true)
})

test.each([
  ['null', null],
  ['an entry without an id', entry(undefined, '2026-11-20')],
  ['an entry with an invalid date', entry(1, '2026-02-30')],
  ['an entry whose text is not text', entry(1, '2026-11-20', { observationText: 5 })],
  ['an entry whose edited flag is not true or false', entry(1, '2026-11-20', { isEdited: 1 })],
  ['an entry without isOwn', entry(1, '2026-11-20', { isOwn: undefined })],
])('isEntry rejects %s', (_name, value) => {
  expect(isEntry(value)).toBe(false)
})
