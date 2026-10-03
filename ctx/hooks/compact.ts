import type { CtxWarn } from '../types'
import { fmtTokens } from './fmt'

/** Marks instructions this mod wrote, so a compaction never gets them twice. */
export const KEEP_MARK = '[ctx keep]'

// Keeps the newest `limit` distinct items, newest last
export function addRecent(list: readonly string[], item: string, limit: number): string[] {
  return [...list.filter(x => x !== item), item].slice(-limit)
}

// A prompt as the summary should remember it: one line, at most `n` characters
export function clipAsk(text: string, n = 160): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

// What a compaction's summary should keep, from what the session did: the
// focus the person typed, the files being changed, the latest requests
export function keepInstructions(input: { focus?: string; edited: readonly string[]; asks: readonly string[] }): string {
  const lines = [`${KEEP_MARK} Besides the usual summary, preserve:`]
  const focus = input.focus?.trim()
  if (focus) lines.push(`- The focus going forward: ${focus}`)
  if (input.edited.length) lines.push(`- The files being worked on, with what was changed in each and why: ${input.edited.join(', ')}`)
  if (input.asks.length) {
    lines.push('- The latest requests, newest last, and where each one stands:')
    input.asks.forEach((a, i) => lines.push(`  ${i + 1}. "${a}"`))
  }
  if (lines.length === 1) lines.push('- The task in progress and the next step.')
  return lines.join('\n')
}

// Adds the mod's instructions after any the person or the engine gave
export function mergeInstructions(existing: string | undefined, keep: string): string {
  const given = existing?.trim()
  if (given?.includes(KEEP_MARK)) return given
  return given ? `${given}\n\n${keep}` : keep
}

// The pace counts only once this much of the threshold is filled: early on, one
// heavy turn sets the pace alone and would warn at a tenth full
const PACE_FLOOR = { near: 0.4, imminent: 0.6 }

// How close auto-compaction is: by the turns left at the session's pace once
// the window is well on its way, or by how much of the threshold is filled
export function warnLevel(tokens: number, compactAt: number | undefined, turnsLeft: number | undefined): CtxWarn {
  if (!compactAt || compactAt <= 0) return 'none'
  const filled = tokens / compactAt
  const within = (turns: number, floor: number) => turnsLeft !== undefined && turnsLeft <= turns && filled >= floor
  if (filled >= 0.95 || within(3, PACE_FLOOR.imminent)) return 'imminent'
  if (filled >= 0.85 || within(10, PACE_FLOOR.near)) return 'near'
  return 'none'
}

const RANK: Record<CtxWarn, number> = { none: 0, near: 1, imminent: 2 }

// A toast only as the level climbs: each step warns once, and a fall (a
// compaction) re-arms them
export function shouldWarn(was: CtxWarn, now: CtxWarn): boolean {
  return RANK[now] > RANK[was]
}

export function warnText(level: CtxWarn, tokens: number, compactAt: number, turnsLeft: number | undefined): string {
  const left = turnsLeft !== undefined ? `~${turnsLeft} ${turnsLeft === 1 ? 'turn' : 'turns'} left` : `${Math.round((tokens / compactAt) * 100)}% of the way`
  const head = level === 'imminent' ? 'Auto-compact is close' : 'Auto-compact is coming'
  return `${head}: ${left} (${fmtTokens(tokens)} / ${fmtTokens(compactAt)}). /ctx compact keeps what matters.`
}

// The band's badge: the turns left when the pace gives them, else the fill
export function warnBadge(tokens: number, compactAt: number, turnsLeft: number | undefined): string {
  return turnsLeft !== undefined ? `⚠ ~${turnsLeft} ${turnsLeft === 1 ? 'turn' : 'turns'}` : `⚠ ${Math.round((tokens / compactAt) * 100)}% to compact`
}
