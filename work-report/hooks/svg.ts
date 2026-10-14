// The pane's figures as drawings, for the surfaces that draw vectors (the
// desktop app, the editor). Text set in rows only lines up when the font gives
// every character the same width, and the block and box-drawing characters of
// the tiles, bars and chart come from whatever font the page falls back to; a
// drawing places every mark by its own coordinates and depends on no font. The
// terminal, which is always monospace, keeps its text rows (layout.ts).
import type { Tone } from './layout'
import { COLORS } from './layout'
import type { Bar } from './report'

const FONT = "ui-monospace, 'Cascadia Mono', SFMono-Regular, Menlo, Consolas, monospace"

/** CSS pixels a reported column is worth; the drawing scales down to its slot. */
export const CELL = 8
// advance of one character of the 12 px monospace text below, a little over
const CHAR = 7.4

export type Drawing = { source: string; width: number; height: number; alt: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const wrap = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`

const r1 = (n: number) => Math.round(n * 10) / 10

/** The drawing's width for a pane `columns` wide, within what reads well. */
export function drawingWidth(columns: number): number {
  return Math.max(240, Math.min(900, columns * CELL - CELL))
}

/** `s` cut to `chars` characters, an ellipsis where it was cut. */
function cut(s: string, chars: number): string {
  if (chars <= 0) return ''
  return s.length <= chars ? s : s.slice(0, Math.max(1, chars - 1)) + '…'
}

// ── Tiles ────────────────────────────────────────────────────────────────

export type TileInput = {
  /** The figure, as it is read: `3.5 h`, `12`, `$1,234`. */
  face: string
  /** Wordings for the caption, longest first; the first that fits the tile is drawn. */
  captions: string[]
  tone: Tone
}

const TILE_H = 76
const TILE_GAP = 8
const FACE = 30
const FACE_MIN = 12

/** Layout of the tiles, for the tests: where each starts and how wide it is. */
export function tileSlots(width: number, count: number): { x: number; w: number }[] {
  const w = (width - (count - 1) * TILE_GAP) / count
  return Array.from({ length: count }, (_, i) => ({ x: r1(i * (w + TILE_GAP)), w: r1(w) }))
}

/** Up to three framed tiles side by side, each a bold figure over a small caption. */
export function tilesSvg(width: number, tiles: readonly TileInput[], alt: string): Drawing {
  const slots = tileSlots(width, Math.max(1, tiles.length))
  const body = tiles
    .map((t, i) => {
      const { x, w } = slots[i]!
      const cx = r1(x + w / 2)
      // a figure too wide for its tile is drawn smaller, never cut
      const size = Math.max(FACE_MIN, Math.min(FACE, Math.floor((w - 16) / (Math.max(1, t.face.length) * 0.62))))
      const caption = t.captions.find(c => c.length * 6.6 <= w - 12) ?? cut(t.captions[t.captions.length - 1] ?? '', Math.floor((w - 12) / 6.6))
      return (
        `<rect x="${x + 0.75}" y="0.75" width="${r1(w - 1.5)}" height="${TILE_H - 1.5}" rx="10" fill="none" stroke="${COLORS.hair}" stroke-width="1.5"/>` +
        `<text x="${cx}" y="42" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${COLORS[t.tone]}">${esc(t.face)}</text>` +
        `<text x="${cx}" y="${TILE_H - 14}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${COLORS.muted}">${esc(caption)}</text>`
      )
    })
    .join('')
  return { source: wrap(width, TILE_H, body), width, height: TILE_H, alt }
}

// ── Bar rows ─────────────────────────────────────────────────────────────

export type BarInput = {
  label: string
  count: number
  max: number
  /** Right-aligned columns after the bar: the count, then the hours. */
  tails: string[]
  tone: Tone
}

const ROW_H = 22
const BAR_H = 8
const TAIL_GAP = 12

/** Labelled bars: label, a track filled to its share, and right-aligned figures. */
export function barsSvg(width: number, rows: readonly BarInput[], alt: string): Drawing {
  const labelChars = Math.min(Math.max(1, ...rows.map(r => r.label.length)), Math.floor((width * 0.38) / CHAR))
  const labelW = labelChars * CHAR
  const columns = Math.max(0, ...rows.map(r => r.tails.length))
  const colW = Array.from({ length: columns }, (_, c) => Math.max(...rows.map(r => (r.tails[c] ?? '').length)) * CHAR + TAIL_GAP)
  const tailsW = colW.reduce((a, b) => a + b, 0)
  const barX = r1(labelW + TAIL_GAP)
  const barW = Math.max(24, r1(width - barX - tailsW))
  const height = Math.max(1, rows.length) * ROW_H
  const body = rows
    .map((r, i) => {
      const cy = i * ROW_H + ROW_H / 2
      const fill = r.count <= 0 || r.max <= 0 ? 0 : Math.min(barW, Math.max(4, Math.round((r.count / r.max) * barW)))
      let right = width
      const tails: string[] = []
      for (let c = columns - 1; c >= 0; c--) {
        tails.unshift(`<text x="${r1(right)}" y="${cy + 4}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${COLORS.muted}">${esc(r.tails[c] ?? '')}</text>`)
        right -= colW[c]!
      }
      return (
        `<text x="0" y="${cy + 4}" font-family="${FONT}" font-size="12" fill="${COLORS.text}">${esc(cut(r.label, labelChars))}</text>` +
        `<rect x="${barX}" y="${cy - BAR_H / 2}" width="${barW}" height="${BAR_H}" rx="4" fill="${COLORS.hair}"/>` +
        (fill > 0 ? `<rect x="${barX}" y="${cy - BAR_H / 2}" width="${fill}" height="${BAR_H}" rx="4" fill="${COLORS[r.tone]}"/>` : '') +
        tails.join('')
      )
    })
    .join('')
  return { source: wrap(width, height, body), width, height, alt }
}

// ── The chart ────────────────────────────────────────────────────────────

const AREA_H = 72
const AXIS_H = 20

/** Tasks per day or month as bars, a baseline mark for an empty one, labels under. */
export function chartSvg(width: number, bars: readonly Bar[], alt: string): Drawing {
  const n = Math.max(1, bars.length)
  const slot = width / n
  const bw = Math.max(2, Math.min(40, slot * 0.68))
  const max = Math.max(1, ...bars.map(b => b.value))
  const height = AREA_H + AXIS_H
  const marks: string[] = []
  bars.forEach((b, i) => {
    const x = r1(i * slot + (slot - bw) / 2)
    if (b.value > 0) {
      const h = Math.max(3, Math.round((b.value / max) * AREA_H))
      marks.push(`<rect x="${x}" y="${AREA_H - h}" width="${r1(bw)}" height="${h}" rx="2" fill="${b.isCurrent ? COLORS.gold : COLORS.blue}"/>`)
    } else if (!b.isFuture) {
      // a day with nothing still has its place on the baseline
      marks.push(`<rect x="${x}" y="${AREA_H - 2}" width="${r1(bw)}" height="2" rx="1" fill="${COLORS.hair}"/>`)
    }
  })
  // labels are placed from the newest back, and never touch another
  const taken: [number, number][] = []
  const labels: string[] = []
  for (let i = bars.length - 1; i >= 0; i--) {
    const text = bars[i]!.label
    if (text === '') continue
    const w = text.length * 6.6
    const cx = i * slot + slot / 2
    const x = Math.max(0, Math.min(width - w, cx - w / 2))
    if (taken.some(([a, b]) => x < b + 4 && x + w > a - 4)) continue
    taken.push([x, x + w])
    labels.push(`<text x="${r1(x)}" y="${AREA_H + 14}" font-family="${FONT}" font-size="11" fill="${COLORS.muted}">${esc(text)}</text>`)
  }
  return { source: wrap(width, height, marks.join('') + labels.join('')), width, height, alt }
}
