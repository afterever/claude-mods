import { test, expect } from 'claude-code/testing'

import type { CtxSnapshot } from '../types'
import { barCells, fmtShare, fmtTokens, headline } from './fmt'

const snap: CtxSnapshot = {
  rows: [
    { name: 'Messages', tokens: 33400, color: 'permission', kind: 'used' },
    { name: 'System tools', tokens: 20500, color: 'warning', kind: 'used' },
    { name: 'Compact buffer', tokens: 3000, color: 'inactive', kind: 'buffer' },
    { name: 'Free space', tokens: 915100, color: 'promptBorder', kind: 'free' },
    { name: 'MCP tools (deferred)', tokens: 190000, color: 'inactive', kind: 'deferred' },
  ],
  total: 81900,
  max: 1_000_000,
  percent: 8.19,
  detail: 'summary',
  at: 0,
  mcpTokens: 0,
  mcpCount: 0,
  servers: [],
  memory: [],
  skillCount: 0,
  skillTokens: 0,
  skills: [],
}

test('fmtTokens matches the Desktop panel', () => {
  expect(fmtTokens(584)).toBe('584')
  expect(fmtTokens(33400)).toBe('33.4k')
  expect(fmtTokens(3000)).toBe('3k')
  expect(fmtTokens(915100)).toBe('915.1k')
  expect(fmtTokens(1_000_000)).toBe('1M')
})

test('fmtShare shows a percent, and a dash for deferred rows', () => {
  expect(fmtShare(snap.rows[0], snap.max)).toBe('3.3%')
  expect(fmtShare(snap.rows[3], snap.max)).toBe('91.5%')
  expect(fmtShare(snap.rows[4], snap.max)).toBe('—')
})

test('headline reads like the panel header', () => {
  expect(headline(snap)).toBe('81.9k / 1M (8%)')
})

test('barCells fills exactly the width, deferred rows left out', () => {
  const cells = barCells(snap, 60)
  expect(cells.reduce((a, c) => a + c.n, 0)).toBe(60)
  expect(cells.some(c => c.color === 'inactive' && c.dim)).toBe(true)
  expect(cells[0].color).toBe('permission')
})
