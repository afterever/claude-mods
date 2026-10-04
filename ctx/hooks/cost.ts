import type { CtxCounts, CtxSample, CtxSpend, CtxTurn } from '../types'
import { fmtTokens } from './fmt'

/** One request's token counts in the API's spelling (ModelUsage, TurnUsage). */
export type ApiUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model?: string
}

/** A model's prices as learned from the ledger, US dollars per million tokens. */
export type Rates = {
  /** Uncached input; output is priced at OUTPUT_RATIO times it. */
  inOut: number
  read: number
  write: number
}

// Output costs five times input on every current model, so the two share one price to learn
export const OUTPUT_RATIO = 5
const M = 1_000_000
const TURNS_KEPT = 48
const SAMPLES_KEPT = 24
// A request that wrote this many tokens fresh, more than half its prompt, missed the cache
const MISS_MIN = 20_000
// An idle gap shorter than this says nothing about how long the cache lives
const GAP_MIN = 4 * 60_000
const FIVE_MIN = 5 * 60_000
const HOUR = 60 * 60_000
// The fit stands only if every turn it kept is priced this closely
const FIT_TOLERANCE = 0.05

export const ZERO: CtxCounts = { input: 0, output: 0, read: 0, write: 0 }
export const EMPTY_SPEND: CtxSpend = { usds: [], samples: [], requests: 0, misses: 0, turns: 0, maxHitGap: 0 }

export function countsOf(u: ApiUsage): CtxCounts {
  return { input: u.input_tokens, output: u.output_tokens, read: u.cache_read_input_tokens, write: u.cache_creation_input_tokens }
}

function add(a: CtxCounts, b: CtxCounts): CtxCounts {
  return { input: a.input + b.input, output: a.output + b.output, read: a.read + b.read, write: a.write + b.write }
}

export function isMiss(c: CtxCounts): boolean {
  return c.write >= MISS_MIN && c.write > 0.5 * (c.input + c.read + c.write)
}

// The share of the prompt the cache served
export function hitRate(c: CtxCounts): number | undefined {
  const all = c.input + c.read + c.write
  return all > 0 ? c.read / all : undefined
}

function newTurn(base: number): CtxTurn {
  return { base, usd: 0, requests: 0, main: ZERO, model: '', mixed: false, sub: ZERO, subRuns: 0, missTokens: 0, cold: false, compacted: false, done: false }
}

// A turn the ledger priced from the main model's own counts alone: nothing
// else (a subagent, a compaction, a second model) is mixed into its dollars
function isClean(t: CtxTurn): boolean {
  return t.done && !t.mixed && !t.compacted && t.subRuns === 0 && t.sub.input + t.sub.read + t.sub.write === 0 && t.requests > 0 && t.usd > 0 && !!t.model
}

// A new main-loop turn: the one before is frozen, its dollars kept, and,
// when clean, kept as a sample of what the model charges
export function startTurn(s: CtxSpend): CtxSpend {
  const ended = s.cur
  const next: CtxSpend = { ...s, cur: newTurn(s.ledger ?? 0) }
  if (!ended || (ended.requests === 0 && ended.usd === 0)) return next
  next.last = ended
  if (ended.done) next.usds = [...s.usds, ended.usd].slice(-TURNS_KEPT)
  if (isClean(ended)) {
    const m = ended.main
    const sample: CtxSample = { model: ended.model, inOut: (m.input + OUTPUT_RATIO * m.output) / M, read: m.read / M, write: m.write / M, usd: ended.usd }
    next.samples = [...s.samples, sample].slice(-SAMPLES_KEPT)
  }
  return next
}

// One model request finished: main-loop requests count toward the turn and
// the cache's record; a subagent's only toward the turn's subagent share. The
// session's first request, and the first after a compaction, write the prompt
// afresh by nature: a miss that costs (and is counted) but is never shown
export function stepDone(s: CtxSpend, u: ApiUsage, at: { agentId?: string; startedAt: number; endedAt: number }): CtxSpend {
  const cur = s.cur ?? newTurn(s.ledger ?? 0)
  const c = countsOf(u)
  if (at.agentId) return { ...s, cur: { ...cur, sub: add(cur.sub, c) } }
  const miss = isMiss(c)
  const cold = s.lastStepAt === undefined
  const model = u.model ?? cur.model
  const next: CtxSpend = {
    ...s,
    cur: {
      ...cur,
      requests: cur.requests + 1,
      main: add(cur.main, c),
      model,
      mixed: cur.mixed || (!!cur.model && !!u.model && u.model !== cur.model),
      missTokens: miss && !cold ? Math.max(cur.missTokens, c.write) : cur.missTokens,
      cold: cur.cold || cold,
    },
    requests: s.requests + 1,
    misses: s.misses + (miss ? 1 : 0),
    lastStepAt: at.endedAt,
  }
  if (s.lastStepAt !== undefined) {
    const gap = at.startedAt - s.lastStepAt
    if (miss && gap >= GAP_MIN) next.minMissGap = Math.min(s.minMissGap ?? Infinity, gap)
    else if (!miss && c.read > 0) next.maxHitGap = Math.max(s.maxHitGap, gap)
  }
  return next
}

// A turn ended: the main loop's closes the turn; a subagent's run is counted in it
export function turnDone(s: CtxSpend, agentId?: string): CtxSpend {
  if (!s.cur) return s
  if (agentId) return { ...s, cur: { ...s.cur, subRuns: s.cur.subRuns + 1 } }
  return { ...s, cur: { ...s.cur, done: true }, turns: s.turns + 1 }
}

// The ledger moved: the running turn has spent what it grew by since the turn began
export function ledgerAt(s: CtxSpend, usd: number): CtxSpend {
  return { ...s, ledger: usd, ...(s.cur ? { cur: { ...s.cur, usd: Math.max(0, usd - s.cur.base) } } : {}) }
}

// A compaction ran: its turn teaches no prices, and its size and cost are kept.
// The prefix changed, so the next request writes afresh whatever the cache's
// lifetime: it starts the idle record over rather than teaching it
export function compacted(s: CtxSpend, c: { after?: number; usd?: number; summary?: number }): CtxSpend {
  const { lastStepAt: _, ...rest } = s
  return { ...rest, compact: c, ...(s.cur ? { cur: { ...s.cur, compacted: true } } : {}) }
}

// The latest turn that finished
export function shownTurn(s: CtxSpend): CtxTurn | undefined {
  return s.cur?.done ? s.cur : s.last?.done ? s.last : undefined
}

export function median(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined
  const v = [...xs].sort((a, b) => a - b)
  const mid = v.length >> 1
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

// The three prices that best explain the samples, by least squares
function solve(pts: readonly CtxSample[]): Rates | undefined {
  const xs = pts.map(p => [p.inOut, p.read, p.write] as const)
  const a = [0, 1, 2].map(i => [0, 1, 2].map(j => xs.reduce((sum, x) => sum + x[i]! * x[j]!, 0)))
  const b = [0, 1, 2].map(i => xs.reduce((sum, x, k) => sum + x[i]! * pts[k]!.usd, 0))
  const det = (m: number[][]) =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
  const d = det(a)
  // turns too alike to tell the prices apart
  if (!(Math.abs(d) > 1e-6 * a[0]![0]! * a[1]![1]! * a[2]![2]!)) return undefined
  const col = (k: number) => det(a.map((row, i) => row.map((v, j) => (j === k ? b[i]! : v))))
  return { inOut: col(0) / d, read: col(1) / d, write: col(2) / d }
}

const predict = (r: Rates, p: CtxSample) => p.inOut * r.inOut + p.read * r.read + p.write * r.write

// What the model charges, learned from the ledger's own turns. The ledger is
// exact, so clean turns fit exactly; a turn the fit misses (a tool's own model
// call billed in it) is dropped, worst first. None until three turns agree,
// and none that breaks how prices relate (a read is cheaper than input, a
// write dearer)
export function fitRates(samples: readonly CtxSample[], model: string, n = 12): Rates | undefined {
  let pts = samples.filter(x => x.model === model).slice(-n)
  const keep = Math.max(3, Math.ceil(pts.length / 2))
  while (pts.length >= keep) {
    const r = solve(pts)
    if (!r) return undefined
    const errs = pts.map(p => Math.abs(predict(r, p) - p.usd) / p.usd)
    const worst = errs.indexOf(Math.max(...errs))
    if (errs[worst]! <= FIT_TOLERANCE) return r.read > 0 && r.read < r.inOut && r.write >= r.inOut ? r : undefined
    pts = pts.filter((_, i) => i !== worst)
  }
  return undefined
}

export function price(r: Rates, c: CtxCounts): number {
  return ((c.input + OUTPUT_RATIO * c.output) * r.inOut + c.read * r.read + c.write * r.write) / M
}

// What the subagents cost: the turn's dollars less what its main-loop counts explain
export function subUsd(t: CtxTurn, r: Rates | undefined): number | undefined {
  return r ? Math.max(0, t.usd - price(r, t.main)) : undefined
}

// Re-reading `tokens` from the cache once
export const carry = (tokens: number, r: Rates) => (tokens * r.read) / M
// Writing `tokens` into the cache afresh
export const rewrite = (tokens: number, r: Rates) => (tokens * r.write) / M

// Re-reading a window that grows `perTurn` a turn, `rpt` times a turn, for `turns` turns
export function untilCompact(tokens: number, perTurn: number, turns: number, rpt: number, r: Rates): number {
  return ((turns * rpt * r.read) / M) * (tokens + (perTurn * (turns + 1)) / 2)
}

// Compacting now: what each later request saves, what the compaction costs
// once (the summarizer reading the window and writing the summary, then the
// smaller window cached afresh), and after how many requests it pays back
export function compactPlan(tokens: number, after: number, r: Rates, summary: number) {
  const saving = ((tokens - after) * r.read) / M
  if (saving <= 0) return undefined
  const once = (tokens * r.read + summary * OUTPUT_RATIO * r.inOut + after * r.write) / M
  return { saving, once, payback: Math.ceil(once / saving) }
}

// A server's schemas, re-read on every request and rewritten on every miss, over the sessions that logged both
export function idleCost(tokens: number, sessions: readonly { requests?: number; misses?: number }[], r: Rates) {
  const known = sessions.filter(x => x.requests !== undefined)
  if (known.length === 0) return undefined
  const total = known.reduce((sum, x) => sum + (tokens * ((x.requests ?? 0) * r.read + (x.misses ?? 0) * r.write)) / M, 0)
  return { total, perSession: total / known.length, n: known.length }
}

// How long the cache lives, as this session has seen it: a hit after more
// than five idle minutes means the hour-long cache; a miss after a long gap,
// the five-minute one. Nothing seen, nothing said
export function ttlMs(s: CtxSpend): number | undefined {
  if (s.maxHitGap > FIVE_MIN * 1.1) return HOUR
  if (s.minMissGap !== undefined) return s.minMissGap < HOUR ? FIVE_MIN : HOUR
  return undefined
}

// "$0.007", "$1.84", "$12.3", "$140": a small window's per-request cost needs the third decimal
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0'
  if (n < 0.001) return '<$0.001'
  if (n < 0.01) return '$' + n.toFixed(3)
  if (n < 10) return '$' + n.toFixed(2)
  if (n < 100) return '$' + n.toFixed(1)
  return '$' + Math.round(n).toLocaleString('en-US')
}

// "7m", "1h 4m"
export function fmtIdle(ms: number): string {
  const m = Math.floor(ms / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export type Piece = { text: string; tone: 'plain' | 'dim' | 'sub' | 'warning' | 'error' }

// The band's last-turn suffix: the dollars always, then each piece only when
// it says something, dropped from the right as the band narrows
export function bandSuffix(t: CtxTurn, cols: number, o: { median?: number; subUsd?: number }): Piece[] {
  const hot = o.median !== undefined && o.median > 0 && t.usd > 3 * o.median
  const pieces: Piece[] = [{ text: '+' + fmtUsd(t.usd), tone: hot ? 'error' : 'plain' }]
  if (cols >= 120) {
    pieces.push({ text: `·${t.requests}r`, tone: 'dim' })
    if (t.subRuns > 0) pieces.push({ text: '·⑂' + (o.subUsd !== undefined ? '~' + fmtUsd(o.subUsd) : ''), tone: 'sub' })
  }
  // a cold start or a compaction writes the prompt afresh by nature: nothing out of the ordinary
  const hit = t.cold || t.compacted ? undefined : hitRate(t.main)
  if (hit !== undefined && hit < 0.9 && cols >= 100) {
    const pct = Math.round(hit * 100)
    pieces.push({ text: cols >= 120 ? `·●${pct}% hit` : `·●${pct}%`, tone: hit < 0.5 ? 'error' : 'warning' })
  }
  return pieces
}

// "last turn +$1.84 (6 requests · 1 subagent ~$0.31 · cache 98% hit)"
export function turnLine(t: CtxTurn, sub: number | undefined): string {
  const parts = [`${t.requests} ${t.requests === 1 ? 'request' : 'requests'}`]
  if (t.subRuns > 0) parts.push(`${t.subRuns} ${t.subRuns === 1 ? 'subagent' : 'subagents'}` + (sub !== undefined ? ` ~${fmtUsd(sub)}` : ''))
  const hit = hitRate(t.main)
  if (hit !== undefined) parts.push(`cache ${Math.round(hit * 100)}% hit`)
  return `last turn +${fmtUsd(t.usd)} (${parts.join(' · ')})`
}

// "session $14.20 · last turn was 13% of it": the total is the denominator for
// the turn's dollars, not a billing figure
export function sessionLine(total: number, last: number | undefined): string | undefined {
  const p = sessionParts(total, last)
  return p && `session ${p.amount}${p.tail}`
}

// The same line in two parts, so the pane can pick the dollars out
export function sessionParts(total: number, last: number | undefined): { amount: string; tail: string } | undefined {
  if (!Number.isFinite(total) || total <= 0) return undefined
  let tail = ''
  if (last !== undefined && last > 0) {
    const share = Math.min(100, Math.round((last / total) * 100))
    tail = ` · last turn was ${share < 1 ? '<1' : share}% of it`
  }
  return { amount: fmtUsd(total), tail }
}

// "carrying ~$0.08/request · ~$0.49/turn · ~$58.5 until auto-compact"
export function carryLine(tokens: number, r: Rates, rpt: number | undefined, pace: { perTurn?: number; turnsLeft?: number }): string {
  const per = carry(tokens, r)
  const parts = [`carrying ~${fmtUsd(per)}/request`]
  if (rpt) parts.push(`~${fmtUsd(per * rpt)}/turn`)
  if (rpt && pace.turnsLeft !== undefined) parts.push(`~${fmtUsd(untilCompact(tokens, pace.perTurn ?? 0, pace.turnsLeft, rpt, r))} until auto-compact`)
  return parts.join(' · ')
}

// "● cache miss: a request wrote 412k fresh · ~$3.30"
export function missLine(t: CtxTurn, r: Rates | undefined): string {
  return `● cache miss: a request wrote ${fmtTokens(t.missTokens)} fresh` + (r ? ` · ~${fmtUsd(rewrite(t.missTokens, r))}` : '')
}
