// What the pane needs that is only arithmetic: cell widths, big numerals, how
// many tiles fit, and the text of the bars and the chart. Every row built here
// is measured in cells and is never wider than the width it is given.
import type { Kind } from '../types'
import type { Bar } from './report'

export type Tone = 'text' | 'muted' | 'hair' | 'gold' | 'green' | 'amber' | 'dark' | 'blue' | 'violet' | 'teal' | 'orange'
export type Seg = { t: string; tone: Tone; bold?: boolean }
export type Line = Seg[]

export const COLORS: Record<Tone, string> = {
  text: '#E6EDF3',
  muted: '#7D8590',
  hair: '#262B33',
  gold: '#F2C46D',
  green: '#3DD68C',
  amber: '#E3B341',
  dark: '#0D1117',
  blue: '#58A6FF',
  violet: '#BC8CFF',
  teal: '#39C5CF',
  orange: '#F0883E',
}

export const KIND_TONE: Record<Kind, Tone> = {
  emails: 'blue',
  images: 'violet',
  documents: 'teal',
  research: 'orange',
  other: 'muted',
}

export const TITLE = 'WORK REPORT'

// ── Widths ───────────────────────────────────────────────────────────────

/** Terminal cells one character takes: 2 for wide characters, 0 for marks, else 1. */
export function cellWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (c < 32 || (c >= 0x7f && c < 0xa0)) return 0
  if ((c >= 0x300 && c <= 0x36f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) return 0
  const isWide =
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1f64f) ||
    (c >= 0x1f900 && c <= 0x1f9ff) ||
    (c >= 0x20000 && c <= 0x3fffd)
  return isWide ? 2 : 1
}

export function strWidth(s: string): number {
  let w = 0
  for (const ch of s) w += cellWidth(ch)
  return w
}

export function lineWidth(line: Line): number {
  return line.reduce((n, s) => n + strWidth(s.t), 0)
}

/** The text cut to `width` cells, an ellipsis where it was cut. */
export function clip(s: string, width: number): string {
  if (width <= 0) return ''
  if (strWidth(s) <= width) return s
  let out = ''
  let w = 0
  for (const ch of s) {
    const cw = cellWidth(ch)
    if (w + cw > width - 1) break
    out += ch
    w += cw
  }
  return out + '…'
}

/** The first of the wordings that fits `width`; the last, cut, when none does. */
export function fit(width: number, wordings: readonly string[]): string {
  for (const w of wordings) if (strWidth(w) <= width) return w
  return clip(wordings[wordings.length - 1] ?? '', width)
}

const padEnd = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - strWidth(s)))
const padStart = (s: string, width: number) => ' '.repeat(Math.max(0, width - strWidth(s))) + s

// ── Big numerals ─────────────────────────────────────────────────────────

const NB = ' '

// Only the common heavy box-drawing characters: the half-line ones are
// missing from many fonts and a substitute font drew the tiles out of line.
// The gaps are non-breaking spaces so a surface cannot collapse them.
const DIGITS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', `┃${NB}┃`, '┗━┛'],
  '1': [`┏┓${NB}`, `${NB}┃${NB}`, '┗┻┛'],
  '2': ['━━┓', '┏━┛', '┗━━'],
  '3': ['━━┓', `${NB}━┫`, '━━┛'],
  '4': [`┃${NB}┃`, '┗━┫', `${NB}${NB}┃`],
  '5': ['┏━━', '┗━┓', '━━┛'],
  '6': ['┏━━', '┣━┓', '┗━┛'],
  '7': ['━━┓', `${NB}${NB}┃`, `${NB}${NB}┃`],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '━━┛'],
  '.': [NB, NB, '.'],
}

/**
 * A number three rows tall in heavy box-drawing characters, one cell between
 * glyphs; `null` for text that is not digits and points, which is shown plain.
 */
export function bigNumber(text: string): [string, string, string] | null {
  if (text === '') return null
  const rows: [string, string, string] = ['', '', '']
  let first = true
  for (const ch of text) {
    const glyph = DIGITS[ch]
    if (!glyph) return null
    for (let r = 0; r < 3; r++) rows[r] += (first ? '' : NB) + glyph[r]
    first = false
  }
  return rows
}

// ── Tiles ────────────────────────────────────────────────────────────────

export type TilePlan = {
  /** How many of the three tiles are drawn: three, then two, then one. */
  count: 1 | 2 | 3
  /** Cells inside one tile's frame. */
  inner: number
}

export function tilePlan(width: number): TilePlan {
  const count = width >= 60 ? 3 : width >= 40 ? 2 : 1
  // the gaps between tiles, then the two cells of each frame
  const inner = Math.max(4, Math.floor((width - (count - 1)) / count) - 2)
  return { count, inner }
}

export type TileFace =
  | { kind: 'big'; rows: [string, string, string] }
  | { kind: 'plain'; text: string }

/** Big numerals when they fit inside the frame, otherwise the number as plain bold text. */
export function tileFace(numerals: string, plain: string, inner: number): TileFace {
  const rows = bigNumber(numerals)
  if (rows && strWidth(rows[0]) <= inner) return { kind: 'big', rows }
  return { kind: 'plain', text: clip(plain, inner) }
}

// ── Bar rows ─────────────────────────────────────────────────────────────

const FILL = '█'
const TRACK = '▁'

/** A bar `width` cells long: `count` of `max` filled, never nothing for a count above zero. */
export function barSegs(count: number, max: number, width: number, tone: Tone): Line {
  if (width <= 0) return []
  const filled = count <= 0 || max <= 0 ? 0 : Math.min(width, Math.max(1, Math.round((count / max) * width)))
  const line: Line = []
  if (filled > 0) line.push({ t: FILL.repeat(filled), tone })
  if (filled < width) line.push({ t: TRACK.repeat(width - filled), tone: 'hair' })
  return line
}

export type BarRowInput = {
  label: string
  count: number
  max: number
  /** Text after the bar, already padded to a common width. */
  tail: string
  tone: Tone
}

/**
 * One labelled bar: label, bar, tail. The label is cut and the bar takes what
 * is left so the row is at most `width` cells; the bar is dropped under three.
 */
export function barRow(width: number, labelWidth: number, row: BarRowInput): Line {
  const tailW = strWidth(row.tail)
  const gaps = 2
  const rest = width - tailW - gaps
  const lw = Math.max(3, Math.min(labelWidth, rest - 3))
  const bw = rest - lw
  const line: Line = [{ t: padEnd(clip(row.label, lw), lw), tone: 'text' }]
  if (bw >= 3) {
    line.push({ t: ' ', tone: 'text' }, ...barSegs(row.count, row.max, bw, row.tone), { t: ' ', tone: 'text' })
  } else {
    line.push({ t: ' ', tone: 'text' })
  }
  line.push({ t: row.tail, tone: 'muted' })
  return line
}

export { padEnd, padStart }

// ── The chart ────────────────────────────────────────────────────────────

const LEVELS = '▁▂▃▄▅▆▇█'
const ROWS = 3
/** Eighths of a row: a bar three rows tall has this many steps. */
const STEPS = ROWS * 8

export type ChartPlan = {
  rows: Line[]
  axis: string
  /** Cells the chart takes. */
  width: number
  /** Bars drawn: fewer than given when the pane is narrower than the bars. */
  bars: number
}

/** Adjacent bars added in pairs, until no more than `limit` are left. */
function shrink(bars: readonly Bar[], limit: number): Bar[] {
  let out = [...bars]
  while (out.length > Math.max(1, limit)) {
    const merged: Bar[] = []
    for (let i = 0; i < out.length; i += 2) {
      const a = out[i]!
      const b = out[i + 1]
      merged.push(
        b
          ? { label: b.label || a.label, value: a.value + b.value, isCurrent: a.isCurrent || b.isCurrent, isFuture: a.isFuture && b.isFuture }
          : a,
      )
    }
    out = merged
  }
  return out
}

/**
 * The bars three rows tall, in eighths of a row, and the labels under them.
 * Each bar takes a slot of the pane's width, one cell of it a gap once there
 * is room; the chart is never wider than `width`.
 */
export function chartPlan(input: readonly Bar[], width: number): ChartPlan {
  const bars = shrink(input, width)
  const n = bars.length
  const slot = Math.max(1, Math.min(8, Math.floor(width / Math.max(1, n))))
  const fill = slot === 1 ? 1 : slot - 1
  const max = Math.max(1, ...bars.map(b => b.value))

  const rows: Line[] = []
  for (let r = 0; r < ROWS; r++) {
    const line: Line = []
    const push = (t: string, tone: Tone) => {
      const last = line[line.length - 1]
      if (last && last.tone === tone) last.t += t
      else line.push({ t, tone })
    }
    for (const bar of bars) {
      const units = bar.value <= 0 ? 0 : Math.max(1, Math.round((bar.value / max) * STEPS))
      const inRow = Math.max(0, Math.min(8, units - (ROWS - 1 - r) * 8))
      const tone: Tone = bar.isCurrent ? 'gold' : 'blue'
      let glyph = ' '
      let t: Tone = tone
      if (inRow > 0) glyph = LEVELS.charAt(inRow - 1)
      else if (r === ROWS - 1 && !bar.isFuture) {
        // a day with nothing still has its place on the baseline
        glyph = TRACK
        t = 'hair'
      }
      push(glyph.repeat(fill), t)
      if (slot > fill) push(' '.repeat(slot - fill), t)
    }
    rows.push(line)
  }

  // labels: placed from the last bar back so the newest wins a clash, and
  // never touching another label
  const cells = new Array<string>(n * slot).fill(' ')
  for (let i = n - 1; i >= 0; i--) {
    const bar = bars[i]!
    if (bar.label === '') continue
    // a word shrinks to its initial when the slot is under three cells; a date keeps its digits
    const text = slot >= 3 || !/^[A-Za-z]+$/.test(bar.label) ? bar.label : bar.label.charAt(0)
    const start = Math.min(cells.length - text.length, i * slot + Math.max(0, Math.floor((slot - text.length) / 2)))
    if (start < 0) continue
    const from = Math.max(0, start - 1)
    const to = Math.min(cells.length, start + text.length + 1)
    if (cells.slice(from, to).some(c => c !== ' ')) continue
    for (let c = 0; c < text.length; c++) cells[start + c] = text.charAt(c)
  }
  return { rows, axis: cells.join('').trimEnd(), width: n * slot, bars: n }
}
