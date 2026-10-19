import { test, expect } from 'claude-code/testing'

import { bandSvg, breathSvg } from './svg'

const cell = (ch: string, color: string, scope: string, dim = false) => ({ ch, color, scope, ...(dim ? { dim: true } : {}) })
// System prompt, Messages (two shaded cells), the foam, the water, the buffer
const CELLS = [
  cell('█', '#f2b8a0', 'System prompt'),
  cell('█', '#d97757', 'Messages'),
  cell('█', '#f3a97c', 'Messages'),
  cell('≈', '#c79bd9', 'Free space'),
  ...Array.from({ length: 11 }, () => cell('~', '#9fa8e0', 'Free space', true)),
  cell('░', '#9fa8e0', 'Autocompact buffer', true),
]

test('bandSvg is 128 by 12 for 16 cells and carries no time', () => {
  const a = bandSvg({ cells: CELLS, level: 'subtle', edge: 3, tick: 15 })
  expect(a.width).toBe(128)
  expect(a.height).toBe(12)
  // the same input draws the same source: a redraw restarts nothing
  expect(bandSvg({ cells: CELLS, level: 'subtle', edge: 3, tick: 15 }).source).toBe(a.source)
})

test('bandSvg: one gradient per category, water with a wave, the tick', () => {
  const { source } = bandSvg({ cells: CELLS, level: 'subtle', edge: 3, tick: 15 })
  // System prompt and Messages
  expect(source.match(/<linearGradient/g)?.length).toBe(2)
  expect(source).toContain('stop-color="#d97757"')
  expect(source).toContain('stop-color="#f3a97c"')
  expect(source).toContain('class="wave"')
  expect(source).toContain('class="tick"')
  expect(source).not.toContain('class="glint"')
  expect(bandSvg({ cells: CELLS, level: 'full', edge: 3, tick: 15 }).source).toContain('class="glint"')
})

test('bandSvg: off has no @keyframes; every source has prefers-reduced-motion', () => {
  expect(bandSvg({ cells: CELLS, level: 'off', edge: 3 }).source).not.toContain('@keyframes')
  for (const level of ['off', 'subtle', 'full'] as const) expect(bandSvg({ cells: CELLS, level, edge: 3 }).source).toContain('prefers-reduced-motion')
  expect(breathSvg('#ff5c5c').source).toContain('prefers-reduced-motion')
})

test('bandSvg: a growth adds a class with its id, a sweep at full', () => {
  const g = bandSvg({ cells: CELLS, level: 'subtle', edge: 3, growth: { id: 7, from: 1, to: 3, colors: ['#ffe3b0'] } }).source
  expect(g).toContain('g7')
  const s = bandSvg({ cells: CELLS, level: 'full', edge: 3, sweep: { id: 4, from: 3, to: 9 } }).source
  expect(s).toContain('s4')
})

test('bandSvg: near auto-compact the tick and the edge breathe', () => {
  const { source } = bandSvg({ cells: CELLS, level: 'subtle', edge: 3, tick: 15, warn: '#ff5c5c' })
  expect(source).toContain('breathe')
  expect(source).toContain('#ff5c5c')
})

test('bandSvg: cellPx sets the width a cell takes, so the pane can fill its own width', () => {
  const fine = Array.from({ length: 100 }, (_, i) => cell(i < 10 ? '█' : i === 10 ? '≈' : '~', i < 10 ? '#d97757' : '#9fa8e0', i < 10 ? 'Messages' : 'Free space', i > 10))
  const a = bandSvg({ cells: fine, level: 'subtle', edge: 10, tick: 80, cellPx: 3 })
  expect(a.width).toBe(300)
  expect(a.source).toContain('width="300"')
  // the edge sits at its cell's pixel, and the default stays 8 px a cell
  expect(a.source).toContain('x="30"')
  expect(bandSvg({ cells: CELLS, level: 'subtle', edge: 3 }).width).toBe(128)
})

test('bandSvg: a marker label adds a caret and the words beneath the bar, inside the width', () => {
  const plain = bandSvg({ cells: CELLS, level: 'subtle', edge: 3, tick: 10 })
  const m = bandSvg({ cells: CELLS, level: 'subtle', edge: 3, tick: 10, label: 'auto-compact 167k' })
  expect(m.width).toBe(plain.width)
  expect(m.height).toBeGreaterThan(plain.height)
  expect(m.source).toContain('auto-compact 167k')
  // the label would run past the right edge from the tick, so it ends at the tick instead
  expect(m.source).toContain('text-anchor="end"')
  // none without a tick
  expect(bandSvg({ cells: CELLS, level: 'subtle', edge: 3, label: 'auto-compact 167k' }).source).not.toContain('auto-compact')
})

test('breathSvg is a 10 by 12 warning glyph', () => {
  const b = breathSvg('#f6d36b')
  expect(b.width).toBe(10)
  expect(b.height).toBe(12)
  expect(b.source).toContain('#f6d36b')
  expect(b.source).toContain('⚠')
})
