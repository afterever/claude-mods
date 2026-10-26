import { test, expect } from 'claude-code/testing'

import { bandPace, deltaTone, duration, paceLine, paceStep, paceWindows, percentTone, type Limit, type PacePiece } from './pace'

const H = 3_600_000
const D = 24 * H
const NOW = 1_000_000_000_000

// A window with `used` percent spent, resetting `left` ms from NOW
const five = (used: number, left: number): Limit => ({ kind: 'five_hour', percentUsed: used, resetsAt: new Date(NOW + left).toISOString() })
const seven = (used: number, left: number): Limit => ({ kind: 'seven_day', percentUsed: used, resetsAt: new Date(NOW + left).toISOString() })
const text = (ps: PacePiece[]) => ps.map(p => p.text).join('')

test('duration is the HUD\'s: minutes rounded up, hours under a day, days from a day', () => {
  expect(duration(45 * 60_000)).toBe('45m')
  expect(duration(44.2 * 60_000)).toBe('45m')
  expect(duration(3 * H + 40 * 60_000)).toBe('3h 40m')
  expect(duration(3 * H)).toBe('3h')
  expect(duration(3 * H + 59 * 60_000 + 31_000)).toBe('4h')
  expect(duration(4 * D + 16 * H)).toBe('4d 16h')
  expect(duration(4 * D)).toBe('4d')
})

test('the delta is the HUD\'s own samples: the share gone rounds first, then the difference', () => {
  // 53% used, 2h of 5h left: 60% of the window gone, so 7 behind
  const [a] = paceWindows([five(53, 2 * H)], NOW)
  expect(a).toEqual({ kind: 'five_hour', percent: 53, left: '2h', delta: -7 })
  // 82% used, 100h of 168h left: 40.48% gone, rounds to 40, so +42 (the exact difference, 41.52, would truncate to +41)
  const [b] = paceWindows([seven(82, 100 * H)], NOW)
  expect(b).toEqual({ kind: 'seven_day', percent: 82, left: '4d 4h', delta: 42 })
})

test('a window gives its percent alone once it has no time left to measure', () => {
  expect(paceWindows([five(40, -1000)], NOW)).toEqual([{ kind: 'five_hour', percent: 40 }])
  expect(paceWindows([{ kind: 'five_hour', percentUsed: 40 }], NOW)).toEqual([{ kind: 'five_hour', percent: 40 }])
  expect(paceWindows([{ kind: 'five_hour', percentUsed: 40, resetsAt: 'soon' }], NOW)).toEqual([{ kind: 'five_hour', percent: 40 }])
})

test('a reset more than a window away counts as nothing gone', () => {
  expect(paceWindows([five(10, 6 * H)], NOW)[0]).toMatchObject({ left: '6h', delta: 10 })
})

test('the windows come five-hour first, and kinds ctx does not know are left out', () => {
  const ws = paceWindows([seven(22, 4 * D), { kind: 'spend_limit', percentUsed: 30 }, five(25, 3 * H)], NOW)
  expect(ws.map(w => w.kind)).toEqual(['five_hour', 'seven_day'])
  expect(paceWindows([], NOW)).toEqual([])
})

test('the delta takes the HUD\'s colors: green under pace, yellow up to 15 over, red beyond', () => {
  expect(deltaTone(-11)).toBe('success')
  expect(deltaTone(0)).toBe('warning')
  expect(deltaTone(15)).toBe('warning')
  expect(deltaTone(16)).toBe('error')
})

test('the percent takes the color of how much of the window is used', () => {
  expect(percentTone(0)).toBe('success')
  expect(percentTone(74)).toBe('success')
  expect(percentTone(75)).toBe('warning')
  expect(percentTone(89)).toBe('warning')
  expect(percentTone(90)).toBe('error')
})

test('the full line is the HUD\'s, with the paw once and a dot between the windows', () => {
  const ws = paceWindows([five(25, 3 * H + 40 * 60_000), seven(22, 4 * D + 16 * H)], NOW)
  // 3h40m of 5h left: 26.67% gone, which rounds to 27; 4d16h of 7d left: 33.33% gone
  expect(text(paceLine(ws, 'full'))).toBe('🐾 25% (3h 40m/-2%) · 22% (4d 16h/-11%)')
  expect(text(paceLine(ws, 'short'))).toBe('🐾 25% (-2%) · 22% (-11%)')
  expect(text(paceLine(ws, 'delta'))).toBe('🐾 -2% · -11%')
  expect(paceLine(ws, 'none')).toEqual([])
})

test('a positive delta carries its plus, and zero reads +0%', () => {
  const ws = paceWindows([five(53, 3 * H), seven(82, 100 * H)], NOW)
  expect(text(paceLine(ws, 'full'))).toBe('🐾 53% (3h/+13%) · 82% (4d 4h/+42%)')
  expect(text(paceLine(paceWindows([five(40, 3 * H)], NOW), 'delta'))).toBe('🐾 +0%')
})

test('a window with no pace shows its percent at every step', () => {
  const ws = paceWindows([five(40, -1), seven(22, 4 * D + 16 * H)], NOW)
  expect(text(paceLine(ws, 'full'))).toBe('🐾 40% · 22% (4d 16h/-11%)')
  expect(text(paceLine(ws, 'delta'))).toBe('🐾 40% · -11%')
})

test('each piece has its own tone: the paw, the brackets and the dots stay dim', () => {
  const ws = paceWindows([five(80, 2 * H)], NOW)
  const parts = paceLine(ws, 'full')
  // 80% used, 60% gone: +20, red; the percent is at 75% or more, yellow
  expect(parts.find(p => p.text === '80%')?.tone).toBe('warning')
  expect(parts.find(p => p.text === '+20%')?.tone).toBe('error')
  expect(parts.filter(p => p.tone === 'dim').map(p => p.text).join('')).toBe('🐾  (2h/)')
})

test('the step follows the band\'s width, and desktop has room where no width was measured', () => {
  expect(paceStep(160, 'terminal')).toBe('full')
  expect(paceStep(130, 'terminal')).toBe('full')
  expect(paceStep(129, 'terminal')).toBe('short')
  expect(paceStep(100, 'terminal')).toBe('short')
  expect(paceStep(99, 'terminal')).toBe('delta')
  expect(paceStep(80, 'terminal')).toBe('delta')
  expect(paceStep(79, 'terminal')).toBe('none')
  // the band is told no width on desktop, which would read as 80: unmeasured, it has the room
  expect(paceStep(undefined, 'desktop')).toBe('full')
  // measured (the viewport's, less the frame), it shrinks like the terminal's
  expect(paceStep(140, 'desktop')).toBe('full')
  expect(paceStep(110, 'desktop')).toBe('short')
  expect(paceStep(87, 'desktop')).toBe('delta')
  expect(paceStep(60, 'desktop')).toBe('none')
  expect(paceStep(undefined, 'terminal')).toBe('delta')
})

test('the band shows the pace on a subscription, the session total on an API account, or nothing', () => {
  const subscription = [five(25, 3 * H + 40 * 60_000), seven(22, 4 * D + 16 * H)]
  expect(text(bandPace({ limits: subscription, usd: 14.2, costOn: true, step: 'full', now: NOW }))).toBe('🐾 25% (3h 40m/-2%) · 22% (4d 16h/-11%)')
  // no windows: the ledger's total, with its label where there is room
  expect(text(bandPace({ limits: [], usd: 14.2, costOn: true, step: 'full', now: NOW }))).toBe('session $14.2')
  expect(text(bandPace({ limits: [], usd: 14.2, costOn: true, step: 'short', now: NOW }))).toBe('$14.2')
  expect(bandPace({ limits: [], usd: 14.2, costOn: true, step: 'full', now: NOW })[1]?.tone).toBe('success')
  // `/ctx cost off` hides dollars and leaves the pace
  expect(bandPace({ limits: [], usd: 14.2, costOn: false, step: 'full', now: NOW })).toEqual([])
  expect(text(bandPace({ limits: subscription, usd: 14.2, costOn: false, step: 'short', now: NOW }))).toBe('🐾 25% (-2%) · 22% (-11%)')
  // a gateway's spend limit: its percent alone, no window to pace
  expect(text(bandPace({ limits: [{ kind: 'spend_limit', percentUsed: 34 }], usd: 14.2, costOn: true, step: 'full', now: NOW }))).toBe('spend 34%')
  // nothing to say: before the first reply, or no ledger
  expect(bandPace({ limits: [], usd: undefined, costOn: true, step: 'full', now: NOW })).toEqual([])
  expect(bandPace({ limits: [], usd: 0, costOn: true, step: 'full', now: NOW })).toEqual([])
  expect(bandPace({ limits: subscription, usd: 14.2, costOn: true, step: 'none', now: NOW })).toEqual([])
})
