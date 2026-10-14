import { test, expect } from 'claude-code/testing'

import { COLORS } from './layout'
import type { Bar } from './report'
import { barsSvg, chartSvg, drawingWidth, tileSlots, tilesSvg } from './svg'

const WIDTHS = [240, 300, 480, 640, 900]
const attr = (tag: string, name: string) => Number(new RegExp(`${name}="(-?[\\d.]+)"`).exec(tag)?.[1] ?? NaN)
const tagsOf = (source: string, name: string) => source.match(new RegExp(`<${name} [^>]*>`, 'g')) ?? []

test('the drawing is as wide as the pane reports, within what reads well', () => {
  expect(drawingWidth(72)).toBe(72 * 8 - 8)
  expect(drawingWidth(10)).toBe(240)
  expect(drawingWidth(400)).toBe(900)
})

// ── Tiles ────────────────────────────────────────────────────────────────

test('tiles sit side by side inside the drawing and never overlap', () => {
  for (const width of WIDTHS) {
    for (const count of [1, 2, 3] as const) {
      const slots = tileSlots(width, count)
      expect(slots).toHaveLength(count)
      expect(slots[0]!.x).toBe(0)
      const last = slots[count - 1]!
      expect(last.x + last.w).toBeLessThanOrEqual(width + 0.2)
      for (let i = 1; i < count; i++) expect(slots[i]!.x).toBeGreaterThan(slots[i - 1]!.x + slots[i - 1]!.w)
      // equal tiles
      expect(new Set(slots.map(s => s.w)).size).toBe(1)
    }
  }
})

test('each tile is a frame with its figure and caption centred on it', () => {
  const art = tilesSvg(
    480,
    [
      { face: '3.5 h', captions: ['est. hours saved', 'hours'], tone: 'gold' },
      { face: '12', captions: ['tasks done', 'tasks'], tone: 'text' },
      { face: '$263', captions: ['est. worth in $', '$'], tone: 'green' },
    ],
    'alt words',
  )
  expect(art.source.startsWith('<svg ')).toBe(true)
  expect(art.source).toContain('viewBox="0 0 480 76"')
  expect(art.alt).toBe('alt words')
  expect(tagsOf(art.source, 'rect')).toHaveLength(3)
  const texts = tagsOf(art.source, 'text')
  expect(texts).toHaveLength(6)
  // the figure and its caption share one centre, which is the middle of the tile
  const slots = tileSlots(480, 3)
  slots.forEach((s, i) => {
    const centre = s.x + s.w / 2
    expect(Math.abs(attr(texts[i * 2]!, 'x') - centre)).toBeLessThan(0.5)
    expect(Math.abs(attr(texts[i * 2 + 1]!, 'x') - centre)).toBeLessThan(0.5)
    expect(texts[i * 2]).toContain('text-anchor="middle"')
  })
  expect(art.source).toContain(`fill="${COLORS.gold}"`)
  expect(art.source).toContain(`fill="${COLORS.green}"`)
})

test('a caption is shortened when the tile is narrow, and a long figure drawn smaller', () => {
  const tiles = (face: string) =>
    [
      { face, captions: ['est. hours saved', 'est. hours', 'hours'], tone: 'gold' as const },
      { face: '1', captions: ['tasks done', 'tasks'], tone: 'text' as const },
      { face: '1', captions: ['est. worth in $', '$'], tone: 'green' as const },
    ] satisfies Parameters<typeof tilesSvg>[1]
  expect(tilesSvg(900, tiles('3.5 h'), '').source).toContain('>est. hours saved<')
  const tight = tilesSvg(240, tiles('3.5 h'), '').source
  expect(tight).not.toContain('>est. hours saved<')
  expect(tight).toContain('>hours<')

  const size = (width: number, face: string) => attr(tagsOf(tilesSvg(width, tiles(face), '').source, 'text')[0]!, 'font-size')
  expect(size(900, '3.5 h')).toBe(30)
  expect(size(240, '$1,234,567')).toBeLessThan(size(240, '3.5 h'))
  expect(size(240, '$1,234,567')).toBeGreaterThanOrEqual(12)
})

// ── Bar rows ─────────────────────────────────────────────────────────────

const KIND_ROWS = [
  { label: 'Emails', count: 3, max: 12, tails: ['3', '0.4h'], tone: 'blue' as const },
  { label: 'Documents', count: 12, max: 12, tails: ['12', '2.4h'], tone: 'teal' as const },
  { label: 'Research', count: 1, max: 12, tails: ['1', '0.5h'], tone: 'orange' as const },
  { label: 'Everything else', count: 0, max: 12, tails: ['0', '0h'], tone: 'muted' as const },
]

test('every row of bars starts, ends and keeps its figures in the same place', () => {
  for (const width of WIDTHS) {
    const art = barsSvg(width, KIND_ROWS, 'kinds')
    const rects = tagsOf(art.source, 'rect')
    const tracks = rects.filter(r => r.includes(COLORS.hair))
    expect(tracks).toHaveLength(KIND_ROWS.length)
    // one start and one length for every track: the rows line up whatever their labels say
    expect(new Set(tracks.map(r => attr(r, 'x'))).size).toBe(1)
    expect(new Set(tracks.map(r => attr(r, 'width'))).size).toBe(1)
    // the figures are right-aligned at the same two edges on every row
    const tails = tagsOf(art.source, 'text').filter(t => t.includes('text-anchor="end"'))
    expect(tails).toHaveLength(KIND_ROWS.length * 2)
    const xs = tails.map(t => attr(t, 'x'))
    expect(new Set(xs).size).toBe(2)
    expect(Math.max(...xs)).toBe(width)
    // nothing is drawn past the edge, and the figures stay clear of the track
    for (const r of rects) expect(attr(r, 'x') + attr(r, 'width')).toBeLessThanOrEqual(width + 0.1)
    expect(Math.min(...xs)).toBeGreaterThan(attr(tracks[0]!, 'x') + attr(tracks[0]!, 'width') - 0.1)
    expect(art.height).toBe(KIND_ROWS.length * 22)
  }
})

test('a bar is filled to its share, a small count is never nothing, and zero is an empty track', () => {
  const art = barsSvg(480, KIND_ROWS, '')
  const fills = tagsOf(art.source, 'rect').filter(r => !r.includes(COLORS.hair))
  // zero draws no fill at all
  expect(fills).toHaveLength(3)
  const [emails, documents, research] = fills.map(r => attr(r, 'width')) as [number, number, number]
  const track = attr(tagsOf(art.source, 'rect').find(r => r.includes(COLORS.hair))!, 'width')
  expect(documents).toBe(track)
  // 3 of 12 is a quarter of the track, to the pixel
  expect(Math.abs(emails - track / 4)).toBeLessThanOrEqual(1)
  expect(research).toBeGreaterThanOrEqual(4)
  expect(research).toBeLessThan(emails)
})

test('a long label is cut, and what is written is escaped', () => {
  const art = barsSvg(
    240,
    [{ label: 'A model with a remarkably long & <odd> display name', count: 1, max: 1, tails: ['1000000'], tone: 'gold' }],
    '',
  )
  const label = tagsOf(art.source, 'text')[0]!
  expect(art.source).toContain('…')
  expect(art.source).not.toContain('<odd>')
  expect(label).toContain('x="0"')
  // the bar still has room after the cut label and the figure
  const track = tagsOf(art.source, 'rect')[0]!
  expect(attr(track, 'width')).toBeGreaterThanOrEqual(24)
})

// ── The chart ────────────────────────────────────────────────────────────

const week = (values: number[], labels = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']): Bar[] =>
  values.map((value, i) => ({ label: labels[i] ?? '', value, isCurrent: i === values.length - 1, isFuture: false }))

test('a bar for every day, tallest for the busiest, today in gold', () => {
  const art = chartSvg(480, week([0, 2, 4, 1, 0, 3, 8]), 'tasks per day')
  const rects = tagsOf(art.source, 'rect')
  // five days with tasks, two empty ones kept as baseline marks
  const bars = rects.filter(r => attr(r, 'height') > 2)
  expect(bars).toHaveLength(5)
  expect(rects).toHaveLength(7)
  const heights = bars.map(r => attr(r, 'height'))
  expect(Math.max(...heights)).toBe(72)
  expect(heights[heights.length - 1]).toBe(72)
  // every bar stands on the same baseline
  expect(new Set(bars.map(r => attr(r, 'y') + attr(r, 'height'))).size).toBe(1)
  expect(bars[bars.length - 1]).toContain(COLORS.gold)
  expect(bars[0]).toContain(COLORS.blue)
  expect(art.alt).toBe('tasks per day')
})

test('bars are evenly spaced and a future month is left empty', () => {
  const year: Bar[] = Array.from({ length: 12 }, (_, i) => ({ label: 'JFMAMJJASOND'.charAt(i), value: i < 6 ? i + 1 : 0, isCurrent: i === 5, isFuture: i > 5 }))
  const art = chartSvg(480, year, '')
  const rects = tagsOf(art.source, 'rect')
  // six months with tasks; the empty future ones draw nothing at all
  expect(rects).toHaveLength(6)
  const xs = rects.map(r => attr(r, 'x'))
  const gaps = xs.slice(1).map((x, i) => Math.round((x - xs[i]!) * 10) / 10)
  expect(new Set(gaps).size).toBe(1)
})

test('labels sit under their bars, never touch one another, and stay inside the drawing', () => {
  const month: Bar[] = Array.from({ length: 30 }, (_, i) => ({
    label: (i + 1) % 5 === 0 || i === 29 ? String(i + 1) : '',
    value: i % 4,
    isCurrent: i === 29,
    isFuture: false,
  }))
  for (const width of WIDTHS) {
    for (const bars of [week([1, 2, 3, 4, 5, 6, 7]), month]) {
      const art = chartSvg(width, bars, '')
      const labels = tagsOf(art.source, 'text')
      expect(labels.length).toBeGreaterThan(0)
      const spans = labels
        .map(t => {
          const text = />([^<]*)</.exec(art.source.slice(art.source.indexOf(t)))?.[1] ?? ''
          return { from: attr(t, 'x'), to: attr(t, 'x') + text.length * 6.6 }
        })
        .sort((a, b) => a.from - b.from)
      for (const s of spans) {
        expect(s.from).toBeGreaterThanOrEqual(0)
        expect(s.to).toBeLessThanOrEqual(width + 0.5)
      }
      for (let i = 1; i < spans.length; i++) expect(spans[i]!.from).toBeGreaterThan(spans[i - 1]!.to)
    }
  }
})

test('the newest label wins a clash', () => {
  // two neighbouring labels, in a drawing too narrow for both
  const bars: Bar[] = [
    { label: 'Wed', value: 1, isCurrent: false, isFuture: false },
    { label: 'Thu', value: 1, isCurrent: true, isFuture: false },
  ]
  const art = chartSvg(40, bars, '')
  expect(art.source).toContain('>Thu<')
  expect(art.source).not.toContain('>Wed<')
})
