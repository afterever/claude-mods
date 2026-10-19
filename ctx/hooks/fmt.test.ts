import { test, expect } from 'claude-code/testing'

import type { CtxSnapshot } from '../types'
import { categoryTints } from './palette'
import {
  ago,
  bandBarWidth,
  bandCells,
  breatheAt,
  growthSpan,
  sweepSpan,
  barRuns,
  barSegments,
  edgeOf,
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

// The band's bar: whole cells, at least one for each row in use
const window8 = (msg: number, extra: CtxSnapshot['rows'] = []): CtxSnapshot => {
  const used = 3000 + 12000 + 2000 + msg + extra.reduce((a, r) => a + r.tokens, 0)
  return {
    ...snap,
    rows: [
      { name: 'System prompt', tokens: 3000, color: 'promptBorder', kind: 'used' },
      { name: 'System tools', tokens: 12000, color: 'warning', kind: 'used' },
      { name: 'Memory files', tokens: 2000, color: 'claude', kind: 'used' },
      ...extra,
      { name: 'Messages', tokens: msg, color: 'permission', kind: 'used' },
      { name: 'Free space', tokens: 1_000_000 - used - 33000, color: 'promptBorder', kind: 'free' },
      { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', kind: 'buffer' },
    ],
    total: used,
    percent: used / 10000,
  }
}
const snap8 = window8(63000)
const tints = categoryTints({ palette: 'ember', level: 'subtle' }, snap8.rows)
const WATER = { water: '#9fa8e0', foam: '#c79bd9' }
const usedCells = (cs: { scope: string }[]) => cs.filter(c => c.scope !== 'Free space' && c.scope !== 'Autocompact buffer').length

test('bandCells keeps the width and gives each row in use a cell', () => {
  for (const w of [8, 16]) expect(bandCells(snap8, w, tints).length).toBe(w)
  const names = bandCells(snap8, 16, tints).map(c => c.scope)
  expect(names.slice(0, 4)).toEqual(['System prompt', 'System tools', 'Memory files', 'Messages'])
  expect(names[15]).toBe('Autocompact buffer')
})

test('bandCells takes the minimums from Messages before the free space, so the fill stays true', () => {
  // 45%: 7 of 16 cells used, split 1 · 1 · 1 · 4
  const c = bandCells(window8(433000), 16, tints)
  expect(usedCells(c)).toBe(7)
  expect(c.filter(x => x.scope === 'Messages').length).toBe(4)
})

test('bandCells folds the smallest rows on a narrow bar', () => {
  const extra = [
    { name: 'Skills', tokens: 1500, color: 'ide', kind: 'used' as const },
    { name: 'MCP tools', tokens: 900, color: 'ide', kind: 'used' as const },
    { name: 'Custom agents', tokens: 400, color: 'ide', kind: 'used' as const },
    { name: 'Plugin stuff', tokens: 100, color: 'ide', kind: 'used' as const },
  ]
  const c = bandCells(window8(63000, extra), 8, tints)
  expect(c.length).toBe(8)
  const names = c.map(x => x.scope)
  expect(names).toContain('Messages')
  expect(names).toContain('Autocompact buffer')
  expect(names).not.toContain('Plugin stuff')
})

test('bandCells with water: ~ and the foam at the edge', () => {
  const c = bandCells(snap8, 16, tints, WATER)
  expect(c.map(x => x.ch).join('')).toBe('████≈~~~~~~~~~~░')
  expect(edgeOf(c)).toBe(4)
  expect(c[4]!.color).toBe(WATER.foam)
  expect(c[5]).toMatchObject({ color: WATER.water, dim: true })
  // without water: the dots, as before
  expect(bandCells(snap8, 16, tints).map(x => x.ch).join('')).toBe('████···········░')
})

test('bandCells shades a row across its own cells', () => {
  const c = bandCells(window8(433000), 16, tints)
  const msg = c.filter(x => x.scope === 'Messages')
  expect(msg[0]!.color).toBe(tints['Messages']!.core)
  expect(msg[msg.length - 1]!.color).toBe(tints['Messages']!.glow)
  // a theme key cannot shade: every cell takes it
  const plain = categoryTints({ palette: 'claude', level: 'subtle' }, snap8.rows)
  expect(bandCells(window8(433000), 16, plain).filter(x => x.scope === 'Messages').every(x => x.color === 'permission')).toBe(true)
})

test('bandCells on an empty or uncounted window is all water, and does not throw', () => {
  const empty = { ...snap8, rows: snap8.rows.map(r => (r.kind === 'used' ? { ...r, tokens: 0 } : r)), total: 0 }
  expect(bandCells(empty, 16, tints, WATER).some(c => c.ch === '█')).toBe(false)
  const none = { ...snap8, max: 0 }
  expect(bandCells(none, 16, tints, WATER).length).toBe(16)
})

test('bandCells on a full window has no edge', () => {
  const full = { ...snap8, rows: snap8.rows.map(r => (r.kind === 'free' ? { ...r, tokens: 0 } : r.name === 'Messages' ? { ...r, tokens: 950000 } : r)) }
  const c = bandCells(full, 16, tints, WATER)
  expect(c.length).toBe(16)
  expect(edgeOf(c)).toBe(-1)
})

test('barRuns with tints and water draws hex and ~', () => {
  const runs = barRuns(snap8, 48, tints, WATER)
  expect(cells(runs)).toBe(48)
  expect(runs[0]!.color).toBe(tints['System prompt']!.core)
  const free = runs.filter(r => r.scope === 'Free space').map(r => r.text).join('')
  expect(free).toMatch(/^≈~+$/)
  // without them, the bar is today's
  expect(barRuns(snap, 60)[0]!.color).toBe('permission')
})

// The cells an effect plays on, from a 16-cell band
const band16 = bandCells(snap8, 16, tints, WATER)
const fullBand = bandCells(
  { ...snap8, rows: snap8.rows.map(r => (r.kind === 'free' ? { ...r, tokens: 0 } : r.name === 'Messages' ? { ...r, tokens: 950000 } : r)) },
  16,
  tints,
  WATER,
)

test('growthSpan: the last used cells before the edge, at least one', () => {
  expect(growthSpan(band16, 10_000, 1_000_000)).toEqual({ from: 3, to: 4 })
  expect(growthSpan(band16, 200_000, 1_000_000)).toEqual({ from: 1, to: 4 })
  // no water left: the cells before the buffer
  expect(growthSpan(fullBand, 10_000, 1_000_000)).toEqual({ from: 14, to: 15 })
})

test('sweepSpan: the freed cells from the edge, never the buffer', () => {
  expect(sweepSpan(band16, 400_000, 1_000_000)).toEqual({ from: 4, to: 10 })
  expect(sweepSpan(band16, 5_000_000, 1_000_000)).toEqual({ from: 4, to: 15 })
  const none = sweepSpan(fullBand, 400_000, 1_000_000)
  expect(none.to - none.from).toBe(0)
})

test('breatheAt: the foam, or the last used cell on a full window', () => {
  expect(breatheAt(band16)).toEqual([4])
  expect(breatheAt(fullBand)).toEqual([14])
})

test('bandBarWidth: the bar grows with the band, so a near-empty window overstates less', () => {
  expect([40, 69].map(c => bandBarWidth(c, false))).toEqual([8, 8])
  expect([70, 120, 129].map(c => bandBarWidth(c, false))).toEqual([16, 16, 16])
  expect([130, 159].map(c => bandBarWidth(c, false))).toEqual([24, 24])
  expect([160, 199].map(c => bandBarWidth(c, false))).toEqual([32, 32])
  expect([200, 239].map(c => bandBarWidth(c, false))).toEqual([48, 48])
  expect([240, 400].map(c => bandBarWidth(c, false))).toEqual([64, 64])
})

test('bandBarWidth: a standing warning keeps the bar at 16 until the band is wide enough for the badge too', () => {
  expect(bandBarWidth(199, true)).toBe(16)
  expect(bandBarWidth(60, true)).toBe(8)
  // from 200 columns the worst-case row (badge and carrying cost) fits beside a 48-cell bar
  expect(bandBarWidth(200, true)).toBe(48)
  expect(bandBarWidth(240, true)).toBe(64)
})

test('a longer bar overstates a near-empty window less: the share drawn is closer to the true one', () => {
  // 18k used of 1M is under 2%; each of the four rows still gets its cell
  const near = window8(1000)
  const share = (w: number) => usedCells(bandCells(near, w, tints)) / w
  expect(share(32)).toBeLessThan(share(16))
  expect(share(16)).toBeLessThan(share(8))
})
