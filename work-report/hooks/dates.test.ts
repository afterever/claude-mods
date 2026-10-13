import { test, expect } from 'claude-code/testing'

import { addDays, dayOfYear, daysFor, describeDays, keyOf, lastDays, noonOf, stretchName, yearToDate } from './dates'

// Tuesday 13 October 2026, mid-afternoon, in whatever zone the test runs in
const NOW = new Date(2026, 9, 13, 14, 30).getTime()

test('the day of the year counts from January 1, leap years included', () => {
  expect(dayOfYear(new Date(2026, 0, 1, 12))).toBe(1)
  expect(dayOfYear(new Date(2026, 1, 28, 12))).toBe(59)
  expect(dayOfYear(new Date(2026, 2, 1, 12))).toBe(60)
  expect(dayOfYear(new Date(2026, 9, 13, 12))).toBe(286)
  expect(dayOfYear(new Date(2026, 11, 31, 12))).toBe(365)
  expect(dayOfYear(new Date(2028, 2, 1, 12))).toBe(61)
  expect(dayOfYear(new Date(2028, 11, 31, 12))).toBe(366)
  // any hour of the day is the same day
  expect(dayOfYear(new Date(2026, 9, 13, 0, 5))).toBe(286)
  expect(dayOfYear(new Date(2026, 9, 13, 23, 59))).toBe(286)
})

test('stepping day by day from noon never skips or repeats a date, across both clock changes', () => {
  // 1 March to 30 April and 1 October to 30 November hold the clock changes of
  // the US and Europe; a zone with no change walks through them the same way
  for (const [month, count] of [[2, 61], [9, 61]] as const) {
    let day = new Date(2026, month, 1, 12)
    const keys: string[] = [keyOf(day)]
    for (let i = 0; i < count; i++) {
      day = addDays(day, 1)
      keys.push(keyOf(day))
    }
    expect(new Set(keys).size).toBe(keys.length)
    for (let i = 1; i < keys.length; i++) {
      const [y, m, d] = keys[i - 1]!.split('-').map(Number) as [number, number, number]
      const expected = new Date(Date.UTC(y, m - 1, d + 1))
      const got = keys[i]!.split('-').map(Number) as [number, number, number]
      expect([got[0], got[1], got[2]]).toEqual([expected.getUTCFullYear(), expected.getUTCMonth() + 1, expected.getUTCDate()])
    }
  }
})

test('a day is always held at its local noon', () => {
  expect(noonOf(NOW).getHours()).toBe(12)
  expect(noonOf(new Date(2026, 9, 13, 0, 1).getTime()).getDate()).toBe(13)
  expect(noonOf(new Date(2026, 9, 13, 23, 59).getTime()).getDate()).toBe(13)
  expect(addDays(noonOf(NOW), -13).getDate()).toBe(30)
  expect(keyOf(addDays(noonOf(NOW), 19))).toBe('2026-11-01')
})

test('Today is one day, Week the last 7, Month the last 30, Year January 1 through today', () => {
  expect(daysFor('today', NOW).map(keyOf)).toEqual(['2026-10-13'])

  const week = daysFor('week', NOW).map(keyOf)
  expect(week).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'])

  const month = daysFor('month', NOW).map(keyOf)
  expect(month).toHaveLength(30)
  expect(month[0]).toBe('2026-09-14')
  expect(month[29]).toBe('2026-10-13')

  const year = daysFor('year', NOW).map(keyOf)
  expect(year).toHaveLength(286)
  expect(year[0]).toBe('2026-01-01')
  expect(year[285]).toBe('2026-10-13')
  expect(yearToDate(NOW)).toHaveLength(dayOfYear(noonOf(NOW)))
})

test('a stretch that crosses New Year is still the last seven days', () => {
  const jan = new Date(2027, 0, 3, 9, 0).getTime()
  expect(lastDays(jan, 7).map(keyOf)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  expect(daysFor('year', jan).map(keyOf)).toEqual(['2027-01-01', '2027-01-02', '2027-01-03'])
})

test('each stretch is named, and its dates are written out', () => {
  expect(stretchName('today', NOW)).toBe('Today')
  expect(stretchName('week', NOW)).toBe('Last 7 days')
  expect(stretchName('month', NOW)).toBe('Last 30 days')
  expect(stretchName('year', NOW)).toBe('Year 2026')

  expect(describeDays(daysFor('today', NOW))).toBe('Tue 13 Oct 2026')
  expect(describeDays(daysFor('week', NOW))).toBe('7 Oct to 13 Oct 2026')
  expect(describeDays(daysFor('year', NOW))).toBe('1 Jan to 13 Oct 2026')
  expect(describeDays(lastDays(new Date(2027, 0, 3, 9).getTime(), 7))).toBe('28 Dec 2026 to 3 Jan 2027')
})
