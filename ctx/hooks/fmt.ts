import type { CtxRow, CtxSnapshot } from '../types'
import { mix, type Tint } from './palette'

// 33400 -> "33.4k", 1000000 -> "1M", 584 -> "584"
export function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return trim((n / 1000).toFixed(1)) + 'k'
  return trim((n / 1_000_000).toFixed(1)) + 'M'
}

function trim(s: string): string {
  return s.replace(/\.0$/, '')
}

// A row's share of the window; deferred schemas sit outside it
export function fmtShare(row: CtxRow, max: number): string {
  if (row.kind === 'deferred' || !max) return '—'
  return ((row.tokens / max) * 100).toFixed(1) + '%'
}

// "12/40" when the listing left some out, "40" when it holds them all
export function fmtCount(included: number, total: number): string {
  return included < total ? `${included}/${total}` : String(total)
}

export function headline(snap: CtxSnapshot): string {
  return `${fmtTokens(snap.total)} / ${fmtTokens(snap.max)} (${Math.round(snap.percent)}%)`
}

// Theme keys, so the colors follow the person's light or dark theme
export function fillColor(percent: number): 'success' | 'warning' | 'error' {
  return percent < 50 ? 'success' : percent < 80 ? 'warning' : 'error'
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}

// Left-aligned partial blocks, indexed by eighths filled (1 to 7)
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
// The least a category holding anything gets, so it never vanishes
const MIN_EIGHTHS = 2
export const FREE_GLYPH = '·'
export const BUFFER_GLYPH = '░'

type Seg = { name: string; color: string; style: 'solid' | 'free' | 'buffer'; start: number; end: number }

// The window laid out in eighths of a cell, as /context orders it: the used
// rows, the free space, the compaction buffer against the right edge
export function barSegments(snap: CtxSnapshot, width: number): Seg[] {
  const total = Math.max(1, width) * 8
  const max = snap.max || 1
  const eighths = (t: number) => Math.round((t / max) * total)
  const segs: Seg[] = []
  let pos = 0
  for (const r of snap.rows) {
    if (r.kind !== 'used' || r.tokens <= 0 || pos >= total) continue
    const end = Math.min(total, pos + Math.max(MIN_EIGHTHS, eighths(r.tokens)))
    segs.push({ name: r.name, color: r.color, style: 'solid', start: pos, end })
    pos = end
  }
  const buffer = snap.rows.find(r => r.kind === 'buffer' && r.tokens > 0)
  const bufStart = buffer ? Math.max(pos, total - eighths(buffer.tokens)) : total
  if (bufStart > pos) {
    const free = snap.rows.find(r => r.kind === 'free')
    segs.push({ name: free?.name ?? 'Free space', color: 'inactive', style: 'free', start: pos, end: bufStart })
  }
  if (buffer && total > bufStart) segs.push({ name: buffer.name, color: buffer.color, style: 'buffer', start: bufStart, end: total })
  return segs
}

/** A run of same-styled cells; `scope` is the category it draws, for hover. */
export type BarRun = { text: string; color: string; bg?: string; dim?: boolean; scope: string }

/** The free space drawn as water: `~` in `water`, the first free cell `≈` in `foam`. */
export type Water = { water: string; foam: string }
export const WATER_GLYPH = '~'
export const FOAM_GLYPH = '≈'

// The bar as runs of cells, `width` cells wide. A cell where one used row
// ends draws that row's partial block over the next row's color, so the bar
// is smooth to an eighth of a cell rather than a whole one. With `tints` the
// rows take the palette's colors; with `water` the free space is water
export function barRuns(snap: CtxSnapshot, width: number, tints?: Record<string, Tint>, water?: Water): BarRun[] {
  const segs = barSegments(snap, width)
  const tint = (s: Seg) => (s.style === 'solid' ? (tints?.[s.name]?.core ?? s.color) : s.color)
  // never empty: whatever the rows hold, free space or a used row covers the width
  const segAt = (e: number) => segs.find(s => s.start <= e && e < s.end) ?? segs[segs.length - 1]!
  const runs: BarRun[] = []
  let shore = true
  for (let c = 0; c < Math.max(1, width); c++) {
    let cell = cellOf(segAt(c * 8), segAt(c * 8 + 7), c * 8, tint)
    if (water && cell.text === FREE_GLYPH) {
      cell = shore ? { text: FOAM_GLYPH, color: water.foam, scope: cell.scope } : { text: WATER_GLYPH, color: water.water, dim: true, scope: cell.scope }
      shore = false
    } else if (water && cell.text === BUFFER_GLYPH) {
      cell = { ...cell, color: water.water }
    }
    const last = runs[runs.length - 1]
    if (last && last.color === cell.color && last.bg === cell.bg && last.dim === cell.dim && last.scope === cell.scope) {
      last.text += cell.text
    } else {
      runs.push(cell)
    }
  }
  return runs
}

function cellOf(a: Seg, b: Seg, start: number, tint: (s: Seg) => string): BarRun {
  if (a.style === 'solid') {
    if (a === b) return { text: '█', color: tint(a), scope: a.name }
    return {
      text: EIGHTHS[Math.min(7, a.end - start)] ?? '▏',
      color: tint(a),
      bg: b.style === 'solid' ? tint(b) : undefined,
      scope: a.name,
    }
  }
  const s = a.end - start >= 4 ? a : b
  return s.style === 'free'
    ? { text: FREE_GLYPH, color: 'inactive', dim: true, scope: s.name }
    : { text: BUFFER_GLYPH, color: s.color, dim: true, scope: s.name }
}

/** One cell of the band's bar; `scope` is the category it draws, for hover. */
export type Cell = { ch: string; color: string; bg?: string; dim?: boolean; scope: string }

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c)

// The band's bar, `width` whole cells: every used row holding anything, and
// the buffer, get at least one, so a split still reads on a nearly empty 1M
// window. The cells those minimums need come off Messages (the largest used
// row) before the free space, so the fill keeps its true length wherever it can
export function bandCells(snap: CtxSnapshot, width: number, tints: Record<string, Tint>, water?: Water): Cell[] {
  const w = Math.max(1, width)
  const freeRow = snap.rows.find(r => r.kind === 'free')
  const freeName = freeRow?.name ?? 'Free space'
  const used = snap.rows.filter(r => r.kind === 'used' && r.tokens > 0)
  const buffer = snap.rows.find(r => r.kind === 'buffer' && r.tokens > 0)
  type Part = { name: string; color: string; kind: 'used' | 'free' | 'buffer'; tokens: number; n: number }
  const free = (): Part => ({ name: freeName, color: 'inactive', kind: 'free', tokens: 0, n: w })
  if (!snap.max) return paint([free()], tints, water)

  // the smallest rows lose their minimum first when there are more rows than cells
  let kept = used
  while (kept.length + (buffer ? 1 : 0) > w && kept.length > 0) {
    const smallest = kept.reduce((a, r) => (r.tokens < a.tokens ? r : a))
    kept = kept.filter(r => r !== smallest)
  }
  const usedTokens = kept.reduce((a, r) => a + r.tokens, 0)
  const parts: Part[] = [
    ...kept.map(r => ({ name: r.name, color: r.color, kind: 'used' as const, tokens: r.tokens, n: 0 })),
    { name: freeName, color: 'inactive', kind: 'free', tokens: Math.max(0, snap.max - usedTokens - (buffer?.tokens ?? 0)), n: 0 },
    ...(buffer ? [{ name: buffer.name, color: buffer.color, kind: 'buffer' as const, tokens: buffer.tokens, n: 0 }] : []),
  ]
  // the ideal shares, rounded by largest remainder so they sum to the width
  const sum = parts.reduce((a, p) => a + p.tokens, 0) || 1
  const exact = parts.map(p => (p.tokens / sum) * w)
  parts.forEach((p, i) => (p.n = Math.floor(exact[i]!)))
  const order = parts.map((_, i) => i).sort((i, j) => exact[j]! - Math.floor(exact[j]!) - (exact[i]! - Math.floor(exact[i]!)))
  for (let k = 0, left = w - parts.reduce((a, p) => a + p.n, 0); k < left; k++) parts[order[k % parts.length]!]!.n++
  // each row in use, and the buffer, at least one cell: from the largest used row while it keeps one, else the water
  for (const p of parts) {
    if (p.kind === 'free' || p.n > 0) continue
    const donors = parts.filter(d => d.kind === 'used' && d.n > 1).sort((a, b) => b.n - a.n)
    const water = parts.find(d => d.kind === 'free' && d.n > 0)
    const donor = donors[0] ?? water ?? parts.filter(d => d.n > 1).sort((a, b) => b.n - a.n)[0]
    if (!donor) break
    donor.n--
    p.n++
  }
  return paint(parts, tints, water)
}

function paint(parts: { name: string; color: string; kind: 'used' | 'free' | 'buffer'; n: number }[], tints: Record<string, Tint>, water?: Water): Cell[] {
  const cells: Cell[] = []
  let shore = true
  for (const p of parts) {
    for (let i = 0; i < p.n; i++) {
      if (p.kind === 'used') {
        const t = tints[p.name] ?? { core: p.color, glow: p.color }
        const color = isHex(t.core) && isHex(t.glow) && p.n > 1 ? mix(t.core, t.glow, i / (p.n - 1)) : t.core
        cells.push({ ch: '█', color, scope: p.name })
      } else if (p.kind === 'buffer') {
        cells.push({ ch: BUFFER_GLYPH, color: water ? water.water : p.color, dim: true, scope: p.name })
      } else if (!water) {
        cells.push({ ch: FREE_GLYPH, color: 'inactive', dim: true, scope: p.name })
      } else {
        cells.push(shore ? { ch: FOAM_GLYPH, color: water.foam, scope: p.name } : { ch: WATER_GLYPH, color: water.water, dim: true, scope: p.name })
        shore = false
      }
    }
  }
  return cells
}

/** The first free cell (the water's edge), or -1 on a window with none. */
export function edgeOf(cells: readonly Cell[]): number {
  return cells.findIndex(c => c.ch === FOAM_GLYPH || c.ch === FREE_GLYPH)
}

// The line beneath the bar: a caret under the auto-compact point, labelled on
// whichever side has room, the label shortened (or left out) on a narrow bar
export function compactMarker(snap: CtxSnapshot, width: number): string | undefined {
  if (!snap.compactAt || !snap.max || width < 1) return undefined
  const col = Math.min(width - 1, Math.max(0, Math.floor((snap.compactAt / snap.max) * width)))
  for (const label of [`auto-compact ${fmtTokens(snap.compactAt)}`, fmtTokens(snap.compactAt)]) {
    if (col + 2 + label.length <= width) return ' '.repeat(col) + '▲ ' + label
    if (col >= label.length + 1) return ' '.repeat(col - label.length - 1) + label + ' ▲'
  }
  return ' '.repeat(col) + '▲'
}

// A small gauge for a section header: `part` of `whole` in `width` cells
export function shareBar(part: number, whole: number, width: number): { fill: string; rest: string } {
  const n = whole > 0 ? Math.min(width * 8, Math.round((part / whole) * width * 8)) : 0
  const full = Math.floor(n / 8)
  const fill = '█'.repeat(full) + EIGHTHS[n % 8]
  return { fill, rest: FREE_GLYPH.repeat(width - full - (n % 8 ? 1 : 0)) }
}

const SPARK = '▁▂▃▄▅▆▇█'

// The last `width` readings as one glyph each, scaled between their own low
// and high so a slow climb still shows; a flat run sits mid-height
export function sparkline(values: readonly number[], width: number): string {
  const v = values.slice(-Math.max(1, width))
  if (v.length === 0) return ''
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  if (hi === lo) return (SPARK[3] ?? '▄').repeat(v.length)
  return v.map(x => SPARK[Math.round(((x - lo) / (hi - lo)) * 7)] ?? '▄').join('')
}

export type Trend = {
  /** What the last turn added (negative after a compaction or /clear). */
  delta?: number
  /** Average growth per turn since the last drop, over the last few turns. */
  perTurn?: number
  /** Turns until auto-compaction at that pace. */
  turnsLeft?: number
}

const PACE_TURNS = 6

// How the window grows: the last step, the pace since the last drop (a
// compaction resets the pace rather than dragging it negative), and how many
// turns that pace leaves before auto-compaction
export function trend(values: readonly number[], compactAt?: number): Trend {
  const n = values.length
  if (n < 2) return {}
  const last = values[n - 1]!
  const delta = last - values[n - 2]!
  let from = n - 1
  while (from > 0 && n - 1 - from < PACE_TURNS && values[from - 1]! <= values[from]!) from--
  if (from === n - 1) return { delta }
  const perTurn = (last - values[from]!) / (n - 1 - from)
  if (perTurn <= 0) return { delta, perTurn: 0 }
  const turnsLeft = compactAt && compactAt > last ? Math.ceil((compactAt - last) / perTurn) : undefined
  return { delta, perTurn, ...(turnsLeft !== undefined ? { turnsLeft } : {}) }
}

// "+3.2k", "−41k", "±0"
export function fmtDelta(n: number): string {
  if (n === 0) return '±0'
  return (n > 0 ? '+' : '−') + fmtTokens(Math.abs(n))
}

// The pane's trend caption, as long as the facts allow
export function trendLabel(t: Trend): string {
  const parts: string[] = []
  if (t.delta !== undefined) parts.push(`${fmtDelta(t.delta)} last turn`)
  if (t.perTurn) parts.push(`~${fmtTokens(t.perTurn)}/turn`)
  if (t.turnsLeft !== undefined) parts.push(`~${t.turnsLeft} ${t.turnsLeft === 1 ? 'turn' : 'turns'} to auto-compact`)
  return parts.join(' · ')
}

// The host command that opens `path` with its default app: Start-Process on
// Windows (as Explorer would), `open` on macOS, `xdg-open` elsewhere. Never
// $EDITOR: a terminal editor has no terminal to draw in from here
export function openerFor(path: string, os: 'windows' | 'mac' | 'linux'): string[] {
  if (os === 'windows') return ['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${path.replace(/'/g, "''")}'`]
  return [os === 'mac' ? 'open' : 'xdg-open', path]
}
