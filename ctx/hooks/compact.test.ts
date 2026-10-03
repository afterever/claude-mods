import { test, expect } from 'claude-code/testing'

import { addRecent, clipAsk, keepInstructions, KEEP_MARK, mergeInstructions, shouldWarn, warnBadge, warnLevel, warnText } from './compact'

test('addRecent keeps the newest distinct items, newest last', () => {
  expect(addRecent(['a', 'b', 'c'], 'b', 3)).toEqual(['a', 'c', 'b'])
  expect(addRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
})

test('clipAsk makes one short line', () => {
  expect(clipAsk('fix   the\nbug')).toBe('fix the bug')
  expect(clipAsk('x'.repeat(200), 10)).toBe('xxxxxxxxx…')
})

test('keepInstructions names the focus, the files and the latest requests', () => {
  const text = keepInstructions({ focus: 'ship 0.5.0', edited: ['a.ts', 'b.ts'], asks: ['add the warning', 'ship it'] })
  expect(text.startsWith(KEEP_MARK)).toBe(true)
  expect(text).toContain('- The focus going forward: ship 0.5.0')
  expect(text).toContain('a.ts, b.ts')
  expect(text).toContain('  2. "ship it"')
  // with nothing to go on, it still asks for the task in progress
  expect(keepInstructions({ edited: [], asks: [] })).toContain('The task in progress and the next step.')
})

test('mergeInstructions adds once, after what was given', () => {
  const keep = keepInstructions({ edited: ['a.ts'], asks: [] })
  expect(mergeInstructions(undefined, keep)).toBe(keep)
  expect(mergeInstructions('  focus on tests ', keep)).toBe(`focus on tests\n\n${keep}`)
  const once = mergeInstructions('focus on tests', keep)
  expect(mergeInstructions(once, keep)).toBe(once)
})

test('warnLevel reads the turns left, or the fill when there is no pace', () => {
  expect(warnLevel(500_000, undefined, 2)).toBe('none')
  expect(warnLevel(500_000, 967_000, 40)).toBe('none')
  expect(warnLevel(500_000, 967_000, 9)).toBe('near')
  expect(warnLevel(650_000, 967_000, 3)).toBe('imminent')
  expect(warnLevel(830_000, 967_000, undefined)).toBe('near')
  expect(warnLevel(930_000, 967_000, undefined)).toBe('imminent')
  // one heavy early turn sets a steep pace: no warning at a tenth full
  expect(warnLevel(120_000, 967_000, 9)).toBe('none')
  expect(warnLevel(120_000, 967_000, 2)).toBe('none')
  // past the floor (40% filled for near, 60% for imminent) the pace speaks
  expect(warnLevel(450_000, 967_000, 2)).toBe('near')
  expect(warnLevel(600_000, 967_000, 2)).toBe('imminent')
})

test('shouldWarn fires once per step up, re-armed by a fall', () => {
  expect(shouldWarn('none', 'near')).toBe(true)
  expect(shouldWarn('near', 'near')).toBe(false)
  expect(shouldWarn('near', 'imminent')).toBe(true)
  expect(shouldWarn('imminent', 'near')).toBe(false)
  expect(shouldWarn('none', 'none')).toBe(false)
})

test('the warning reads short', () => {
  expect(warnText('imminent', 900_000, 967_000, 2)).toBe('Auto-compact is close: ~2 turns left (900k / 967k). /ctx compact keeps what matters.')
  expect(warnText('near', 830_000, 1_000_000, undefined)).toBe('Auto-compact is coming: 83% of the way (830k / 1M). /ctx compact keeps what matters.')
  expect(warnBadge(900_000, 967_000, 1)).toBe('⚠ ~1 turn')
  expect(warnBadge(900_000, 1_000_000, undefined)).toBe('⚠ 90% to compact')
})
