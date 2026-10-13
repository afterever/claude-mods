// The review's three numbers as one drawing, for the surfaces that draw
// vectors (the desktop app, the editor). Characters set in rows only line up
// when the font gives every one the same width; a drawing does not depend on
// the font at all. The digits are the same three-row, heavy-stroke shapes the
// terminal gets as box-drawing characters.
import { COLORS } from './layout'

const FONT = "ui-monospace, 'Cascadia Mono', SFMono-Regular, Menlo, Consolas, monospace"

const GAP = 8
const TILE_H = 76
const DIGIT_W = 16
const DIGIT_H = 30
const DIGIT_GAP = 7
const STROKE = 4.5

// Seven segments, named as on a seven-segment display
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
}

/** Which of the seven segments a digit lights, in drawing order. */
export function segmentsOf(digit: string): string {
  return SEGMENTS[digit] ?? SEGMENTS['0']!
}

const digitText = (n: number): string => String(Math.max(0, Math.min(99999, Math.floor(Number.isFinite(n) ? n : 0))))

/** How wide a number is drawn before any scaling, in drawing units. */
export function numberWidth(n: number): number {
  const count = digitText(n).length
  return count * DIGIT_W + (count - 1) * DIGIT_GAP
}

function digitPath(d: string, x: number): string {
  const p = STROKE / 2
  const left = x + p
  const right = x + DIGIT_W - p
  const top = p
  const mid = DIGIT_H / 2
  const bottom = DIGIT_H - p
  const seg: Record<string, [number, number, number, number]> = {
    a: [left, top, right, top],
    b: [right, top, right, mid],
    c: [right, mid, right, bottom],
    d: [left, bottom, right, bottom],
    e: [left, mid, left, bottom],
    f: [left, top, left, mid],
    g: [left, mid, right, mid],
  }
  return [...segmentsOf(d)].map(s => `M${seg[s]![0]} ${seg[s]![1]}L${seg[s]![2]} ${seg[s]![3]}`).join('')
}

export type StatsSvg = { source: string; width: number; height: number; alt: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Three tiles in a row `width` drawing units wide: words before, words after,
 * details added. A number too wide for its tile is drawn smaller, never cut.
 */
export function statsSvg(width: number, before: number, after: number, added: number): StatsSvg {
  const tile = (width - 2 * GAP) / 3
  const long = tile >= 112
  const items = [
    { n: before, color: COLORS.text, caption: long ? 'words before' : 'before' },
    { n: after, color: COLORS.gold, caption: long ? 'words after' : 'after' },
    { n: added, color: COLORS.green, caption: long ? 'details added' : 'added' },
  ]
  const parts = items.map((it, i) => {
    const x = i * (tile + GAP)
    const inner = tile - 24
    const scale = Math.min(1, inner / numberWidth(it.n))
    const digits = [...digitText(it.n)]
      .map((d, k) => `<path d="${digitPath(d, k * (DIGIT_W + DIGIT_GAP))}"/>`)
      .join('')
    return (
      `<rect x="${x + 0.75}" y="0.75" width="${tile - 1.5}" height="${TILE_H - 1.5}" rx="10" fill="none" stroke="${COLORS.hair}" stroke-width="1.5"/>` +
      `<g transform="translate(${x + 12} 12) scale(${scale})" fill="none" stroke="${it.color}" stroke-width="${STROKE}" stroke-linecap="round">${digits}</g>` +
      `<text x="${x + 12}" y="${TILE_H - 12}" font-family="${FONT}" font-size="11" fill="${COLORS.muted}">${esc(it.caption)}</text>`
    )
  })
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TILE_H}" viewBox="0 0 ${width} ${TILE_H}">` + parts.join('') + `</svg>`
  const alt = `${before} words before, ${after} words after, ${added} details added`
  return { source, width, height: TILE_H, alt }
}
