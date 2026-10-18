import { test, expect } from 'claude-code/testing'

import { frameAt, type TideProps } from './tide'

const SHORE = '#d97757'
const FOAM = '#c79bd9'
const WATER = '#9fa8e0'
const DRIFT = '#ffffff'

// A 16-cell bar from its glyphs: █ shore, ≈ foam, ~ water, ░ buffer
function props16(glyphs: string, extra: Partial<TideProps> = {}): TideProps {
  const cells = [...glyphs].map(ch =>
    ch === '█'
      ? { ch, color: SHORE, scope: 'Messages' }
      : ch === '≈'
        ? { ch, color: FOAM, scope: 'Free space' }
        : ch === '~'
          ? { ch, color: WATER, dim: true, scope: 'Free space' }
          : { ch, color: WATER, dim: true, scope: 'Autocompact buffer' },
  )
  return { cells, level: 'subtle', edge: glyphs.indexOf('≈'), ...extra }
}

const BAR = '████≈~~~~~~~~~~░'

test('the foam laps once a second', () => {
  const p = props16(BAR, { lap: [FOAM, WATER] })
  expect(frameAt(p, 0, {})[4]).toMatchObject({ ch: '≈', color: FOAM })
  expect(frameAt(p, 5, {})[4]).toMatchObject({ ch: '~', color: WATER })
  expect(frameAt(p, 10, {})[4]!.ch).toBe('≈')
})

test('the water drifts only at full', () => {
  const subtle = props16(BAR, { lap: [FOAM, WATER], drift: DRIFT })
  for (let f = 0; f < 30; f++) expect(frameAt(subtle, f, {}).slice(5, 15).every(c => c.color === WATER)).toBe(true)
  const full = { ...subtle, level: 'full' as const }
  const lit = (f: number) => frameAt(full, f, {}).slice(5, 15).map(c => c.color === DRIFT)
  for (let f = 0; f < 30; f++) expect(lit(f).filter(Boolean).length).toBe(1)
  // one step every 600 ms
  expect(lit(0)).toEqual(lit(5))
  expect(lit(0)).not.toEqual(lit(6))
})

test('the growth glow plays 1.5 s from its start, then rests', () => {
  const colors = ['#111111', '#222222', '#333333']
  const p = props16(BAR, { growth: { id: 1, from: 3, to: 4, colors } })
  expect(colors).toContain(frameAt(p, 20 + 14, { growth: 20 })[3]!.color)
  expect(frameAt(p, 20 + 15, { growth: 20 })[3]!.color).toBe(SHORE)
  // not started yet: nothing
  expect(frameAt(p, 5, { growth: 20 })[3]!.color).toBe(SHORE)
})

test('the sweep runs right to left and leaves water', () => {
  const p = props16(BAR, { sweep: { id: 2, from: 4, to: 10, shore: SHORE, water: WATER, foam: FOAM } })
  const at = (k: number) => frameAt(p, 100 + k, { sweep: 100 }).map(c => c.ch).join('')
  // the old shore stands to the crest, water behind it
  expect(at(0)).toBe('█████████≈~~~~~░')
  expect(at(11)).toBe('████≈~~~~~~~~~~░')
  // done: the props' own bar, foam lapping again
  expect(at(12)).toBe(BAR)
})

test('a sweep wins over a growth glow on the same cells', () => {
  const p = props16(BAR, {
    growth: { id: 1, from: 4, to: 6, colors: ['#111111'] },
    sweep: { id: 2, from: 4, to: 10, shore: SHORE, water: WATER, foam: FOAM },
  })
  const c = frameAt(p, 0, { growth: 0, sweep: 0 })
  expect(c[4]).toMatchObject({ ch: '█', color: SHORE })
})

test('breathing cycles the given cells and nothing else', () => {
  const colors = ['#aa0000', '#bb0000', '#cc0000']
  const p = props16(BAR, { breathe: { at: [4], colors } })
  expect(frameAt(p, 0, {})[4]!.color).toBe('#aa0000')
  expect(frameAt(p, 1, {})[4]!.color).toBe('#bb0000')
  expect(frameAt(p, 1, {})[3]!.color).toBe(SHORE)
  expect(frameAt(p, 1, {})[5]!.color).toBe(WATER)
})

test('no edge: no foam is drawn', () => {
  const p = props16('███████████████░', { edge: -1, lap: [FOAM, WATER] })
  expect(frameAt(p, 5, {})).toEqual(p.cells)
})
