import { test, expect } from 'claude-code/testing'

import { cellsOf, spriteOf } from './crab'

const COSTUMES = ['astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate', 'other'] as const

// Frame 0, full motion: the hat with its prop pixel at the first position, the shared body, legs A.
const FRAME0: Record<(typeof COSTUMES)[number], string> = {
  astronaut: '.waawy',
  detective: '.hhhhk',
  engineer: 'kyyyy.',
  chef: 'wwwwwy',
  racer: '.aaaak',
  pirate: '.kwwkk',
  other: '......',
}

test('each costume wears its hat and the prop pixel on frame 0', async () => {
  for (const costume of COSTUMES) {
    expect(spriteOf(costume, 0, 'full')).toEqual([FRAME0[costume], 'cebbec', '.bbbb.', '.l..l.'])
  }
})

test('frame 1 moves the legs and the prop, nothing else', async () => {
  const f0 = spriteOf('detective', 0, 'full')
  const f1 = spriteOf('detective', 1, 'full')
  expect(f1).toEqual(['.hhhh.', 'cebbek', '.bbbb.', '..ll..'])
  // the magnifier left row 0 and the body between is untouched
  expect(f1[2]).toBe(f0[2])
  expect(spriteOf('chef', 1, 'full')[1]).toBe('cebbey')
  expect(spriteOf('racer', 1, 'full')[1]).toBe('cebbew')
  expect(spriteOf('engineer', 1, 'full')[1]).toBe('kebbec')
  // the astronaut's star blinks off on odd frames
  expect(spriteOf('astronaut', 1, 'full')[0]).toBe('.waaw.')
})

test('the plain crab has no prop and no hat', async () => {
  expect(spriteOf('other', 0, 'full')).toEqual(spriteOf('other', 1, 'full').map((row, i) => (i === 3 ? '.l..l.' : row)))
  expect(spriteOf('other', 0, 'full')[0]).toBe('......')
})

test('an unknown costume is drawn as the plain crab', async () => {
  expect(spriteOf('dragon', 0, 'full')).toEqual(spriteOf('other', 0, 'full'))
})

test('subtle walks the legs and holds the prop; off holds everything; full moves both', async () => {
  const subtle1 = spriteOf('detective', 1, 'subtle')
  expect(subtle1[3]).toBe('..ll..')
  expect(subtle1.slice(0, 3)).toEqual(spriteOf('detective', 0, 'full').slice(0, 3))

  expect(spriteOf('detective', 1, 'off')).toEqual(spriteOf('detective', 0, 'off'))
  expect(spriteOf('detective', 1, 'off')).toEqual(spriteOf('detective', 0, 'full'))

  expect(spriteOf('detective', 1, 'full')).not.toEqual(spriteOf('detective', 0, 'full'))
})

test('the sprite is 6 cells wide and 2 rows tall, drawn in half blocks', async () => {
  for (const costume of COSTUMES) {
    for (const frame of [0, 1]) {
      const cells = cellsOf(costume, '#7F77DD', frame, 'full')
      expect(cells).toHaveLength(2)
      for (const row of cells) {
        expect(row).toHaveLength(6)
        for (const c of row) expect([' ', '▀', '▄', '█']).toContain(c.ch)
      }
    }
  }
})

test('a half block takes a background only where its two pixels differ', async () => {
  const cells = cellsOf('other', '#888780', 0, 'full')
  // row 0: nothing above, the claw/eye/body row below
  expect(cells[0]?.[0]).toEqual({ ch: '▄', fg: '#D97757' })
  expect(cells[0]?.[1]).toEqual({ ch: '▄', fg: '#1F1E1D' })
  // row 1: body over leg is one colour, a full block; body over nothing is an upper half
  expect(cells[1]?.[1]).toEqual({ ch: '█', fg: '#D97757' })
  expect(cells[1]?.[2]).toEqual({ ch: '▀', fg: '#D97757' })
  expect(cells[1]?.[0]).toEqual({ ch: ' ' })
  // two different colours: the upper pixel is the glyph, the lower the background
  const astronaut = cellsOf('astronaut', '#7F77DD', 0, 'full')
  expect(astronaut[0]?.[1]).toEqual({ ch: '▀', fg: '#F4F3EE', bg: '#1F1E1D' })
})

test('the accent colour is the costume colour it is handed', async () => {
  const cells = cellsOf('racer', '#1D9E75', 1, 'subtle')
  expect(cells[0]?.[1]?.fg).toBe('#1D9E75')
})
