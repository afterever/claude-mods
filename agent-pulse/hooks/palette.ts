import type { ActivityOutcome, ActivityPhase } from '../types'

/** How much the box moves: `userConfig.animation`. */
export type Level = 'off' | 'subtle' | 'full'

export type PaletteName = 'claude' | 'neon' | 'mono'

/**
 * The colors one palette paints with. `phase` and `outcome` are what `Text`
 * and borders take, theme keys where one means the same, so they follow the
 * person's theme; `hex` is the same color as a hex string, for what mixes or
 * draws in SVG.
 */
export type Palette = {
  phase: Record<ActivityPhase, string>
  hex: Record<ActivityPhase, string>
  outcome: Record<ActivityOutcome, string>
  outcomeHex: Record<ActivityOutcome, string>
  /** The "Claude" word, and the colors its shimmer sweeps through. */
  brand: string
  shimmer: readonly string[]
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

const NEON_HEX: Record<ActivityPhase, string> = {
  idle: '#6c6f93',
  requesting: '#00e5ff',
  thinking: '#ff2bd6',
  writing: '#39ff14',
  composing: '#7c4dff',
  tool: '#00e5ff',
  agent: '#00ffa3',
  approval: '#ffe600',
  question: '#ffe600',
  compacting: '#7c4dff',
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

const PALETTES: Record<PaletteName, Palette> = {
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
    outcome: OUTCOME_THEME,
    outcomeHex: OUTCOME_HEX,
    brand: 'claude',
    shimmer: ['#d97757', '#e48a66', '#f0a47f', '#fbc8a8', '#ffe6d5', '#fbc8a8', '#f0a47f', '#e48a66'],
    heat: ['#e0af68', '#ff9e64', 'error'],
    agents: ['#2ec4b6', '#f4a261', '#a78bfa', '#60a5fa', '#f472b6', '#84cc16'],
  },
  neon: {
    phase: NEON_HEX,
    hex: NEON_HEX,
    outcome: { ok: '#39ff14', error: '#ff1744', denied: '#ffe600', interrupted: '#6c6f93' },
    outcomeHex: { ok: '#39ff14', error: '#ff1744', denied: '#ffe600', interrupted: '#6c6f93' },
    brand: '#ff2bd6',
    shimmer: ['#ff2bd6', '#c03bff', '#7c4dff', '#00e5ff', '#00ffa3', '#39ff14', '#ffe600', '#ff8c00'],
    heat: ['#ffe600', '#ff8c00', '#ff1744'],
    agents: ['#00e5ff', '#ff2bd6', '#39ff14', '#ffe600', '#7c4dff', '#ff8c00'],
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
    outcome: OUTCOME_THEME,
    outcomeHex: OUTCOME_HEX,
    brand: 'text',
    shimmer: ['#6e6e6e', '#8a8a8a', '#a8a8a8', '#c8c8c8', '#e8e8e8', '#c8c8c8', '#a8a8a8', '#8a8a8a'],
    heat: ['warning', 'warning', 'error'],
    agents: ['#d0d0d0', '#a8a8a8', '#e8e8e8', '#8a8a8a'],
  },
}

export function paletteOf(name: unknown): Palette {
  return PALETTES[name === 'neon' || name === 'mono' ? name : 'claude']
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
