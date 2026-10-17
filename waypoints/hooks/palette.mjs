// Waypoints' colours. The four palettes below are COPIED from agent-pulse/hooks/palette.ts
// (each mod is installed alone, so there is no import across mods): keep the values in
// step with Agent-Pulse. palette.test.ts pins a few, so a drift is a deliberate edit.
// Only the phases Waypoints paints with are copied: idle, tool, agent, approval.

const CLAUDE_HEX = { idle: '#8a8a8a', tool: '#d97757', agent: '#2ec4b6', approval: '#ffc107' }
const EMBER_HEX = { idle: '#857a74', tool: '#d97757', agent: '#8cc7b5', approval: '#ffcf5c' }
const EMBER_GLOW = { idle: '#9a8f88', tool: '#f3a97c', agent: '#b6d99a', approval: '#ffb347' }
const NEON_HEX = { idle: '#5b6785', tool: '#22e5f0', agent: '#4ade80', approval: '#ffd166' }
const NEON_GLOW = { idle: '#6f7a99', tool: '#6ef0c8', agent: '#bef264', approval: '#ff9f6e' }
const MONO_HEX = { idle: '#7a7a7a', tool: '#d0d0d0', agent: '#d0d0d0', approval: '#ffc107' }

const OUTCOME_HEX = { ok: '#4eba65', error: '#ff6b80', denied: '#ffc107', interrupted: '#8a8a8a' }
const OUTCOME_THEME = { ok: 'success', error: 'error', denied: 'warning', interrupted: 'inactive' }
const EMBER_OUTCOME = { ok: '#8fd694', error: '#ff6b6b', denied: '#ffcf5c', interrupted: '#857a74' }
const NEON_OUTCOME = { ok: '#4ade80', error: '#ff5c7a', denied: '#ffd166', interrupted: '#6f7a99' }

const SHIMMER_STEPS = 12

// phase: what Text takes (a theme key where one means the same); hex/glow: the same colour as hex
const PALETTES = {
  ember: {
    phase: EMBER_HEX,
    hex: EMBER_HEX,
    glow: EMBER_GLOW,
    outcome: EMBER_OUTCOME,
    sparkle: ['#d97757', '#e8957a', '#f3a97c', '#f6c177', '#ffe3b0', '#f6c177', '#f3a97c', '#e8957a'],
    heat: ['#f6d36b', '#ff9a4d', '#ff5c5c'],
    agents: ['#8cc7b5', '#f2b8a0', '#c6a4ec', '#f6c177', '#ee9aa4', '#9fc7e8'],
  },
  claude: {
    phase: { idle: 'inactive', tool: 'claude', agent: CLAUDE_HEX.agent, approval: 'warning' },
    hex: CLAUDE_HEX,
    glow: CLAUDE_HEX,
    outcome: OUTCOME_THEME,
    sparkle: ['#d97757', '#e48a66', '#f0a47f', '#fbc8a8', '#ffe6d5', '#fbc8a8', '#f0a47f', '#e48a66'],
    heat: ['#e0af68', '#ff9e64', 'error'],
    agents: ['#2ec4b6', '#f4a261', '#a78bfa', '#60a5fa', '#f472b6', '#84cc16'],
  },
  neon: {
    phase: NEON_HEX,
    hex: NEON_HEX,
    glow: NEON_GLOW,
    outcome: NEON_OUTCOME,
    sparkle: ['#22e5f0', '#5eead4', '#7dd3fc', '#b39dff', '#ff8ad8', '#c4a1ff', '#7aa2ff', '#38bdf8'],
    heat: ['#ffd166', '#ff9f6e', '#ff5c7a'],
    agents: ['#5eead4', '#ff8ad8', '#bef264', '#ffd166', '#b39dff', '#7dd3fc'],
  },
  mono: {
    phase: { idle: 'inactive', tool: 'text', agent: 'text', approval: 'warning' },
    hex: MONO_HEX,
    glow: MONO_HEX,
    outcome: OUTCOME_THEME,
    sparkle: ['#6e6e6e', '#8a8a8a', '#a8a8a8', '#c8c8c8', '#e8e8e8', '#c8c8c8', '#a8a8a8', '#8a8a8a'],
    heat: ['warning', 'warning', 'error'],
    agents: ['#d0d0d0', '#a8a8a8', '#e8e8e8', '#8a8a8a'],
  },
}

export const PALETTE_NAMES = ['ember', 'claude', 'neon', 'mono']
export const LEVELS = ['off', 'subtle', 'full']

export function paletteOf(name) {
  return PALETTES[name === 'claude' || name === 'neon' || name === 'mono' ? name : 'ember']
}

export function levelOf(value) {
  return value === 'off' || value === 'full' ? value : 'subtle'
}

// Mixes two hex colours, t 0 being a and 1 being b
export function mix(a, b, t) {
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const from = channels(a)
  const to = channels(b)
  const k = Math.min(1, Math.max(0, t))
  return '#' + from.map((c, i) => Math.round(c + (to[i] - c) * k).toString(16).padStart(2, '0')).join('')
}

// A phase's colour t of the way from its core to its glow. A flat palette keeps its own
// colour, which may be a theme key.
export function shadeOf(palette, phase, t) {
  const core = palette.hex[phase]
  const glow = palette.glow[phase]
  return core === glow ? palette.phase[phase] : mix(core, glow, t)
}

// The spinner's colours, one per frame: core to glow and back, or the one colour of a flat palette
export function shimmerOf(palette, phase) {
  if (palette.hex[phase] === palette.glow[phase]) return [palette.phase[phase]]
  return Array.from({ length: SHIMMER_STEPS }, (_, i) => shadeOf(palette, phase, (1 - Math.cos((i / SHIMMER_STEPS) * 2 * Math.PI)) / 2))
}

// One colour per agent, the same each time its name comes up (and the same Agent-Pulse gives it)
export function agentColorOf(palette, name) {
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return palette.agents[Math.abs(hash) % palette.agents.length] || palette.hex.agent
}

// The roles Waypoints draws with, mapped onto the palette's phase colours so a palette
// means the same in both mods. `done(t)` shades along the route, t 0..1 (position / width).
export function rolesOf(name) {
  const p = paletteOf(name)
  return {
    name: PALETTE_NAMES.includes(name) ? name : 'ember',
    done: (t) => shadeOf(p, 'tool', t),
    active: shimmerOf(p, 'tool'),
    activeStill: p.phase.tool,
    pending: p.phase.idle,
    attention: p.phase.approval,
    ok: p.outcome.ok,
    sparkle: p.sparkle,
    heat: p.heat[0],
    agent: (by) => agentColorOf(p, by),
    // the SVG always takes hex, never a theme key
    hex: { done: p.hex.tool, glow: p.glow.tool, pending: p.hex.idle, ok: p.hex.tool, sparkle: p.sparkle },
  }
}

// The row Waypoints follows in /config; the key is confirmed live (see DESIGN.md)
export const FOLLOW_KEYS = { palette: 'agent-pulse.palette', animation: 'agent-pulse.animation' }

// The look to draw with. options: the userConfig values ('follow' or explicit); rows:
// $.config.list(). 'follow' takes Agent-Pulse's own value, or ember/subtle without it.
export function resolveLook(options, rows) {
  const o = options || {}
  const list = Array.isArray(rows) ? rows : []
  const fromRow = (key) => {
    const row = list.find((r) => r && r.key === key)
    return row ? row.value : undefined
  }
  const palette = o.palette && o.palette !== 'follow' ? o.palette : fromRow(FOLLOW_KEYS.palette)
  const animation = o.animation && o.animation !== 'follow' ? o.animation : fromRow(FOLLOW_KEYS.animation)
  const name = PALETTE_NAMES.includes(palette) ? palette : 'ember'
  return { palette: name, level: levelOf(animation) }
}
