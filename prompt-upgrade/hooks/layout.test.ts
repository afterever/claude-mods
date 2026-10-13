import { test, expect } from 'claude-code/testing'

import { bigNumber, clip, cutText, lineWidth, stacksCards, statsPlan, strWidth, trackerRow } from './layout'

const WIDTHS = [20, 24, 30, 36, 40, 47, 56, 60, 66, 72, 80, 100, 120, 160]

test('big numbers are three rows tall and every row of a number is the same width', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 187, 1234]) {
    const rows = bigNumber(n)
    expect(rows).toHaveLength(3)
    expect(strWidth(rows[0])).toBe(strWidth(rows[1]))
    expect(strWidth(rows[1])).toBe(strWidth(rows[2]))
    // heavy box-drawing characters and non-breaking gaps only, none of the
    // half-line glyphs (U+2574 to U+257F) that many fonts lack
    const all = rows.join('')
    expect(/^[─-╳ ]+$/.test(all)).toBe(true)
    expect(/[╴-╿]/.test(all)).toBe(false)
  }
  expect(bigNumber(0)).toEqual(['┏━┓', '┃ ┃', '┗━┛'])
  expect(strWidth(bigNumber(12)[0])).toBe(7)
})

test('the numbers line is framed tiles when each holds its number whole, else one line', () => {
  for (const width of WIDTHS) {
    for (const [a, b, c] of [[0, 0, 0], [12, 87, 5], [1234, 5678, 9]] as const) {
      const plan = statsPlan(width, a, b, c)
      if (plan.kind === 'line') continue
      // a third of the row, less the frame, holds the number and the caption
      const inner = Math.floor((width - 2) / 3) - 2
      for (const tile of plan.tiles) {
        expect(strWidth(tile.digits[0])).toBeLessThanOrEqual(inner)
        expect(strWidth(tile.caption)).toBeLessThanOrEqual(Math.max(inner, 6))
      }
    }
  }
  // wide: full captions; narrower: short captions; narrowest: one line
  const wide = statsPlan(100, 12, 87, 5)
  expect(wide.kind === 'tiles' && wide.tiles.map(t => t.caption)).toEqual(['words before', 'words after', 'details added'])
  expect(wide.kind === 'tiles' && wide.tiles.map(t => t.tone)).toEqual(['text', 'gold', 'green'])
  const narrow = statsPlan(40, 12, 87, 5)
  expect(narrow.kind === 'tiles' && narrow.tiles.map(t => t.caption)).toEqual(['before', 'after', 'added'])
  expect(statsPlan(24, 12, 87, 5).kind).toBe('line')
  // a number too big for its frame never gets cut: it falls back to the line
  expect(statsPlan(40, 12345, 87, 5).kind).toBe('line')
})

test('the tracker: finished steps a green check, the current one gold, the rest muted', () => {
  const row = trackerRow(100, 2)
  const steps = row.filter(s => s.tone !== 'hair')
  expect(steps.map(s => s.tone)).toEqual(['green', 'green', 'gold', 'muted'])
  expect(steps[0]!.t).toBe('✓ Your prompt')
  expect(steps[1]!.t).toBe('✓ Questions')
  expect(steps[2]!.t).toBe('3 Rewrite')
  expect(steps[3]!.t).toBe('4 Review')
  // a narrow pane shortens the words before it drops any
  expect(trackerRow(40, 0).some(s => s.t.includes('Prompt'))).toBe(true)
  for (const width of WIDTHS) {
    for (let step = 0; step < 4; step++) expect(lineWidth(trackerRow(width, step))).toBeLessThanOrEqual(Math.max(width, 14))
  }
})

test('two cards share the row from 60 cells and stack under it', () => {
  expect(stacksCards(44)).toBe(true)
  expect(stacksCards(59)).toBe(true)
  expect(stacksCards(60)).toBe(false)
  expect(stacksCards(100)).toBe(false)
})

test('wide characters count two cells and clipping never splits one', () => {
  expect(strWidth('咖啡')).toBe(4)
  expect(strWidth('abc')).toBe(3)
  expect(clip('Context window', 8)).toBe('Context…')
  expect(strWidth(clip('咖啡咖啡咖啡', 7))).toBeLessThanOrEqual(7)
  expect(clip('short', 10)).toBe('short')
})

test('a long text is cut with a count of what is left, so a card stays a card', () => {
  expect(cutText('short')).toBe('short')
  const cutDown = cutText('x'.repeat(5000), 4000)
  expect(cutDown.startsWith('x'.repeat(4000))).toBe(true)
  expect(cutDown).toContain('… 1000 more characters')
})
