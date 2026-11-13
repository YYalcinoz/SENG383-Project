const { getWeekRange, isValidDate, today } = require('../src/utils/week');

describe('getWeekRange', () => {
  test.each([
    ['a Monday', '2026-11-09', '2026-11-09', '2026-11-15'],
    ['a Friday', '2026-11-13', '2026-11-09', '2026-11-15'],
    ['a Sunday', '2026-11-15', '2026-11-09', '2026-11-15'],
    ['a week that starts in one month and ends in the next', '2026-03-01', '2026-02-23', '2026-03-01'],
    ['a week across the new year (from December)', '2026-12-31', '2026-12-28', '2027-01-03'],
    ['a week across the new year (from January)', '2027-01-01', '2026-12-28', '2027-01-03'],
    ['a leap day', '2028-02-29', '2028-02-28', '2028-03-05'],
  ])('gives Monday to Sunday for %s', (_name, date, start, end) => {
    expect(getWeekRange(date)).toEqual({ start, end });
  });

  test('without a date it gives the current week', () => {
    expect(getWeekRange()).toEqual(getWeekRange(today()));
  });

  test.each(['2026-02-30', '2026-13-01', 'abc', ''])('throws for the invalid date %j', (date) => {
    expect(() => getWeekRange(date)).toThrow(RangeError);
  });
});

describe('isValidDate', () => {
  test.each(['2026-11-13', '2028-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isValidDate(value)).toBe(true);
  });

  test.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-11-6',
    '2026/11/13',
    '13-11-2026',
    '2026-11-13T10:00',
    '',
    null,
    undefined,
    20261113,
    ['2026-11-13'],
  ])('rejects %j', (value) => {
    expect(isValidDate(value)).toBe(false);
  });
});

describe('today', () => {
  // Yerel saatle Pazartesi 01:30; UTC'ye göre Türkiye'de bu hâlâ Pazar olurdu
  test('uses the local date of the server', () => {
    expect(today(new Date(2026, 10, 9, 1, 30))).toBe('2026-11-09');
  });
});
