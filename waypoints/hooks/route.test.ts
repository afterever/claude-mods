import { test, expect } from 'claude-code/testing'

// @ts-ignore plain JavaScript, shared with the module
import { routeCells, miniRoute, runs } from './route.mjs'

type T = { id: number; size: string; status: string; replaced?: boolean }
const task = (id: number, size: string, status = 'pending', extra: Partial<T> = {}): T => ({ id, size, status, ...extra })
const text = (cells: any[]) => cells.map((c) => c.ch).join('')

test('legs follow S, M and L, wider routes get longer legs', async () => {
  const tasks = [task(1, 'S'), task(2, 'M'), task(3, 'L')]
  const r = routeCells(tasks, 60)
  expect(r.dense).toBe(false)
  // the unit tops out at 6 cells: legs 6, 12, 18
  expect(text(r.cells)).toBe('●' + '┄'.repeat(6) + '○' + '┄'.repeat(12) + '○' + '┄'.repeat(18) + '⚐')
  const narrow = routeCells(tasks, 28)
  const legs = text(narrow.cells).split(/[○⚐●✦]/).filter(Boolean).map((s) => s.length)
  // proportional where there is room: M twice S, L three times S
  expect(legs[1]).toBe(legs[0] * 2)
  expect(legs[2]).toBe(legs[0] * 3)
})

test('a leg is never under 2 cells until the legs must all drop to 1', async () => {
  const tasks = [task(1, 'S'), task(2, 'S'), task(3, 'S'), task(4, 'S')]
  // 1 + 4 * (2 + 1) = 13 cells
  expect(text(routeCells(tasks, 13).cells)).toBe('●┄┄○┄┄○┄┄○┄┄⚐')
  // 12 cells: every leg is 1
  const squeezed = routeCells(tasks, 12)
  expect(squeezed.dense).toBe(false)
  expect(text(squeezed.cells)).toBe('●┄○┄○┄○┄⚐')
})

test('past the width it draws one glyph per task and ends with … when cut', async () => {
  const tasks = Array.from({ length: 20 }, (_, i) => task(i + 1, 'M', i < 3 ? 'done' : i === 3 ? 'active' : 'pending'))
  // even with 1-cell legs it needs 1 + 2 * 20 = 41 cells
  const wide = routeCells(tasks, 30)
  expect(wide.dense).toBe(true)
  expect(text(wide.cells)).toBe('●●●✦' + '○'.repeat(16))
  const cut = routeCells(tasks, 10)
  expect(text(cut.cells)).toBe('●●●✦○○○○○…')
  expect(cut.cells).toHaveLength(10)
})

test('the running task lights the node at the start of its leg, the leg stays dim', async () => {
  const tasks = [task(1, 'M', 'done'), task(2, 'M', 'active'), task(3, 'M')]
  const { cells } = routeCells(tasks, 40)
  const s = text(cells)
  expect(s.startsWith('●━━')).toBe(true)
  const lit = cells.findIndex((c: any) => c.ch === '✦')
  expect(cells[lit].role).toBe('active')
  expect(cells[lit - 1].ch).toBe('━') // the finished leg before it
  expect(cells[lit + 1].ch).toBe('┄') // the running leg ahead of it
  expect(cells[lit + 1].role).toBe('pending')
})

test('tasks done out of order each draw their own leg, every running task lights its node', async () => {
  const tasks = [task(1, 'S', 'active'), task(2, 'S', 'active'), task(3, 'S', 'done'), task(4, 'S')]
  const { cells } = routeCells(tasks, 40)
  expect(text(cells).match(/✦/g)).toHaveLength(2)
  // task 3 is done though 1 and 2 are not: its leg is solid, its end node filled
  const third = text(cells).split(/[✦●○⚐]/).filter(Boolean)
  expect(third[2]).toMatch(/^━+$/)
  expect(third[0]).toMatch(/^┄+$/)
})

test('dropped and replaced tasks are left out, the last node is the destination', async () => {
  const tasks = [task(1, 'S', 'done'), task(2, 'S', 'dropped'), task(3, 'S', 'pending', { replaced: true }), task(4, 'S')]
  const { cells } = routeCells(tasks, 40)
  expect(text(cells).match(/[○●✦⚐]/g)).toHaveLength(3) // start, after task 1, destination
  expect(cells[cells.length - 1].ch).toBe('⚐')
  expect(cells[cells.length - 1].role).toBe('pending')
  const allDone = routeCells([task(1, 'S', 'done'), task(2, 'S', 'done')], 40).cells
  expect(allDone[allDone.length - 1]).toMatchObject({ ch: '⚐', role: 'done' })
})

test('a finished route is solid and ends in a ⚑', async () => {
  const tasks = [task(1, 'S', 'done'), task(2, 'M', 'pending')]
  const { cells } = routeCells(tasks, 40, { finished: true })
  expect(text(cells)).not.toMatch(/[┄○⚐✦]/)
  expect(cells[cells.length - 1]).toMatchObject({ ch: '⚑', role: 'sparkle' })
})

test('each cell knows how far along the route it is', async () => {
  const { cells } = routeCells([task(1, 'M'), task(2, 'M')], 40)
  expect(cells[0].t).toBe(0)
  expect(cells[cells.length - 1].t).toBe(1)
  expect(cells[1].t).toBeGreaterThan(cells[0].t)
})

test('an empty plan has no route', async () => {
  expect(routeCells([], 40)).toEqual({ cells: [], dense: false })
  expect(miniRoute({ tasks: [], status: 'running' })).toEqual({ cells: [], dense: false })
})

test('the mini route is a node and a leg per task, then a glyph per task past 12', async () => {
  const g = { status: 'running', tasks: [task(1, 'M', 'done'), task(2, 'S', 'done'), task(3, 'L', 'active'), task(4, 'S')] }
  expect(text(miniRoute(g).cells)).toBe('●━●━✦┄○┄⚐')
  const big = { status: 'running', tasks: Array.from({ length: 14 }, (_, i) => task(i + 1, 'S', i < 2 ? 'done' : 'pending')) }
  const m = miniRoute(big)
  expect(m.dense).toBe(true)
  expect(text(m.cells)).toBe('●●' + '○'.repeat(12))
  const done = { status: 'met', tasks: [task(1, 'S', 'done'), task(2, 'S', 'done')] }
  expect(text(miniRoute(done).cells)).toBe('●━●━⚑')
})

test('runs merge neighbours of one colour so the band is a few Text elements', async () => {
  const { cells } = routeCells([task(1, 'S', 'done'), task(2, 'S')], 40)
  const merged = runs(cells, (c: any) => (c.role === 'done' ? 'tool' : 'idle'))
  expect(merged.map((r: any) => r.color)).toEqual(['tool', 'idle'])
  expect(merged.map((r: any) => r.text).join('')).toBe(text(cells))
})

test('a parked task keeps a dashed leg with ⏸ in its middle, even once the plan finished', async () => {
  const tasks = [task(1, 'M', 'done'), task(2, 'M', 'parked')]
  const { cells } = routeCells(tasks, 40)
  const s = text(cells)
  expect(s.match(/⏸/g)).toHaveLength(1)
  // node, done leg, node, then the parked leg: dashes around the mark, then the open flag
  expect(s).toMatch(/^●━+●┄*⏸┄*⚐$/)
  expect(cells[cells.length - 1].role).toBe('pending')
  const fin = text(routeCells(tasks, 40, { finished: true }).cells)
  expect(fin).toMatch(/^●━+●┄*⏸┄*⚑$/)
})

test('dense mode draws a parked task as ⏸', async () => {
  const tasks = Array.from({ length: 20 }, (_, i) => task(i + 1, 'M', i === 19 ? 'parked' : 'done'))
  expect(text(routeCells(tasks, 30).cells)).toBe('●'.repeat(19) + '⏸')
})
