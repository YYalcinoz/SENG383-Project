import { expect, test } from 'vitest'
import { areaLabel, byDueDate, DEVELOPMENT_AREAS, isTask, statusLabel } from './tasks.js'

const task = (changes = {}) => ({
  id: 1,
  title: 'Read',
  description: '',
  developmentArea: 'language',
  dueDate: '2026-11-20',
  status: 'todo',
  assignerName: 'Mehmet Demir',
  ...changes,
})

test('has the five development areas of the backend, with readable labels', () => {
  expect(DEVELOPMENT_AREAS.map((a) => a.value)).toEqual(['motor', 'language', 'cognitive', 'social-emotional', 'self-care'])
  expect(areaLabel('social-emotional')).toBe('Social-emotional')
  expect(areaLabel('self-care')).toBe('Self-care')
})

test('shows an unknown area or status as it is', () => {
  expect(areaLabel('music')).toBe('music')
  expect(statusLabel('todo')).toBe('To do')
  expect(statusLabel('done')).toBe('Done')
  expect(statusLabel('paused')).toBe('paused')
})

test('sorts by due date and then by id, like the backend', () => {
  const sorted = [
    task({ id: 1, dueDate: '2026-11-25' }),
    task({ id: 4, dueDate: '2026-11-12' }),
    task({ id: 3, dueDate: '2026-11-18' }),
    task({ id: 2, dueDate: '2026-11-12' }),
  ].sort(byDueDate)

  expect(sorted.map((t) => t.id)).toEqual([2, 4, 3, 1])
})

test('accepts a task in the API format', () => {
  expect(isTask(task())).toBe(true)
  expect(isTask(task({ status: 'done', description: 'Any book' }))).toBe(true)
})

test.each([
  ['null', null],
  ['text', 'task'],
  ['a missing id', task({ id: undefined })],
  ['an id that is not a whole number', task({ id: '1' })],
  ['a missing title', task({ title: undefined })],
  ['a missing description', task({ description: undefined })],
  ['a missing area', task({ developmentArea: undefined })],
  ['a due date that does not exist', task({ dueDate: '2026-02-30' })],
  ['a due date that is not text', task({ dueDate: 20261120 })],
  ['an unknown status', task({ status: 'paused' })],
  ['a missing assigner name', task({ assignerName: undefined })],
])('rejects a task with %s', (_name, value) => {
  expect(isTask(value)).toBe(false)
})
