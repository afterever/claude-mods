// Which costume a subagent's crab wears. The costume follows what the agent runs on, so
// every subagent gets a prop, with or without savvy-flow:
//
//   Fable (any effort), Opus at high or above   astronaut
//   Opus below high                             detective
//   Sonnet at high or above                     engineer
//   Sonnet below high                           chef
//   Haiku                                       racer
//   the Explore agent                           pirate
//   anything else                               a plain crab
//
// `high` and above is `high`, `xhigh` and `max`. An effort not known yet (a run's first
// request has not gone out) or a numeric budget counts as below high.

export type Costume = 'astronaut' | 'detective' | 'engineer' | 'chef' | 'racer' | 'pirate' | 'other'

export const COSTUMES: readonly Costume[] = ['astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate', 'other']

export const COSTUME_COLOR: Record<Costume, string> = {
  astronaut: '#7F77DD',
  detective: '#D85A30',
  engineer: '#BA7517',
  chef: '#378ADD',
  racer: '#1D9E75',
  pirate: '#888780',
  other: '#888780',
}

type Family = 'fable' | 'opus' | 'sonnet' | 'haiku'

/** `claude-sonnet-5-5`, `sonnet`, `claude-opus-5-5[1m]`: the family by substring; `inherit` and unknown ids are none. */
export const familyOf = (model: string | undefined): Family | undefined => {
  const m = (model ?? '').toLowerCase()
  if (/fable|mythos/.test(m)) return 'fable'
  if (/opus/.test(m)) return 'opus'
  if (/sonnet/.test(m)) return 'sonnet'
  if (/haiku/.test(m)) return 'haiku'
  return undefined
}

const HIGH = new Set(['high', 'xhigh', 'max'])

export const isHighEffort = (effort: unknown): boolean => typeof effort === 'string' && HIGH.has(effort.trim().toLowerCase())

const byFamily = (family: Family, effort: unknown): Costume => {
  if (family === 'fable') return 'astronaut'
  if (family === 'haiku') return 'racer'
  if (family === 'opus') return isHighEffort(effort) ? 'astronaut' : 'detective'
  return isHighEffort(effort) ? 'engineer' : 'chef'
}

/** `savvy-flow:savvy-careful` is `savvy-careful`; `general-purpose` is itself. */
export const bareType = (type: string): string => type.replace(/^[^:]*:/, '')

// savvy-flow's workers are a model and an effort each (its agents/*.md frontmatter).
// Kept for what has no model yet: a planned task named by tier, a `savvy-*` run before
// its first request. A run's own model and effort always decide first.
export const LEGACY_TIERS: Record<string, { model: string; effort: string }> = {
  fable: { model: 'fable', effort: 'high' },
  heavy: { model: 'opus', effort: 'xhigh' },
  careful: { model: 'opus', effort: 'high' },
  medium: { model: 'opus', effort: 'medium' },
  light: { model: 'opus', effort: 'low' },
}

const legacyOf = (name: string): { model: string; effort: string } | undefined =>
  Object.prototype.hasOwnProperty.call(LEGACY_TIERS, name) ? LEGACY_TIERS[name] : undefined

/** A run's costume: the Explore pirate, else its model and effort, else its savvy tier, else plain. */
export const costumeOf = (run: { type: string; model?: string; effort?: string }): Costume => {
  const bare = bareType(run.type)
  if (bare === 'Explore') return 'pirate'
  const family = familyOf(run.model)
  if (family) return byFamily(family, run.effort)
  const legacy = bare.startsWith('savvy-') ? legacyOf(bare.slice('savvy-'.length).toLowerCase()) : undefined
  const legacyFamily = legacy && familyOf(legacy.model)
  return legacy && legacyFamily ? byFamily(legacyFamily, legacy.effort) : 'other'
}

export type PlannedLike = { tier?: string; model?: string; effort?: string }

const isCostume = (name: string): name is Costume => (COSTUMES as readonly string[]).includes(name)

/** What a planned task will run on: its own model and effort, else its tier (a savvy tier or a costume name). */
export const plannedProfile = (p: PlannedLike): { model?: string; effort?: string } => {
  if (p.model && familyOf(p.model)) return { model: p.model, effort: p.effort }
  const legacy = legacyOf((p.tier ?? '').trim().toLowerCase())
  return legacy ? { ...legacy } : {}
}

export const plannedCostume = (p: PlannedLike): Costume => {
  const profile = plannedProfile(p)
  const family = familyOf(profile.model)
  if (family) return byFamily(family, profile.effort)
  const name = (p.tier ?? '').trim().toLowerCase()
  return isCostume(name) ? name : 'other'
}
