export type CtxRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

/** One MCP server: its schemas in the window, and those loaded on demand. */
export type CtxServer = {
  name: string
  /** The server as its tools' wire names spell it (`mcp__<key>__tool`). */
  key: string
  tokens: number
  count: number
  deferredTokens: number
  deferredCount: number
}
export type CtxMemoryFile = { path: string; type: string; tokens: number }
export type CtxSkill = { name: string; tokens: number }
export type CtxAgent = { name: string; tokens: number }

/** One heavy tool result in the main conversation. */
export type CtxEater = { tool: string; label: string; chars: number; turn: number }

/** Calls this session, by MCP server key, skill name and agent type. */
export type CtxUsage = {
  mcp: Record<string, number>
  skills: Record<string, number>
  agents: Record<string, number>
}

/**
 * A project's recent sessions: the MCP servers each had loaded, and the ones it called.
 * `requests` and `misses` (from 0.6.0) price each server's idle overhead; older lines lack them.
 */
export type CtxProjectLog = {
  sessions: { id: string; loaded: Record<string, number>; used: string[]; requests?: number; misses?: number }[]
}

/** Token counts as the API reports them, summed. */
export type CtxCounts = { input: number; output: number; read: number; write: number }

/** One main-loop turn's spend: the ledger's growth and the requests behind it. */
export type CtxTurn = {
  /** The session's cost ledger, in US dollars, when the turn began. */
  base: number
  /** What the ledger grew by since: real dollars, subagents included. */
  usd: number
  /** Main-loop model requests in the turn. */
  requests: number
  main: CtxCounts
  /** The API model id of the main loop's last response. */
  model: string
  /** More than one model answered the main loop. */
  mixed: boolean
  /** Subagents' requests, summed. */
  sub: CtxCounts
  subRuns: number
  /** The largest cache write of a main-loop request that missed the cache. */
  missTokens: number
  /**
   * The turn wrote its prompt afresh as a matter of course: the session's
   * first request, or the first after a compaction. No miss is shown for it.
   */
  cold: boolean
  /** A compaction ran during the turn. */
  compacted: boolean
  /** The turn's `turn.complete` came. */
  done: boolean
}

/** One clean turn, for learning the model's prices: tokens in millions, and the dollars they cost. */
export type CtxSample = { model: string; inOut: number; read: number; write: number; usd: number }

/** What the session has spent, turn by turn, and what that says about its cache. */
export type CtxSpend = {
  /** The cost ledger's latest figure; absent where the host keeps none. */
  ledger?: number
  /** The turn running, or the last one until the next begins. */
  cur?: CtxTurn
  /** The turn before `cur`. */
  last?: CtxTurn
  /** Finished turns' dollars, oldest first. */
  usds: number[]
  samples: CtxSample[]
  /** Main-loop requests and cache misses this session, and finished turns. */
  requests: number
  misses: number
  turns: number
  /** When the main loop's last request ended. */
  lastStepAt?: number
  /** The longest idle gap the cache survived, and the shortest (of 4+ minutes) it did not. */
  maxHitGap: number
  minMissGap?: number
  /** The last compaction: its size after, and what it cost. */
  compact?: { after?: number; usd?: number; summary?: number }
}

/** How close auto-compaction is. */
export type CtxWarn = 'none' | 'near' | 'imminent'

/** How a breakdown is counted: estimated locally, or with the token-count API. */
export type CtxDetail = 'summary' | 'full'

/** A slim copy of /context's breakdown: no 200-square grid, just what is drawn. */
export type CtxSnapshot = {
  rows: CtxRow[]
  total: number
  max: number
  percent: number
  detail: CtxDetail
  at: number
  model: string
  /** Tokens at which auto-compaction runs; absent when it is off. */
  compactAt?: number
  mcpTokens: number
  mcpCount: number
  mcpDeferredTokens: number
  mcpDeferredCount: number
  servers: CtxServer[]
  memory: CtxMemoryFile[]
  skillCount: number
  skillIncluded: number
  skillTokens: number
  /** Every skill listing, largest first; the pane shows the top few. */
  skills: CtxSkill[]
  agentTokens: number
  agents: CtxAgent[]
  commandCount: number
  commandIncluded: number
  commandTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    ctx: {
      snap: CtxSnapshot | null
      isVisible: boolean
      opened: string[]
      mode: CtxDetail
      stale: boolean
      tick: number
      /** The window's tokens after each turn, oldest first, as the API reported them. */
      history: number[]
      /** The heaviest tool results of the main conversation, heaviest first. */
      eaters: CtxEater[]
      /** Characters per token, learned from this session's turns. */
      cpt: number
      usage: CtxUsage
      /** This project's log as it stood when the session started. */
      project: CtxProjectLog | null
      /** Per `history` reading: whether a compaction came just before it. */
      compacted: boolean[]
      /** Files the session changed, newest last. */
      edited: string[]
      /** The person's latest prompts, newest last, clipped. */
      asks: string[]
      /** Whether every compaction gets the mod's keep instructions. */
      autokeep: boolean
      /** The highest warning given since the last compaction. */
      warned: CtxWarn
      /** What the session spent, per turn, from the engine's cost ledger. */
      spend: CtxSpend
      /** Whether dollar figures are shown. */
      costOn: boolean
    }
  }
}
