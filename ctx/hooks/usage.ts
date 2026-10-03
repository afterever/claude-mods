import type { CtxEater, CtxProjectLog, CtxUsage } from '../types'
import { shortPath } from './fmt'

// What one tool call was about, in a few words: the file, the command, the
// pattern; the tool's name alone when nothing says more
export function toolLabel(tool: string, args: Record<string, unknown>): string {
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  const clip = (s: string, n: number) => {
    const one = s.replace(/\s+/g, ' ').trim()
    return one.length > n ? one.slice(0, n - 1) + '…' : one
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp) return `${mcp[1]}: ${mcp[2]}`
  switch (tool) {
    case 'Read': {
      const range = typeof args.offset === 'number' ? ` @${args.offset}` : ''
      return `Read ${shortPath(str('file_path'))}${range}`
    }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `${tool} ${shortPath(str('file_path') || str('notebook_path'))}`
    case 'Bash':
    case 'PowerShell':
      return `${tool} ${clip(str('command'), 32)}`
    case 'Grep':
    case 'Glob':
      return `${tool} "${clip(str('pattern'), 24)}"`
    case 'WebFetch':
      return `WebFetch ${clip(str('url').replace(/^https?:\/\//, ''), 32)}`
    case 'WebSearch':
      return `WebSearch "${clip(str('query'), 24)}"`
    case 'Agent':
    case 'Task':
      return `Agent ${clip(str('description') || str('subagent_type'), 28)}`
    case 'Skill':
      return `Skill ${str('skill')}`
    default:
      return tool
  }
}

/** Characters per token before the session has taught us better. */
export const DEFAULT_CPT = 4

export function estimateTokens(chars: number, cpt: number): number {
  return Math.round(chars / (cpt > 0 ? cpt : DEFAULT_CPT))
}

// Learns the session's characters per token from a turn whose growth was mostly
// tool results: the turn's result characters over what the window grew by. A
// turn of mostly talk, or a small one, teaches nothing; one sample moves the
// figure a third of the way, inside the range real text falls in
export function calibrate(cpt: number, chars: number, grew: number): number {
  if (grew < 2000 || chars / DEFAULT_CPT < grew * 0.5) return cpt
  const sample = chars / grew
  return Math.min(6, Math.max(2.5, cpt * 0.7 + sample * 0.3))
}

// Keeps the `limit` heaviest results, heaviest first
export function addEater(list: readonly CtxEater[], eater: CtxEater, limit = 8): CtxEater[] {
  return [...list, eater].sort((a, b) => b.chars - a.chars).slice(0, limit)
}

/** What a call used, for the dead-weight count: an MCP server, a skill, an agent type. */
export type UsageHit = { kind: keyof CtxUsage; name: string }

export function usageOf(tool: string, args: Record<string, unknown>): UsageHit | undefined {
  const mcp = /^mcp__(.+?)__/.exec(tool)
  if (mcp) return { kind: 'mcp', name: mcp[1]! }
  if (tool === 'Skill' && typeof args.skill === 'string') return { kind: 'skills', name: args.skill.replace(/^\//, '') }
  if (tool === 'Agent' || tool === 'Task') {
    return { kind: 'agents', name: typeof args.subagent_type === 'string' && args.subagent_type ? args.subagent_type : 'general-purpose' }
  }
  return undefined
}

export function addUsage(u: CtxUsage, hit: UsageHit): CtxUsage {
  const bucket = u[hit.kind]
  return { ...u, [hit.kind]: { ...bucket, [hit.name]: (bucket[hit.name] ?? 0) + 1 } }
}

export const EMPTY_USAGE: CtxUsage = { mcp: {}, skills: {}, agents: {} }

const LOG_SESSIONS = 30

// Writes this session's line into the project's log: the MCP servers it had
// loaded (with their tokens) and the ones it called; the newest session last
export function logSession(log: CtxProjectLog | undefined, id: string, loaded: Record<string, number>, used: readonly string[]): CtxProjectLog {
  const sessions = (log?.sessions ?? []).filter(s => s.id !== id)
  sessions.push({ id, loaded, used: [...used] })
  return { sessions: sessions.slice(-LOG_SESSIONS) }
}

// How many sessions in a row, newest back, had the server loaded and never
// called it; a session without it loaded neither counts nor breaks the run
export function idleStreak(log: CtxProjectLog | undefined, server: string): number {
  let n = 0
  for (const s of [...(log?.sessions ?? [])].reverse()) {
    if (s.used.includes(server)) break
    if (s.loaded[server] !== undefined) n++
  }
  return n
}
