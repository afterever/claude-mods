export type CtxRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

/** One MCP server: its schemas in the window, and those loaded on demand. */
export type CtxServer = { name: string; tokens: number; count: number; deferredTokens: number; deferredCount: number }
export type CtxMemoryFile = { path: string; type: string; tokens: number }
export type CtxSkill = { name: string; tokens: number }
export type CtxAgent = { name: string; tokens: number }

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
    }
  }
}
