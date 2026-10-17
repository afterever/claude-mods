// The terminal look's colours. The four palettes below are COPIED from agent-pulse/hooks/palette.ts
// (each mod is installed alone, so there is no import across mods): keep the values in step with
// Agent-Pulse. palette.test.ts pins a few, so a drift is a deliberate edit. Only the phases this mod
// paints with are copied: idle, tool, agent, approval.

/** How much the terminal look moves: `userConfig.animation`. */
export type Level = 'off' | 'subtle' | 'full'

export type PaletteName = 'ember' | 'claude' | 'neon' | 'mono'

type Phase = 'idle' | 'tool' | 'agent' | 'approval'
type Outcome = 'ok' | 'error' | 'denied' | 'interrupted'

/**
 * `phase` and `outcome` are what `Text` takes, theme keys where one means the same, so they follow the
 * person's theme; `hex` and `glow` are the same colours as hex strings, for what mixes. `glow` is a
 * phase's second stop and equals `hex` in a flat palette.
 */
export type Palette = {
  phase: Record<Phase, string>
  hex: Record<Phase, string>
  glow: Record<Phase, string>
  outcome: Record<Outcome, string>
  sparkle: readonly string[]
  /** Amber, orange, red. */
  heat: readonly [string, string, string]
}

const CLAUDE_HEX: Record<Phase, string> = { idle: '#8a8a8a', tool: '#d97757', agent: '#2ec4b6', approval: '#ffc107' }
const EMBER_HEX: Record<Phase, string> = { idle: '#857a74', tool: '#d97757', agent: '#8cc7b5', approval: '#ffcf5c' }
const EMBER_GLOW: Record<Phase, string> = { idle: '#9a8f88', tool: '#f3a97c', agent: '#b6d99a', approval: '#ffb347' }
const NEON_HEX: Record<Phase, string> = { idle: '#5b6785', tool: '#22e5f0', agent: '#4ade80', approval: '#ffd166' }
const NEON_GLOW: Record<Phase, string> = { idle: '#6f7a99', tool: '#6ef0c8', agent: '#bef264', approval: '#ff9f6e' }
const MONO_HEX: Record<Phase, string> = { idle: '#7a7a7a', tool: '#d0d0d0', agent: '#d0d0d0', approval: '#ffc107' }

const OUTCOME_THEME: Record<Outcome, string> = { ok: 'success', error: 'error', denied: 'warning', interrupted: 'inactive' }
const EMBER_OUTCOME: Record<Outcome, string> = { ok: '#8fd694', error: '#ff6b6b', denied: '#ffcf5c', interrupted: '#857a74' }
const NEON_OUTCOME: Record<Outcome, string> = { ok: '#4ade80', error: '#ff5c7a', denied: '#ffd166', interrupted: '#6f7a99' }

const SHIMMER_STEPS = 12

const PALETTES: Record<PaletteName, Palette> = {
  ember: {
    phase: EMBER_HEX,
    hex: EMBER_HEX,
    glow: EMBER_GLOW,
    outcome: EMBER_OUTCOME,
    sparkle: ['#d97757', '#e8957a', '#f3a97c', '#f6c177', '#ffe3b0', '#f6c177', '#f3a97c', '#e8957a'],
    heat: ['#f6d36b', '#ff9a4d', '#ff5c5c'],
  },
  claude: {
    phase: { idle: 'inactive', tool: 'claude', agent: CLAUDE_HEX.agent, approval: 'warning' },
    hex: CLAUDE_HEX,
    glow: CLAUDE_HEX,
    outcome: OUTCOME_THEME,
    sparkle: ['#d97757', '#e48a66', '#f0a47f', '#fbc8a8', '#ffe6d5', '#fbc8a8', '#f0a47f', '#e48a66'],
    heat: ['#e0af68', '#ff9e64', 'error'],
  },
  neon: {
    phase: NEON_HEX,
    hex: NEON_HEX,
    glow: NEON_GLOW,
    outcome: NEON_OUTCOME,
    sparkle: ['#22e5f0', '#5eead4', '#7dd3fc', '#b39dff', '#ff8ad8', '#c4a1ff', '#7aa2ff', '#38bdf8'],
    heat: ['#ffd166', '#ff9f6e', '#ff5c7a'],
  },
  mono: {
    phase: { idle: 'inactive', tool: 'text', agent: 'text', approval: 'warning' },
    hex: MONO_HEX,
    glow: MONO_HEX,
    outcome: OUTCOME_THEME,
    sparkle: ['#6e6e6e', '#8a8a8a', '#a8a8a8', '#c8c8c8', '#e8e8e8', '#c8c8c8', '#a8a8a8', '#8a8a8a'],
    heat: ['warning', 'warning', 'error'],
  },
}

export const PALETTE_NAMES: readonly PaletteName[] = ['ember', 'claude', 'neon', 'mono']

export const paletteOf = (name: unknown): Palette =>
  PALETTES[name === 'claude' || name === 'neon' || name === 'mono' ? name : 'ember']

export const levelOf = (value: unknown): Level => (value === 'off' || value === 'full' ? value : 'subtle')

/** Mixes two hex colours, `t` 0 being `a` and 1 being `b`. */
export const mix = (a: string, b: string, t: number): string => {
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [from, to] = [channels(a), channels(b)]
  const k = Math.min(1, Math.max(0, t))
  return `#${from.map((c, i) => Math.round(c + ((to[i] ?? c) - c) * k).toString(16).padStart(2, '0')).join('')}`
}

/** A phase's colour `t` of the way from its core to its glow. A flat palette keeps its own colour, which may be a theme key. */
export const shadeOf = (palette: Palette, phase: Phase, t: number): string => {
  const core = palette.hex[phase]
  return core === palette.glow[phase] ? palette.phase[phase] : mix(core, palette.glow[phase], t)
}

/** A cycle of colours, core to glow and back, or the one colour of a flat palette. */
export const shimmerOf = (palette: Palette, phase: Phase): string[] =>
  palette.hex[phase] === palette.glow[phase]
    ? [palette.phase[phase]]
    : Array.from({ length: SHIMMER_STEPS }, (_, i) => shadeOf(palette, phase, (1 - Math.cos((i / SHIMMER_STEPS) * 2 * Math.PI)) / 2))

/** The rows this mod follows in /config; the keys are Agent-Pulse's own userConfig fields. */
export const FOLLOW_KEYS = { palette: 'agent-pulse.palette', animation: 'agent-pulse.animation' } as const

export type Look = { palette: PaletteName; level: Level }

/**
 * The look to draw with. `options`: the userConfig values ('follow' or explicit); `rows`: `$.config.list()`.
 * 'follow' takes Agent-Pulse's own value, or ember / subtle without it.
 */
export const resolveLook = (options: { palette?: unknown; animation?: unknown } | undefined, rows: unknown): Look => {
  const o = options ?? {}
  const list = Array.isArray(rows) ? (rows as { key?: unknown; value?: unknown }[]) : []
  const fromRow = (key: string): unknown => list.find(r => r && r.key === key)?.value
  const palette = o.palette && o.palette !== 'follow' ? o.palette : fromRow(FOLLOW_KEYS.palette)
  const animation = o.animation && o.animation !== 'follow' ? o.animation : fromRow(FOLLOW_KEYS.animation)
  return { palette: PALETTE_NAMES.find(n => n === palette) ?? 'ember', level: levelOf(animation) }
}
