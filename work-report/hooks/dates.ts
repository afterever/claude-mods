// Calendar days in the person's own time zone. Every day is held as its local
// noon: stepping from midnight by 24 hours lands on the wrong date across a
// clock change (a day is 23 or 25 hours long then); noon never does.
import type { Tab } from '../types'

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** The local noon of the day a moment falls on. */
export function noonOf(ms: number): Date {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
}

/** The day `n` days from this one (negative: before), at its noon. */
export function addDays(day: Date, n: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + n, 12)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-13": the key a day's record is stored under. */
export function keyOf(day: Date): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

/** 1 for January 1, 365 or 366 for December 31. */
export function dayOfYear(day: Date): number {
  const start = new Date(day.getFullYear(), 0, 1, 12)
  const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)
  // both are at noon, so the gap is a whole number of days give or take the clock change's hour
  return Math.round((noon.getTime() - start.getTime()) / 86_400_000) + 1
}

/** The last `count` days, the oldest first, ending with the day `ms` falls on. */
export function lastDays(ms: number, count: number): Date[] {
  const today = noonOf(ms)
  const out: Date[] = []
  for (let i = count - 1; i >= 0; i--) out.push(addDays(today, -i))
  return out
}

/** January 1 through the day `ms` falls on. */
export function yearToDate(ms: number): Date[] {
  return lastDays(ms, dayOfYear(noonOf(ms)))
}

/** The days a tab covers, oldest first: today; the last 7; the last 30; January 1 through today. */
export function daysFor(tab: Tab, ms: number): Date[] {
  switch (tab) {
    case 'today':
      return lastDays(ms, 1)
    case 'week':
      return lastDays(ms, 7)
    case 'month':
      return lastDays(ms, 30)
    case 'year':
      return yearToDate(ms)
  }
}

const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`

/** "Tue 13 Oct 2026" for one day, "7 Oct to 13 Oct 2026" for a stretch. */
export function describeDays(days: readonly Date[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ''
  if (days.length === 1) return `${WEEKDAYS[last.getDay()]} ${dayMonth(last)} ${last.getFullYear()}`
  if (first.getFullYear() === last.getFullYear()) return `${dayMonth(first)} to ${dayMonth(last)} ${last.getFullYear()}`
  return `${dayMonth(first)} ${first.getFullYear()} to ${dayMonth(last)} ${last.getFullYear()}`
}

export const TAB_NAME: Record<Tab, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

/** What the stretch is called in the title bar. */
export function stretchName(tab: Tab, ms: number): string {
  switch (tab) {
    case 'today':
      return 'Today'
    case 'week':
      return 'Last 7 days'
    case 'month':
      return 'Last 30 days'
    case 'year':
      return `Year ${noonOf(ms).getFullYear()}`
  }
}

/** "today", "in the last 7 days": the words the empty state uses. */
export function sinceWords(tab: Tab): string {
  switch (tab) {
    case 'today':
      return 'today'
    case 'week':
      return 'in the last 7 days'
    case 'month':
      return 'in the last 30 days'
    case 'year':
      return 'this year'
  }
}
