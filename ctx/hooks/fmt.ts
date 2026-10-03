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

export type BarCell = { color: string; n: number; dim?: boolean }

// The window as `width` cells: each used row gets a run (at least one cell when
// it holds anything), the compaction buffer a dim run, the rest stays empty
export function barCells(snap: CtxSnapshot, width: number): BarCell[] {
  const cells: BarCell[] = []
  let left = Math.max(1, width)
  const max = snap.max || 1
  for (const r of snap.rows) {
    if ((r.kind !== 'used' && r.kind !== 'buffer') || r.tokens <= 0) continue
    const n = Math.min(left, Math.max(1, Math.round((r.tokens / max) * width)))
    if (n <= 0) break
    cells.push({ color: r.color, n, dim: r.kind === 'buffer' })
    left -= n
  }
  if (left > 0) cells.push({ color: 'inactive', n: left, dim: true })
  return cells
}

export function headline(snap: CtxSnapshot): string {
  return `${fmtTokens(snap.total)} / ${fmtTokens(snap.max)} (${Math.round(snap.percent)}%)`
}

export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}
