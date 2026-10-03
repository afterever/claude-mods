import type { CtxRow, CtxSnapshot } from '../types'

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

// The bar as runs of cells, `width` cells wide. A cell where one used row
// ends draws that row's partial block over the next row's color, so the bar
// is smooth to an eighth of a cell rather than a whole one
export function barRuns(snap: CtxSnapshot, width: number): BarRun[] {
  const segs = barSegments(snap, width)
  // never empty: whatever the rows hold, free space or a used row covers the width
  const segAt = (e: number) => segs.find(s => s.start <= e && e < s.end) ?? segs[segs.length - 1]!
  const runs: BarRun[] = []
  for (let c = 0; c < Math.max(1, width); c++) {
    const cell = cellOf(segAt(c * 8), segAt(c * 8 + 7), c * 8)
    const last = runs[runs.length - 1]
    if (last && last.color === cell.color && last.bg === cell.bg && last.dim === cell.dim && last.scope === cell.scope) {
      last.text += cell.text
    } else {
      runs.push(cell)
    }
  }
  return runs
}

function cellOf(a: Seg, b: Seg, start: number): BarRun {
  if (a.style === 'solid') {
    if (a === b) return { text: '█', color: a.color, scope: a.name }
    return {
      text: EIGHTHS[Math.min(7, a.end - start)] ?? '▏',
      color: a.color,
      bg: b.style === 'solid' ? b.color : undefined,
      scope: a.name,
    }
  }
  const s = a.end - start >= 4 ? a : b
  return s.style === 'free'
    ? { text: FREE_GLYPH, color: 'inactive', dim: true, scope: s.name }
    : { text: BUFFER_GLYPH, color: s.color, dim: true, scope: s.name }
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
