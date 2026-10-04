import { test, expect } from 'claude-code/testing'

import { addEater, addUsage, calibrate, DEFAULT_CPT, EMPTY_USAGE, estimateTokens, idleSessions, idleStreak, logSession, toolLabel, usageOf } from './usage'

test('toolLabel says what each call was about', () => {
  expect(toolLabel('Read', { file_path: 'C:/github/claude-mods/ctx/hooks/register.tsx' })).toBe('Read …/hooks/register.tsx')
  expect(toolLabel('Read', { file_path: '/a/b/c.ts', offset: 120 })).toBe('Read …/b/c.ts @120')
  expect(toolLabel('Bash', { command: 'git log --oneline   --all --graph --decorate --stat' })).toBe('Bash git log --oneline --all --graph…')
  expect(toolLabel('Grep', { pattern: 'atom' })).toBe('Grep "atom"')
  expect(toolLabel('WebFetch', { url: 'https://example.com/a' })).toBe('WebFetch example.com/a')
  expect(toolLabel('mcp__claude_ai_Notion__notion-fetch', {})).toBe('claude_ai_Notion: notion-fetch')
  expect(toolLabel('Agent', { description: 'Find callers', subagent_type: 'Explore' })).toBe('Agent Find callers')
  expect(toolLabel('TodoWrite', {})).toBe('TodoWrite')
})

test('estimateTokens divides by what the session learned', () => {
  expect(estimateTokens(40_000, DEFAULT_CPT)).toBe(10_000)
  expect(estimateTokens(30_000, 3)).toBe(10_000)
  expect(estimateTokens(400, 0)).toBe(100)
})

test('calibrate learns only from turns that were mostly tool results', () => {
  // 30k characters made the window grow 10k: 3 a token, a third of the way there
  expect(Math.round(calibrate(4, 30_000, 10_000) * 100)).toBe(370)
  // a turn of mostly talk teaches nothing
  expect(calibrate(4, 2_000, 10_000)).toBe(4)
  // nor a small one
  expect(calibrate(4, 3_000, 1_000)).toBe(4)
  // and the figure stays inside what real text does
  expect(calibrate(2.6, 100_000, 50_000)).toBeGreaterThanOrEqual(2.5)
  expect(calibrate(5.9, 400_000, 40_000)).toBe(6)
})

test('addEater keeps the heaviest, heaviest first', () => {
  let list = addEater([], { tool: 'Read', label: 'a', chars: 10, turn: 1 }, 2)
  list = addEater(list, { tool: 'Bash', label: 'b', chars: 30, turn: 2 }, 2)
  list = addEater(list, { tool: 'Grep', label: 'c', chars: 20, turn: 3 }, 2)
  expect(list.map(e => e.label)).toEqual(['b', 'c'])
})

test('usageOf names the server, skill or agent type a call used', () => {
  expect(usageOf('mcp__claude_ai_Gmail__search_threads', {})).toEqual({ kind: 'mcp', name: 'claude_ai_Gmail' })
  expect(usageOf('Skill', { skill: 'superpowers:brainstorming' })).toEqual({ kind: 'skills', name: 'superpowers:brainstorming' })
  expect(usageOf('Agent', { subagent_type: 'Explore' })).toEqual({ kind: 'agents', name: 'Explore' })
  expect(usageOf('Agent', {})).toEqual({ kind: 'agents', name: 'general-purpose' })
  expect(usageOf('Read', {})).toBeUndefined()
  const u = addUsage(addUsage(EMPTY_USAGE, { kind: 'mcp', name: 'x' }), { kind: 'mcp', name: 'x' })
  expect(u.mcp).toEqual({ x: 2 })
  expect(EMPTY_USAGE.mcp).toEqual({})
})

test('idleStreak counts sessions in a row that loaded a server and never called it', () => {
  let log = logSession(undefined, 's1', { gmail: 1800, notion: 2100 }, ['notion'])
  log = logSession(log, 's2', { gmail: 1800 }, [])
  log = logSession(log, 's3', { notion: 2100 }, [])
  log = logSession(log, 's4', { gmail: 1800, notion: 2100 }, [])
  expect(idleStreak(log, 'gmail')).toBe(3)
  expect(idleStreak(log, 'notion')).toBe(2)
  expect(idleStreak(log, 'todoist')).toBe(0)
  // writing the same session again replaces its line
  log = logSession(log, 's4', { gmail: 1800, notion: 2100 }, ['gmail'])
  expect(log.sessions).toHaveLength(4)
  expect(idleStreak(log, 'gmail')).toBe(0)
})

test('a session line carries its requests and misses once it has them', () => {
  let log = logSession(undefined, 's1', { notion: 2100 }, [])
  log = logSession(log, 's2', { notion: 2100 }, [], { requests: 140, misses: 3 })
  expect(log.sessions[0]).toEqual({ id: 's1', loaded: { notion: 2100 }, used: [] })
  expect(log.sessions[1]).toEqual({ id: 's2', loaded: { notion: 2100 }, used: [], requests: 140, misses: 3 })
  expect(idleSessions(log, 'notion').map(s => s.id)).toEqual(['s2', 's1'])
})

test('the project log keeps the last 30 sessions', () => {
  let log = logSession(undefined, 's0', {}, [])
  for (let i = 1; i < 40; i++) log = logSession(log, 's' + i, {}, [])
  expect(log.sessions).toHaveLength(30)
  expect(log.sessions[0]!.id).toBe('s10')
})
