import type { CtxLimit } from '../types'
import { fmtUsd } from './cost'

// The plan's rate-limit windows as the band draws them: the HUD's Patch 3
// (percent used, time left, how far ahead of or behind an even spend), in the
// HUD's rounding and colors. Pure: no engine in here

export const FIVE_HOUR_MS = 5 * 3_600_000
export const SEVEN_DAY_MS = 7 * 86_400_000

// The windows ctx paces, in the order they are drawn
const WINDOWS = [
  ['five_hour', FIVE_HOUR_MS],
  ['seven_day', SEVEN_DAY_MS],
] as const

export type Limit = CtxLimit

export type PaceWindow = {
  kind: (typeof WINDOWS)[number][0]
  /** Percent used, whole. */
  percent: number
  /** Time to the reset; absent when the reset is unknown or past. */
  left?: string
  /** Percent used minus the percent of the window gone, whole. */
  delta?: number
}

export type Tone = 'dim' | 'success' | 'warning' | 'error'
export type PacePiece = { text: string; tone: Tone }

/** How much of the pace fits: all of it, no countdown, the deltas alone, nothing. */
export type PaceStep = 'full' | 'short' | 'delta' | 'none'

// "45m", "3h 40m", "4d 16h": minutes rounded up, as the HUD prints them
export function duration(ms: number): string {
  const total = Math.ceil(ms / 60_000)
  if (total < 60) return `${total}m`
  const hours = Math.floor(total / 60)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return hours % 24 > 0 ? `${days}d ${hours % 24}h` : `${days}d`
  }
  const mins = total % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// The share of the window gone, whole and held to 0-100 (rounded before the
// difference is taken, as the HUD does)
function gone(resetsAt: number, windowMs: number, now: number): number {
  return Math.max(0, Math.min(100, Math.round(((now - (resetsAt - windowMs)) / windowMs) * 100)))
}

export function paceWindows(limits: readonly Limit[], now: number): PaceWindow[] {
  const out: PaceWindow[] = []
  for (const [kind, windowMs] of WINDOWS) {
    const l = limits.find(x => x.kind === kind)
    if (!l) continue
    const percent = Math.round(l.percentUsed)
    const resetsAt = l.resetsAt ? Date.parse(l.resetsAt) : NaN
    const remaining = resetsAt - now
    if (!(remaining > 0)) {
      out.push({ kind, percent })
      continue
    }
    out.push({ kind, percent, left: duration(remaining), delta: Math.round(percent - gone(resetsAt, windowMs, now)) })
  }
  return out
}

// The delta by its value: under an even spend green, a little over yellow, well over red
export function deltaTone(delta: number): Tone {
  return delta < 0 ? 'success' : delta <= 15 ? 'warning' : 'error'
}

// The percent by how much of the window is used
export function percentTone(percent: number): Tone {
  return percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'success'
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}%`

/** `🐾 25% (3h 40m/-2%) · 22% (4d 16h/-11%)`, drawn narrower as the step falls. */
export function paceLine(windows: readonly PaceWindow[], step: PaceStep): PacePiece[] {
  if (step === 'none' || windows.length === 0) return []
  const out: PacePiece[] = [{ text: '🐾 ', tone: 'dim' }]
  windows.forEach((w, i) => {
    if (i > 0) out.push({ text: ' · ', tone: 'dim' })
    const hasDelta = w.delta !== undefined && w.left !== undefined
    if (step === 'delta' && hasDelta) {
      out.push({ text: signed(w.delta!), tone: deltaTone(w.delta!) })
      return
    }
    out.push({ text: `${w.percent}%`, tone: percentTone(w.percent) })
    if (!hasDelta) return
    out.push({ text: step === 'full' ? ` (${w.left}/` : ' (', tone: 'dim' })
    out.push({ text: signed(w.delta!), tone: deltaTone(w.delta!) })
    out.push({ text: ')', tone: 'dim' })
  })
  return out
}

// How much of the pace the band has room for. The desktop passes the band no
// width (it would read as 80) and has the room
export function paceStep(cols: number | undefined, surface: string): PaceStep {
  if (surface === 'desktop') return 'full'
  const c = cols ?? 80
  return c >= 130 ? 'full' : c >= 100 ? 'short' : c >= 80 ? 'delta' : 'none'
}

/**
 * What the band says about the budget being spent: a subscription's windows
 * paced; failing those a gateway's spend limit as a percent (no window length
 * is given, so no pace); failing that the session total, where the ledger has
 * one and dollars are on. Nothing otherwise.
 */
export function bandPace(o: { limits: readonly Limit[]; usd: number | undefined; costOn: boolean; step: PaceStep; now: number }): PacePiece[] {
  if (o.step === 'none') return []
  const windows = paceWindows(o.limits, o.now)
  if (windows.length > 0) return paceLine(windows, o.step)
  const label = (text: string): PacePiece[] => (o.step === 'full' ? [{ text, tone: 'dim' }] : [])
  const spend = o.limits.find(l => l.kind === 'spend_limit')
  if (spend) {
    const percent = Math.round(spend.percentUsed)
    return [...label('spend '), { text: `${percent}%`, tone: percentTone(percent) }]
  }
  if (!o.costOn || o.usd === undefined || !(o.usd > 0)) return []
  return [...label('session '), { text: fmtUsd(o.usd), tone: 'success' }]
}
