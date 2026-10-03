import { test, expect } from 'claude-code/testing'

import type { CtxSnapshot } from '../types'
import {
  ago,
  barRuns,
  barSegments,
  compactMarker,
  fillColor,
  fmtCount,
  fmtDelta,
  fmtShare,
  fmtTokens,
  headline,
  openerFor,
  shareBar,
  sparkline,
  trend,
  trendLabel,
} from './fmt'

const snap: CtxSnapshot = {
  rows: [
    { name: 'Messages', tokens: 33400, color: 'permission', kind: 'used' },
    { name: 'System tools', tokens: 20500, color: 'warning', kind: 'used' },
    { name: 'Free space', tokens: 915100, color: 'promptBorder', kind: 'free' },
    { name: 'Autocompact buffer', tokens: 30000, color: 'inactive', kind: 'buffer' },
    { name: 'MCP tools (deferred)', tokens: 190000, color: 'inactive', kind: 'deferred' },
  ],
  total: 81900,
  max: 1_000_000,
  percent: 8.19,
  detail: 'summary',
  at: 0,
  model: 'Opus 5.5',
  compactAt: 970_000,
  mcpTokens: 0,
  mcpCount: 0,
  mcpDeferredTokens: 0,
  mcpDeferredCount: 0,
  servers: [],
  memory: [],
  skillCount: 0,
  skillIncluded: 0,
  skillTokens: 0,
  skills: [],
  agentTokens: 0,
  agents: [],
  commandCount: 0,
  commandIncluded: 0,
  commandTokens: 0,
}

const cells = (runs: { text: string }[]) => runs.reduce((a, r) => a + [...r.text].length, 0)

test('fmtTokens matches the Desktop panel', () => {
  expect(fmtTokens(584)).toBe('584')
  expect(fmtTokens(33400)).toBe('33.4k')
  expect(fmtTokens(3000)).toBe('3k')
  expect(fmtTokens(915100)).toBe('915.1k')
  expect(fmtTokens(1_000_000)).toBe('1M')
})

test('fmtShare shows a percent, and a dash for deferred rows', () => {
  expect(fmtShare(snap.rows[0]!, snap.max)).toBe('3.3%')
  expect(fmtShare(snap.rows[2]!, snap.max)).toBe('91.5%')
  expect(fmtShare(snap.rows[4]!, snap.max)).toBe('—')
})

test('headline reads like the panel header', () => {
  expect(headline(snap)).toBe('81.9k / 1M (8%)')
})

test('fmtCount shows included/total only when some were left out', () => {
  expect(fmtCount(40, 40)).toBe('40')
  expect(fmtCount(12, 40)).toBe('12/40')
})

test('fillColor goes green, amber, red', () => {
  expect(fillColor(8)).toBe('success')
  expect(fillColor(65)).toBe('warning')
  expect(fillColor(92)).toBe('error')
})

test('ago reads short', () => {
  expect(ago(3000)).toBe('just now')
  expect(ago(42_000)).toBe('42s ago')
  expect(ago(5 * 60_000)).toBe('5m ago')
  expect(ago(2 * 3_600_000)).toBe('2h ago')
})

test('barSegments: used rows, then free space, then the buffer at the right edge', () => {
  const segs = barSegments(snap, 60)
  expect(segs.map(s => s.style)).toEqual(['solid', 'solid', 'free', 'buffer'])
  expect(segs[segs.length - 1]!.end).toBe(480)
  // every eighth belongs to exactly one segment
  for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end)
})

test('barRuns fills exactly the width, deferred rows left out', () => {
  for (const w of [10, 48, 60, 133]) expect(cells(barRuns(snap, w))).toBe(w)
  const runs = barRuns(snap, 60)
  expect(runs[0]!.color).toBe('permission')
  expect(runs.some(r => r.scope === 'MCP tools (deferred)')).toBe(false)
  expect(runs[runs.length - 1]!.scope).toBe('Autocompact buffer')
})

test('barRuns draws a partial block over the next row where a row ends mid-cell', () => {
  // Messages 33.4k of 1M over 60 cells = 16 eighths exactly; System tools ends mid-cell
  const runs = barRuns(snap, 60)
  const partial = runs.find(r => r.bg !== undefined || /[▏▎▍▌▋▊▉]/.test(r.text))
  expect(partial).toBeDefined()
})

test('a tiny category still shows', () => {
  const tiny = { ...snap, rows: [{ name: 'Tiny', tokens: 10, color: 'error', kind: 'used' as const }, ...snap.rows] }
  expect(barSegments(tiny, 40)[0]).toMatchObject({ name: 'Tiny', start: 0, end: 2 })
})

test('compactMarker puts the caret under the threshold, label where it fits', () => {
  const m = compactMarker(snap, 60)!
  expect(m.indexOf('▲')).toBe(58)
  expect(m.length).toBeLessThanOrEqual(60)
  expect(m).toContain('auto-compact 970k')
  const early = compactMarker({ ...snap, compactAt: 100_000 }, 60)!
  expect(early.startsWith('      ▲ auto-compact')).toBe(true)
  expect(compactMarker({ ...snap, compactAt: undefined }, 60)).toBeUndefined()
  // too narrow for the words: the figure alone, then the caret alone, never wider than the bar
  expect(compactMarker(snap, 16)).toBe(' '.repeat(10) + '970k ▲')
  expect(compactMarker(snap, 4)).toBe('   ▲')
})

test('shareBar fills by eighths and keeps its width', () => {
  expect(shareBar(1, 2, 6)).toEqual({ fill: '███', rest: '···' })
  const b = shareBar(1, 16, 6)
  expect([...b.fill + b.rest].length).toBe(6)
  expect(shareBar(0, 0, 6)).toEqual({ fill: '', rest: '······' })
})

test('sparkline scales to its own range, a flat run mid-height', () => {
  expect(sparkline([10, 20, 30, 40], 8)).toBe('▁▃▆█')
  expect(sparkline([5, 5, 5], 8)).toBe('▄▄▄')
  expect(sparkline([1, 2, 3, 4, 5], 3)).toBe('▁▅█')
  expect(sparkline([], 8)).toBe('')
})

test('trend: the last step, the pace since the last drop, turns to auto-compact', () => {
  expect(trend([])).toEqual({})
  expect(trend([100])).toEqual({})
  // steady +10k a turn, 60k short of the threshold: 6 turns
  expect(trend([10_000, 20_000, 30_000, 40_000], 100_000)).toEqual({ delta: 10_000, perTurn: 10_000, turnsLeft: 6 })
  // a compaction resets the pace instead of dragging it negative
  expect(trend([80_000, 90_000, 20_000, 25_000, 30_000], 100_000)).toEqual({ delta: 5_000, perTurn: 5_000, turnsLeft: 14 })
  // right after a drop there is no pace yet
  expect(trend([90_000, 20_000], 100_000)).toEqual({ delta: -70_000 })
  // the pace reads the last six turns only
  expect(trend([0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 66_000]).perTurn).toBe(65_000 / 6)
  // no threshold, no countdown
  expect(trend([1, 2]).turnsLeft).toBeUndefined()
})

test('fmtDelta and trendLabel read short', () => {
  expect(fmtDelta(3_200)).toBe('+3.2k')
  expect(fmtDelta(-41_000)).toBe('−41k')
  expect(fmtDelta(0)).toBe('±0')
  expect(trendLabel({ delta: 3_200, perTurn: 2_100, turnsLeft: 1 })).toBe('+3.2k last turn · ~2.1k/turn · ~1 turn to auto-compact')
  expect(trendLabel({ delta: -70_000 })).toBe('−70k last turn')
})

test('openerFor hands the path over whole, quoted for PowerShell', () => {
  expect(openerFor("C:\Users\o'brien\CLAUDE.md", 'windows')).toEqual([
    'powershell', '-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath 'C:\Users\o''brien\CLAUDE.md'",
  ])
  expect(openerFor('/Users/me/CLAUDE.md', 'mac')).toEqual(['open', '/Users/me/CLAUDE.md'])
  expect(openerFor('/home/me/CLAUDE.md', 'linux')).toEqual(['xdg-open', '/home/me/CLAUDE.md'])
})
