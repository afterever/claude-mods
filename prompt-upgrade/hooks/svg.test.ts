import { test, expect } from 'claude-code/testing'

import { numberWidth, segmentsOf, statsSvg } from './svg'

test('each digit lights the segments that draw it', () => {
  expect(segmentsOf('8')).toBe('abcdefg')
  expect(segmentsOf('1')).toBe('bc')
  expect(segmentsOf('0')).toBe('abcdef')
  // the segments of 7 are a subset of 9's, of 9 a subset of 8's
  for (const s of segmentsOf('7')) expect(segmentsOf('9')).toContain(s)
  for (const s of segmentsOf('9')) expect(segmentsOf('8')).toContain(s)
  expect(segmentsOf('x')).toBe(segmentsOf('0'))
})

test('the numbers drawing has three tiles, the three numbers and a description', () => {
  const art = statsSvg(480, 12, 87, 5)
  expect(art.source.startsWith('<svg ')).toBe(true)
  expect(art.source).toContain('viewBox="0 0 480 76"')
  expect(art.source.match(/<rect /g)).toHaveLength(3)
  expect(art.source.match(/<g /g)).toHaveLength(3)
  // 12 and 87 are two digits, 5 is one: five digit paths in all
  expect(art.source.match(/<path /g)).toHaveLength(5)
  expect(art.alt).toBe('12 words before, 87 words after, 5 details added')
  // the colours say what each number is: white, gold, green
  expect(art.source).toContain('stroke="#E6EDF3"')
  expect(art.source).toContain('stroke="#F2C46D"')
  expect(art.source).toContain('stroke="#3DD68C"')
  // the captions are muted
  expect(art.source).toContain('fill="#7D8590"')
})

test('captions are shortened when a tile is narrow', () => {
  expect(statsSvg(600, 1, 2, 3).source).toContain('>details added<')
  const tight = statsSvg(260, 1, 2, 3).source
  expect(tight).toContain('>added<')
  expect(tight).not.toContain('details added')
})

test('a number too wide for its tile is drawn smaller, never cut', () => {
  for (const width of [240, 300, 480, 900]) {
    const tile = (width - 16) / 3
    for (const n of [0, 7, 42, 187, 1234, 99999]) {
      const art = statsSvg(width, n, n, n)
      const scales = [...art.source.matchAll(/scale\(([\d.]+)\)/g)].map(m => Number(m[1]))
      expect(scales).toHaveLength(3)
      for (const s of scales) {
        expect(s).toBeGreaterThan(0)
        expect(s).toBeLessThanOrEqual(1)
        // the drawn number, less the tile's padding, stays inside the tile
        expect(numberWidth(n) * s + 24).toBeLessThanOrEqual(tile + 0.001)
      }
    }
  }
})
