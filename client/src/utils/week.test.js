import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { addDays, formatDate, formatDay, isValidDate, weekDays, weekStartOf } from './week.js'

test.each([
  ['2026-11-16', '2026-11-16'],
  ['2026-11-18', '2026-11-16'],
  ['2026-11-22', '2026-11-16'],
  ['2027-01-01', '2026-12-28'],
  ['2028-02-29', '2028-02-28'],
])('the week of %s starts on Monday %s', (date, monday) => {
  expect(weekStartOf(date)).toBe(monday)
})

test('adds and subtracts days across months and years', () => {
  expect(addDays('2026-11-16', 7)).toBe('2026-11-23')
  expect(addDays('2026-11-16', -7)).toBe('2026-11-09')
  expect(addDays('2026-12-28', 6)).toBe('2027-01-03')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})

test('lists the seven days of a week, Monday to Sunday', () => {
  expect(weekDays('2026-12-28')).toEqual([
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ])
})

test('formats days and dates in English', () => {
  expect(formatDay('2026-11-16')).toBe('Mon 16 Nov')
  expect(formatDay('2026-11-22')).toBe('Sun 22 Nov')
  expect(formatDate('2026-11-16')).toBe('16 Nov 2026')
})

test.each(['2026-11-16', '2028-02-29'])('accepts the date %s', (value) => {
  expect(isValidDate(value)).toBe(true)
})

test.each(['2026-02-30', '2026-13-01', '2026-11-6', 'abc', '', null, undefined, 20261116])(
  'rejects %j',
  (value) => {
    expect(isValidDate(value)).toBe(false)
  },
)

// Testler normalde UTC'de çalışır, bu yüzden formatDay / formatDate'teki timeZone: 'UTC'
// kaldırılsa da fark edilmezdi. Burada saat dilimi UTC'nin gerisinde olan bir yere alınır:
// orada '2026-11-16T00:00:00Z' hâlâ 15 Kasım'dır.
describe('in a time zone behind UTC (America/Los_Angeles)', () => {
  const originalTimeZone = process.env.TZ

  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles'
  })

  afterAll(() => {
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  test('the time zone change really took effect', () => {
    // Bu kontrol olmadan, saat dilimi değişmeseydi aşağıdaki testler bir şey kanıtlamazdı
    expect(new Date('2026-11-16T00:00:00Z').getDate()).toBe(15)
  })

  test('days and dates are not shifted to the previous day', () => {
    expect(formatDay('2026-11-16')).toBe('Mon 16 Nov')
    expect(formatDate('2026-11-16')).toBe('16 Nov 2026')
    expect(formatDate('2027-01-01')).toBe('1 Jan 2027')
  })

  test('week calculations stay the same', () => {
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16')
    expect(addDays('2026-11-16', 6)).toBe('2026-11-22')
    expect(weekDays('2026-11-16')[0]).toBe('2026-11-16')
  })
})
