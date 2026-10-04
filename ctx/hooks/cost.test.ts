import { test, expect } from 'claude-code/testing'

import type { CtxSample, CtxTurn } from '../types'
import {
  bandSuffix,
  carryLine,
  compacted,
  compactPlan,
  EMPTY_SPEND,
  fitRates,
  fmtUsd,
  hitRate,
  idleCost,
  isMiss,
  ledgerAt,
  median,
  price,
  sessionLine,
  shownTurn,
  startTurn,
  stepDone,
  ttlMs,
  turnDone,
  turnLine,
  untilCompact,
} from './cost'

// Opus 5.5's list prices, $ per million tokens: input 4 (output 5x), cache read 0.20, 1-hour write 8
const OPUS = { inOut: 4, read: 0.2, write: 8 }
const usage = (input: number, output: number, read: number, write: number, model = 'claude-opus-5-5') => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  model,
})
// Equal to `digits` decimal places
const near = (a: number, b: number, digits: number) => expect(Math.abs(a - b) < 0.5 * 10 ** -digits).toBe(true)
const priced = (r: typeof OPUS, input: number, output: number, read: number, write: number) =>
  ((input + 5 * output) * r.inOut + read * r.read + write * r.write) / 1e6

test('fmtUsd keeps two decimals under $10, fewer above', () => {
  expect(fmtUsd(1.844)).toBe('$1.84')
  expect(fmtUsd(0.0073)).toBe('$0.007')
  expect(fmtUsd(0.0004)).toBe('<$0.001')
  expect(fmtUsd(0)).toBe('$0')
  expect(fmtUsd(12.34)).toBe('$12.3')
  expect(fmtUsd(140.4)).toBe('$140')
  expect(fmtUsd(1234)).toBe('$1,234')
})

test('a request that wrote most of its prompt fresh missed the cache', () => {
  expect(isMiss({ input: 3, output: 900, read: 0, write: 412_000 })).toBe(true)
  // the turn's new tokens: a write, but a small one beside the read
  expect(isMiss({ input: 3, output: 900, read: 400_000, write: 9_000 })).toBe(false)
  // small prompts never count
  expect(isMiss({ input: 3, output: 10, read: 0, write: 8_000 })).toBe(false)
  expect(hitRate({ input: 0, output: 5, read: 98, write: 2 })).toBe(0.98)
  expect(hitRate({ input: 0, output: 5, read: 0, write: 0 })).toBeUndefined()
})

test('a turn spends what the ledger grew by, subagents included', () => {
  let s = ledgerAt(EMPTY_SPEND, 10)
  s = startTurn(s)
  s = stepDone(s, usage(3, 400, 300_000, 4_000), { startedAt: 0, endedAt: 1000 })
  s = stepDone(s, usage(3, 300, 304_000, 2_000), { startedAt: 1000, endedAt: 2000 })
  s = stepDone(s, usage(10, 200, 20_000, 5_000, 'claude-haiku-4-5'), { agentId: 'a1', startedAt: 1200, endedAt: 1800 })
  s = turnDone(s, 'a1')
  s = ledgerAt(s, 11.84)
  expect(shownTurn(s)).toBeUndefined()
  s = turnDone(s)
  const t = shownTurn(s)!
  near(t.usd, 1.84, 6)
  expect(t.requests).toBe(2)
  expect(t.subRuns).toBe(1)
  expect(t.sub.read).toBe(20_000)
  expect(t.main.read).toBe(604_000)
  expect(s.requests).toBe(2)
  expect(s.turns).toBe(1)

  // the next turn starts from where the ledger stood; the last one is kept, and frozen
  s = startTurn(s)
  expect(s.cur!.base).toBe(11.84)
  near(shownTurn(s)!.usd, 1.84, 6)
  expect(s.usds).toHaveLength(1)
  // a turn with a subagent teaches no prices
  expect(s.samples).toHaveLength(0)
})

test('cache misses after a gap tell the cache lifetime', () => {
  let s = startTurn(ledgerAt(EMPTY_SPEND, 0))
  s = stepDone(s, usage(3, 100, 0, 50_000), { startedAt: 0, endedAt: 1000 })
  // the session's first request writes everything: a miss, but no gap before it
  expect(s.misses).toBe(1)
  expect(ttlMs(s)).toBeUndefined()
  // back after 20 minutes, still cached: a 1-hour cache
  s = stepDone(s, usage(3, 100, 50_000, 1_000), { startedAt: 1000 + 20 * 60_000, endedAt: 1000 + 20 * 60_000 + 500 })
  expect(ttlMs(s)).toBe(60 * 60_000)

  // a 5-minute cache: a miss after 7 idle minutes
  let f = startTurn(ledgerAt(EMPTY_SPEND, 0))
  f = stepDone(f, usage(3, 100, 0, 50_000), { startedAt: 0, endedAt: 1000 })
  f = stepDone(f, usage(3, 100, 0, 51_000), { startedAt: 1000 + 7 * 60_000, endedAt: 1000 + 7 * 60_000 + 500 })
  expect(f.misses).toBe(2)
  expect(ttlMs(f)).toBe(5 * 60_000)
})

// A clean turn as the ledger would price it
function cleanTurn(s: typeof EMPTY_SPEND, r: typeof OPUS, steps: [number, number, number, number][]) {
  s = startTurn(s)
  let usd = s.ledger ?? 0
  for (const [i, o, rd, w] of steps) {
    s = stepDone(s, usage(i, o, rd, w), { startedAt: 0, endedAt: 0 })
    usd += priced(r, i, o, rd, w)
  }
  return turnDone(ledgerAt(s, usd))
}

test('the prices are learned from clean turns, exactly', () => {
  let s = ledgerAt(EMPTY_SPEND, 0)
  s = cleanTurn(s, OPUS, [[3, 800, 200_000, 6_000], [3, 400, 206_000, 2_000]])
  s = cleanTurn(s, OPUS, [[5, 2_000, 210_000, 12_000]])
  s = cleanTurn(s, OPUS, [[3, 300, 222_000, 1_000], [3, 300, 223_000, 500], [3, 600, 224_000, 3_000]])
  // the third turn is frozen, and sampled, as the next begins
  s = startTurn(s)
  expect(s.samples).toHaveLength(3)
  const r = fitRates(s.samples, 'claude-opus-5-5')!
  near(r.inOut, 4, 3)
  near(r.read, 0.2, 3)
  near(r.write, 8, 3)
  expect(fitRates(s.samples, 'claude-sonnet-5-5')).toBeUndefined()
  expect(fitRates(s.samples.slice(0, 2), 'claude-opus-5-5')).toBeUndefined()
})

test('a turn the ledger priced differently is left out of the fit', () => {
  const pts: CtxSample[] = [
    [0.004, 0.4, 0.006],
    [0.01, 0.21, 0.012],
    [0.006, 0.669, 0.0045],
    [0.008, 0.9, 0.02],
  ].map(([inOut, read, write]) => ({ model: 'm', inOut: inOut!, read: read!, write: write!, usd: inOut! * 4 + read! * 0.2 + write! * 8 }))
  // a WebFetch's small model, billed in a turn that looked clean
  pts.push({ model: 'm', inOut: 0.005, read: 0.5, write: 0.01, usd: 0.005 * 4 + 0.5 * 0.2 + 0.01 * 8 + 0.3 })
  const r = fitRates(pts, 'm')!
  near(r.read, 0.2, 3)
  near(r.write, 8, 3)
})

test('forward costs follow from the window and the prices', () => {
  // 412k re-read every request
  near(price(OPUS, { input: 0, output: 0, read: 412_000, write: 0 }), 0.0824, 6)
  // 10 turns of 6 requests while the window grows 8k a turn from 400k: reads of 408k..480k
  near(untilCompact(400_000, 8_000, 10, 6, OPUS), (10 * 6 * 0.2 * (400_000 + 44_000)) / 1e6, 6)
  const plan = compactPlan(412_000, 38_000, OPUS, 6_000)!
  near(plan.saving, (374_000 * 0.2) / 1e6, 6)
  near(plan.once, (412_000 * 0.2 + 6_000 * 20 + 38_000 * 8) / 1e6, 6)
  expect(plan.payback).toBe(Math.ceil(plan.once / plan.saving))
  expect(compactPlan(30_000, 38_000, OPUS, 6_000)).toBeUndefined()
  // 70 turns of 6 requests, growing 8k a turn: 420 reads averaging 696k
  expect(carryLine(412_000, OPUS, 6, { perTurn: 8_000, turnsLeft: 70 })).toBe('carrying ~$0.08/request · ~$0.49/turn · ~$58.5 until auto-compact')
  expect(carryLine(412_000, OPUS, undefined, {})).toBe('carrying ~$0.08/request')
})

test('an idle server costs its tokens on every request and every rewrite', () => {
  const c = idleCost(3_100, [{ requests: 140, misses: 3 }, { requests: 60, misses: 1 }, {}], OPUS)!
  expect(c.n).toBe(2)
  near(c.total, (3_100 * (200 * 0.2 + 4 * 8)) / 1e6, 9)
  near(c.perSession, c.total / 2, 9)
  expect(idleCost(3_100, [{}, {}], OPUS)).toBeUndefined()
})

const turn = (over: Partial<CtxTurn> = {}): CtxTurn => ({
  base: 0,
  usd: 1.84,
  requests: 6,
  main: { input: 10, output: 3_000, read: 980_000, write: 20_000 },
  model: 'claude-opus-5-5',
  mixed: false,
  sub: { input: 0, output: 0, read: 0, write: 0 },
  subRuns: 0,
  missTokens: 0,
  cold: false,
  compacted: false,
  done: true,
  ...over,
})

test('a cold start writes the prompt afresh by nature: counted, never shown as a miss', () => {
  let s = startTurn(ledgerAt(EMPTY_SPEND, 0))
  s = stepDone(s, usage(3, 500, 0, 45_000), { startedAt: 0, endedAt: 1000 })
  s = stepDone(s, usage(3, 300, 45_000, 2_000), { startedAt: 1000, endedAt: 2000 })
  s = turnDone(ledgerAt(s, 0.5))
  const t = shownTurn(s)!
  expect(t.cold).toBe(true)
  expect(t.missTokens).toBe(0)
  // the rewrite still costs: idle overhead prices it
  expect(s.misses).toBe(1)
  // about half the prompt came from the cache: expected on turn one, so the band says nothing of it
  expect(bandSuffix(t, 130, {}).map(p => p.text)).toEqual(['+$0.50', '·2r'])
  expect(bandSuffix({ ...t, cold: false }, 130, {}).some(p => p.text.startsWith('·●'))).toBe(true)
})

test('a compaction starts the cache record over: the write after it teaches nothing', () => {
  let s = startTurn(ledgerAt(EMPTY_SPEND, 0))
  s = stepDone(s, usage(3, 100, 0, 50_000), { startedAt: 0, endedAt: 1000 })
  s = compacted(s, { after: 38_000 })
  expect(s.lastStepAt).toBeUndefined()
  // ten idle minutes later, the new prefix is written: no miss shown, no lifetime learned
  s = stepDone(s, usage(3, 100, 0, 38_000), { startedAt: 1000 + 10 * 60_000, endedAt: 1000 + 10 * 60_000 + 500 })
  expect(s.cur!.missTokens).toBe(0)
  expect(s.minMissGap).toBeUndefined()
  expect(ttlMs(s)).toBeUndefined()
  expect(bandSuffix({ ...turn(), compacted: true, main: { input: 3, output: 100, read: 0, write: 88_000 } }, 130, {}).length).toBe(2)
})

test('a ledger with small extra charges in every turn still gives near prices', () => {
  // twelve realistic turns: 1 to 8 requests over a window of 180k to 420k, a little noise in every
  // turn's dollars, and a small billed call outside the counted requests in most of them
  const pts: CtxSample[] = []
  for (let i = 0; i < 12; i++) {
    const k = 1 + ((i * 5) % 8)
    const window = 180_000 + ((i * 37_000) % 240_000)
    const read = (k * window) / 1e6
    const write = (2_000 + ((i * 7_919) % 14_000) + (i % 4 === 0 ? 30_000 : 0)) / 1e6
    const inOut = (3 * k + 5 * (300 + ((i * 1_301) % 2_700)) * k) / 1e6
    const exact = inOut * OPUS.inOut + read * OPUS.read + write * OPUS.write
    const noise = 1 + 0.01 * Math.sin(i * 2.3)
    const extra = i % 3 === 2 ? 0 : 0.002
    pts.push({ model: 'm', inOut, read, write, usd: exact * noise + extra })
  }
  // within 1% of the list prices in practice; never plausible but wrong
  const r = fitRates(pts, 'm')!
  const off = (got: number, want: number) => Math.abs(got - want) / want
  expect(off(r.read, OPUS.read)).toBeLessThan(0.05)
  expect(off(r.write, OPUS.write)).toBeLessThan(0.05)
  expect(off(r.inOut, OPUS.inOut)).toBeLessThan(0.05)
})

test('the band says only what is out of the ordinary', () => {
  const text = (p: { text: string }[]) => p.map(x => x.text).join('')
  expect(text(bandSuffix(turn(), 120, {}))).toBe('+$1.84·6r')
  expect(text(bandSuffix(turn({ subRuns: 1 }), 120, { subUsd: 0.31 }))).toBe('+$1.84·6r·⑂~$0.31')
  const miss = turn({ usd: 5.7, main: { input: 10, output: 3_000, read: 120_000, write: 880_000 } })
  expect(text(bandSuffix(miss, 130, {}))).toBe('+$5.70·6r·●12% hit')
  // narrower: the miss outlives the count; narrowest: the dollars alone
  expect(text(bandSuffix(miss, 110, {}))).toBe('+$5.70·●12%')
  expect(text(bandSuffix(miss, 90, {}))).toBe('+$5.70')
  expect(bandSuffix(miss, 130, {}).find(p => p.text.includes('●'))!.tone).toBe('error')
  // over three times the median turn, the dollars go red
  expect(bandSuffix(miss, 130, { median: 1.5 })[0]!.tone).toBe('error')
  expect(bandSuffix(turn(), 130, { median: 1.5 })[0]!.tone).toBe('plain')
  expect(median([3, 1, 2])).toBe(2)
  expect(median([1, 2])).toBe(1.5)
})

test('the session total is the denominator for the last turn', () => {
  expect(sessionLine(14.2, 1.84)).toBe('session $14.2 · last turn was 13% of it')
  // no turn yet, or one that cost nothing: the total stands alone
  expect(sessionLine(14.2, undefined)).toBe('session $14.2')
  expect(sessionLine(14.2, 0)).toBe('session $14.2')
  // a sliver of a big session isn't rounded down to nothing
  expect(sessionLine(500, 0.5)).toBe('session $500 · last turn was <1% of it')
  // the share never passes the whole
  expect(sessionLine(1, 2)).toBe('session $1.00 · last turn was 100% of it')
  // nothing spent, nothing to say
  expect(sessionLine(0, 1)).toBeUndefined()
  expect(sessionLine(Number.NaN, 1)).toBeUndefined()
})

test('the pane spells the turn out', () => {
  expect(turnLine(turn({ subRuns: 1 }), 0.31)).toBe('last turn +$1.84 (6 requests · 1 subagent ~$0.31 · cache 98% hit)')
  expect(turnLine(turn({ requests: 1 }), undefined)).toBe('last turn +$1.84 (1 request · cache 98% hit)')
})
