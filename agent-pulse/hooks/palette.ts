import type { ActivityOutcome, ActivityPhase } from '../types'

/** How much the box moves: `userConfig.animation`. */
export type Level = 'off' | 'subtle' | 'full'

export type PaletteName = 'ember' | 'claude' | 'neon' | 'mono'

/**
 * The colors one palette paints with. `phase` and `outcome` are what `Text`
 * and borders take, theme keys where one means the same, so they follow the
 * person's theme; `hex` is the same color as a hex string, for what mixes or
 * draws in SVG.
 */
export type Palette = {
  phase: Record<ActivityPhase, string>
  hex: Record<ActivityPhase, string>
  /**
   * Each phase's second stop, hex: what its color shades toward across the
   * strip, cycles toward on the spinner and breathes from on the border. The
   * same as `hex` in a flat palette.
   */
  glow: Record<ActivityPhase, string>
  outcome: Record<ActivityOutcome, string>
  outcomeHex: Record<ActivityOutcome, string>
  /** The colors the turn-end sparkle cycles through. */
  sparkle: readonly string[]
  /** Amber, orange, red: a step that runs past 30 s, 2 min, 5 min. */
  heat: readonly [string, string, string]
  /** One color per subagent, picked by its name. */
  agents: readonly string[]
}

const CLAUDE_HEX: Record<ActivityPhase, string> = {
  idle: '#8a8a8a',
  requesting: '#8fa8f8',
  thinking: '#c084fc',
  writing: '#4eba65',
  composing: '#47a8e5',
  tool: '#d97757',
  agent: '#2ec4b6',
  approval: '#ffc107',
  question: '#ffc107',
  compacting: '#48968c',
}

const EMBER_HEX: Record<ActivityPhase, string> = {
  idle: '#857a74',
  requesting: '#f2b8a0',
  thinking: '#c6a4ec',
  writing: '#f6c177',
  composing: '#ee9aa4',
  tool: '#d97757',
  agent: '#8cc7b5',
  approval: '#ffcf5c',
  question: '#ffcf5c',
  compacting: '#9fa8e0',
}

const EMBER_GLOW: Record<ActivityPhase, string> = {
  idle: '#9a8f88',
  requesting: '#e8957a',
  thinking: '#e7a3c8',
  writing: '#f2a98a',
  composing: '#d98fbf',
  tool: '#f3a97c',
  agent: '#b6d99a',
  approval: '#ffb347',
  question: '#ffb347',
  compacting: '#c79bd9',
}

/** Bioluminescent: cool sea colors, with warm amber kept for what needs you. */
const NEON_HEX: Record<ActivityPhase, string> = {
  idle: '#5b6785',
  requesting: '#7aa2ff',
  thinking: '#c4a1ff',
  writing: '#5eead4',
  composing: '#38bdf8',
  tool: '#22e5f0',
  agent: '#4ade80',
  approval: '#ffd166',
  question: '#ffd166',
  compacting: '#8b93f8',
}

const NEON_GLOW: Record<ActivityPhase, string> = {
  idle: '#6f7a99',
  requesting: '#b39dff',
  thinking: '#ff8ad8',
  writing: '#7dd3fc',
  composing: '#818cf8',
  tool: '#6ef0c8',
  agent: '#bef264',
  approval: '#ff9f6e',
  question: '#ff9f6e',
  compacting: '#c79bf2',
}

const MONO_HEX: Record<ActivityPhase, string> = {
  idle: '#7a7a7a',
  requesting: '#b8b8b8',
  thinking: '#b8b8b8',
  writing: '#b8b8b8',
  composing: '#b8b8b8',
  tool: '#d0d0d0',
  agent: '#d0d0d0',
  approval: '#ffc107',
  question: '#ffc107',
  compacting: '#b8b8b8',
}

const OUTCOME_HEX: Record<ActivityOutcome, string> = {
  ok: '#4eba65',
  error: '#ff6b80',
  denied: '#ffc107',
  interrupted: '#8a8a8a',
}

const OUTCOME_THEME: Record<ActivityOutcome, string> = {
  ok: 'success',
  error: 'error',
  denied: 'warning',
  interrupted: 'inactive',
}

const EMBER_OUTCOME: Record<ActivityOutcome, string> = { ok: '#8fd694', error: '#ff6b6b', denied: '#ffcf5c', interrupted: '#857a74' }
const NEON_OUTCOME: Record<ActivityOutcome, string> = { ok: '#4ade80', error: '#ff5c7a', denied: '#ffd166', interrupted: '#6f7a99' }

/** Steps on the spinner's color cycle, core to glow and back. */
const SHIMMER_STEPS = 12

const PALETTES: Record<PaletteName, Palette> = {
  ember: {
    phase: EMBER_HEX,
    hex: EMBER_HEX,
    glow: EMBER_GLOW,
    outcome: EMBER_OUTCOME,
    outcomeHex: EMBER_OUTCOME,
    sparkle: ['#d97757', '#e8957a', '#f3a97c', '#f6c177', '#ffe3b0', '#f6c177', '#f3a97c', '#e8957a'],
    heat: ['#f6d36b', '#ff9a4d', '#ff5c5c'],
    agents: ['#8cc7b5', '#f2b8a0', '#c6a4ec', '#f6c177', '#ee9aa4', '#9fc7e8'],
  },
  claude: {
    phase: {
      idle: 'inactive',
      requesting: 'suggestion',
      thinking: CLAUDE_HEX.thinking,
      writing: 'success',
      composing: 'ide',
      tool: 'claude',
      agent: CLAUDE_HEX.agent,
      approval: 'warning',
      question: 'warning',
      compacting: 'planMode',
    },
    hex: CLAUDE_HEX,
    glow: CLAUDE_HEX,
    outcome: OUTCOME_THEME,
    outcomeHex: OUTCOME_HEX,
    sparkle: ['#d97757', '#e48a66', '#f0a47f', '#fbc8a8', '#ffe6d5', '#fbc8a8', '#f0a47f', '#e48a66'],
    heat: ['#e0af68', '#ff9e64', 'error'],
    agents: ['#2ec4b6', '#f4a261', '#a78bfa', '#60a5fa', '#f472b6', '#84cc16'],
  },
  neon: {
    phase: NEON_HEX,
    hex: NEON_HEX,
    glow: NEON_GLOW,
    outcome: NEON_OUTCOME,
    outcomeHex: NEON_OUTCOME,
    sparkle: ['#22e5f0', '#5eead4', '#7dd3fc', '#b39dff', '#ff8ad8', '#c4a1ff', '#7aa2ff', '#38bdf8'],
    heat: ['#ffd166', '#ff9f6e', '#ff5c7a'],
    agents: ['#5eead4', '#ff8ad8', '#bef264', '#ffd166', '#b39dff', '#7dd3fc'],
  },
  mono: {
    phase: {
      idle: 'inactive',
      requesting: 'text',
      thinking: 'text',
      writing: 'text',
      composing: 'text',
      tool: 'text',
      agent: 'text',
      approval: 'warning',
      question: 'warning',
      compacting: 'text',
    },
    hex: MONO_HEX,
    glow: MONO_HEX,
    outcome: OUTCOME_THEME,
    outcomeHex: OUTCOME_HEX,
    sparkle: ['#6e6e6e', '#8a8a8a', '#a8a8a8', '#c8c8c8', '#e8e8e8', '#c8c8c8', '#a8a8a8', '#8a8a8a'],
    heat: ['warning', 'warning', 'error'],
    agents: ['#d0d0d0', '#a8a8a8', '#e8e8e8', '#8a8a8a'],
  },
}

export function paletteOf(name: unknown): Palette {
  return PALETTES[name === 'claude' || name === 'neon' || name === 'mono' ? name : 'ember']
}

/**
 * A phase's color `t` of the way from its core to its glow. A flat palette
 * keeps its own color, which may be a theme key.
 */
export function shadeOf(palette: Palette, phase: ActivityPhase, t: number): string {
  const core = palette.hex[phase]
  const glow = palette.glow[phase]

  return core === glow ? palette.phase[phase] : mix(core, glow, t)
}

/** The spinner's colors, one per frame: core to glow and back, or the one color of a flat palette. */
export function shimmerOf(palette: Palette, phase: ActivityPhase): string[] {
  if (palette.hex[phase] === palette.glow[phase]) {
    return [palette.phase[phase]]
  }

  return Array.from({ length: SHIMMER_STEPS }, (_, i) => shadeOf(palette, phase, (1 - Math.cos((i / SHIMMER_STEPS) * 2 * Math.PI)) / 2))
}

export function levelOf(value: unknown): Level {
  return value === 'off' || value === 'full' ? value : 'subtle'
}

/**
 * The color a step's timer takes as it runs long, or `undefined` while it is
 * young (drawn dim).
 */
export function heatOf(palette: Palette, ms: number): string | undefined {
  return ms >= 300_000 ? palette.heat[2] : ms >= 120_000 ? palette.heat[1] : ms >= 30_000 ? palette.heat[0] : undefined
}

/** One color per agent, the same each time its name comes up. */
export function agentColorOf(palette: Palette, name: string): string {
  let hash = 0

  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }

  return palette.agents[Math.abs(hash) % palette.agents.length] ?? palette.hex.agent
}

/**
 * Mixes two hex colors, `t` 0 being `a` and 1 being `b`.
 */
export function mix(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [from, to] = [channels(a), channels(b)]
  const k = Math.min(1, Math.max(0, t))

  return `#${from.map((c, i) => Math.round(c + ((to[i] ?? c) - c) * k).toString(16).padStart(2, '0')).join('')}`
}
