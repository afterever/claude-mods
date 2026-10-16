/**
 * What the box says Claude is doing: `idle` between turns, a model phase
 * (`requesting`, `thinking`, `writing`, `composing`), a tool phase (`tool`,
 * `agent`, `approval`, `question`), or `compacting`.
 */
export type ActivityPhase =
  | 'idle'
  | 'requesting'
  | 'thinking'
  | 'writing'
  | 'composing'
  | 'tool'
  | 'agent'
  | 'approval'
  | 'question'
  | 'compacting'

/** The box's headline: the phase, its words, and when it began. */
export type ActivityNow = {
  phase: ActivityPhase
  label: string
  sinceMs: number
  /** The tool at work or being written, for its glyph. */
  tool?: string
  /** A one-cell meter of the reply's words or the call's size. */
  meter?: string
}

/**
 * The phases of a turn in order, for the timeline strip: the closed ones
 * with how long each took, and the one running since `open.sinceMs`.
 */
export type ActivityTimeline = {
  segments: readonly { phase: ActivityPhase; ms: number }[]
  open: { phase: ActivityPhase; sinceMs: number } | null
}

/**
 * The last moment worth a flourish: a call that ended (`flash`) or a turn
 * that did (`done`). `id` counts up, so each plays once.
 */
export type ActivityBeat = {
  id: number
  kind: 'flash' | 'done'
  outcome: ActivityOutcome
  atMs: number
}

/**
 * A subagent at work: what it was asked to do, its latest action, and when
 * it started.
 */
export type ActivityAgent = {
  name: string
  label: string
  sinceMs: number
}

export type ActivityOutcome = 'ok' | 'error' | 'denied' | 'interrupted'

/**
 * One row of the expanded box: a prompt that started a turn, a stretch of
 * thinking, a reply, a tool call, a compaction, or how a turn ended.
 */
export type ActivityEntry = {
  kind: 'turn' | 'thought' | 'reply' | 'tool' | 'compact' | 'end'
  label: string
  durationMs: number | null
  outcome: ActivityOutcome
  /** A tool call's tool, for its glyph. */
  tool?: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-pulse': {
      now: ActivityNow
      history: readonly ActivityEntry[]
      agents: readonly ActivityAgent[]
      isExpanded: boolean
      timeline: ActivityTimeline
      beat: ActivityBeat | null
    }
  }
}
