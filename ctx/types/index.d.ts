export type CtxRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

export type CtxServer = { name: string; tokens: number; count: number }
export type CtxMemoryFile = { path: string; type: string; tokens: number }
export type CtxSkill = { name: string; tokens: number }

/** A slim copy of /context's breakdown: no 200-square grid, just what is drawn. */
export type CtxSnapshot = {
  rows: CtxRow[]
  total: number
  max: number
  percent: number
  detail: 'summary' | 'full'
  at: number
  mcpTokens: number
  mcpCount: number
  servers: CtxServer[]
  memory: CtxMemoryFile[]
  skillCount: number
  skillTokens: number
  skills: CtxSkill[]
}

declare module 'claude-code' {
  interface PluginState {
    ctx: {
      snap: CtxSnapshot | null
      isVisible: boolean
      opened: string[]
    }
  }
}
