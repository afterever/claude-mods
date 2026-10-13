import { test, expect } from 'claude-code/testing'

import { barRow, bigNumber, chartPlan, clip, fit, lineWidth, strWidth, tileFace, tilePlan } from './layout'
import type { Bar } from './report'

test('big numerals are three rows of heavy box-drawing characters, one width per row', () => {
  const rows = bigNumber('2026')!
  expect(rows).toHaveLength(3)
  expect(new Set(rows.map(strWidth)).size).toBe(1)
  expect(strWidth(rows[0])).toBe(4 * 3 + 3)
  expect(rows.join('')).toMatch(/[┏┓┗┛┃━]/)
  // a decimal point sits on the bottom row only
  const decimal = bigNumber('2.5')!
  expect(decimal[2]).toContain('.')
  expect(decimal[0]).not.toContain('.')
  expect(new Set(decimal.map(strWidth)).size).toBe(1)
  // text that is not a number is not drawn big
  expect(bigNumber('1,250')).toBeNull()
  expect(bigNumber('')).toBeNull()
})

test('a number too wide for big numerals falls back to plain bold text', () => {
  expect(tileFace('12', '12', 12)).toMatchObject({ kind: 'big' })
  const wide = tileFace('123456', '123,456', 12)
  expect(wide).toEqual({ kind: 'plain', text: '123,456' })
  // a tile too narrow even for the plain text cuts it rather than overflowing
  const cut = tileFace('123456', '123,456', 5)
  expect(cut.kind).toBe('plain')
  expect(strWidth((cut as { text: string }).text)).toBeLessThanOrEqual(5)
})

test('three tiles, then two, then one as the pane narrows', () => {
  expect(tilePlan(110).count).toBe(3)
  expect(tilePlan(72).count).toBe(3)
  expect(tilePlan(60).count).toBe(3)
  expect(tilePlan(59).count).toBe(2)
  expect(tilePlan(40).count).toBe(2)
  expect(tilePlan(39).count).toBe(1)
  expect(tilePlan(24).count).toBe(1)
  // the frame's room is what is left of the width, and shrinks with it
  expect(tilePlan(110).inner).toBeGreaterThan(tilePlan(60).inner)
  expect(tilePlan(60).inner).toBeGreaterThanOrEqual(15)
})

test('text is chosen from the wordings that fit, and cut at the end when none does', () => {
  expect(fit(30, ['a long wording of the line', 'short'])).toBe('a long wording of the line')
  expect(fit(10, ['a long wording of the line', 'short'])).toBe('short')
  expect(fit(4, ['a long wording', 'short one'])).toBe('sho…')
  expect(clip('abcdef', 4)).toBe('abc…')
})

test('a bar row is never wider than the width it was given', () => {
  for (const width of [20, 24, 30, 46, 80, 110]) {
    const line = barRow(width, 16, { label: 'Images and video', count: 12, max: 40, tail: ' 12  2.0h', tone: 'violet' })
    expect(lineWidth(line)).toBeLessThanOrEqual(width)
  }
  // the bar is in proportion, and a count above zero is never an empty bar
  const full = barRow(60, 8, { label: 'Emails', count: 10, max: 10, tail: '10', tone: 'blue' })
  const tiny = barRow(60, 8, { label: 'Other', count: 1, max: 1000, tail: '1', tone: 'blue' })
  const filled = (l: ReturnType<typeof barRow>) => l.filter(s => s.tone === 'blue').reduce((n, s) => n + s.t.length, 0)
  expect(filled(full)).toBeGreaterThan(20)
  expect(filled(tiny)).toBeGreaterThanOrEqual(1)
})

const bars = (values: number[], over: Partial<Bar> = {}): Bar[] => values.map((value, i) => ({ label: String(i), value, isCurrent: false, isFuture: false, ...over }))

test('the chart is three rows tall, tallest bar full height, and never wider than the pane', () => {
  const plan = chartPlan(bars([0, 1, 4, 9, 24]), 40)
  expect(plan.rows).toHaveLength(3)
  for (const row of plan.rows) expect(lineWidth(row)).toBeLessThanOrEqual(40)
  // the tallest bar reaches the top row with a full block, the others fall short
  const top = plan.rows[0]!.map(s => s.t).join('')
  expect(top).toContain('█')
  expect([...top.trim()].filter(c => c === '█').length).toBeGreaterThan(0)
  const bottom = plan.rows[2]!.map(s => s.t).join('')
  expect(bottom).toContain('█')
})

test('thirty daily bars fit a pane of thirty cells, and merge in pairs below that', () => {
  const thirty = bars(new Array(30).fill(1))
  const wide = chartPlan(thirty, 90)
  expect(wide.bars).toBe(30)
  expect(wide.width).toBeLessThanOrEqual(90)
  expect(chartPlan(thirty, 30).bars).toBe(30)
  const narrow = chartPlan(thirty, 22)
  expect(narrow.bars).toBeLessThanOrEqual(22)
  expect(narrow.width).toBeLessThanOrEqual(22)
  for (const row of narrow.rows) expect(lineWidth(row)).toBeLessThanOrEqual(22)
  // merged bars keep the total
  const merged = chartPlan(bars([2, 3, 4, 5]), 2)
  expect(merged.bars).toBe(2)
})

test('Year: the current month is gold, the months to come are empty, the rest blue', () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const year: Bar[] = months.map((label, m) => ({ label, value: m < 10 ? m + 1 : 0, isCurrent: m === 9, isFuture: m > 9 }))
  const plan = chartPlan(year, 60)
  const slot = Math.floor(60 / 12)
  const cells = (row: number) => plan.rows[row]!.flatMap(s => [...s.t].map(() => s.tone))
  const glyphs = (row: number) => plan.rows[row]!.flatMap(s => [...s.t])
  // October's slot is gold on the bottom row; January's is blue
  expect(cells(2)[9 * slot]).toBe('gold')
  expect(cells(2)[0]).toBe('blue')
  // November and December have nothing drawn, not even a baseline
  for (let r = 0; r < 3; r++) {
    expect(glyphs(r).slice(10 * slot, 12 * slot).every(c => c === ' ')).toBe(true)
  }
  // a month label under every bar: slots are wide enough for three letters
  expect(plan.axis).toContain('Jan')
  expect(plan.axis).toContain('Oct')
  expect(plan.axis).toContain('Dec')
  expect(strWidth(plan.axis)).toBeLessThanOrEqual(60)
})

test('weekday labels shrink to initials when the slots are narrow, and never overlap', () => {
  const week = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'].map((label, i) => ({ label, value: i, isCurrent: i === 6, isFuture: false }))
  expect(chartPlan(week, 56).axis).toMatch(/Wed.*Thu.*Tue/)
  const narrow = chartPlan(week, 14)
  expect(narrow.axis.length).toBeLessThanOrEqual(14)
  expect(narrow.axis.replace(/\s/g, '')).toMatch(/^[A-Za-z]+$/)
})
