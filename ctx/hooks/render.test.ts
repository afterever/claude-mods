import { test, expect, mock } from 'claude-code/testing'
import type { On, SessionContextBreakdown } from 'claude-code'

import { fmtUsd } from './cost'
import { VERSION } from './version'

const breakdown: SessionContextBreakdown = {
  categories: [
    { name: 'System prompt', tokens: 3100, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 33400, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 930500, color: 'promptBorder', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', isDeferred: false, kind: 'buffer' },
    { name: 'MCP tools (deferred)', tokens: 190000, color: 'inactive', isDeferred: true, kind: 'deferred' },
  ],
  totalTokens: 36500,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  autocompactSource: 'auto',
  percentage: 4,
  gridRows: [],
  model: 'Opus 5.5',
  memoryFiles: [{ path: 'C:/bats/CLAUDE.md', type: 'Project', tokens: 900 }],
  mcpTools: [
    { name: 'mcp__notion__search', serverName: 'notion', tokens: 700, isLoaded: true },
    { name: 'mcp__notion__fetch', serverName: 'notion', tokens: 500, isLoaded: false },
    { name: 'mcp__gmail__send', serverName: 'gmail', tokens: 400, isLoaded: false },
  ],
  agents: [{ agentType: 'Explore', source: 'built-in', tokens: 120 }],
  skills: {
    totalSkills: 15,
    includedSkills: 14,
    tokens: 1500,
    skillFrontmatter: Array.from({ length: 15 }, (_, i) => ({ name: `skill-${i}`, source: 'plugin', tokens: 100 + i })),
  },
  slashCommands: { totalCommands: 9, includedCommands: 9, tokens: 300 },
  autoCompactThreshold: 967_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
}

// The world beneath the plugin: a clock, a store, the count, the pane's open and close
function world(
  on: On,
  counted: string[],
  modes: string[][] = [],
  ran: string[][] = [],
  toasts: string[] = [],
  stored: Record<string, unknown> = {},
  compactions: (string | undefined)[] = [],
  // the session's cost ledger, when the test keeps one
  ledger?: { usd: number },
) {
  const clock = mock.clock(on, { now: 100_000 })
  // the plugin's store, kept in `stored` so a test can read what was written
  on('store.get', async (_$, e) => ({ value: stored[e.key] }) as any)
  on('store.set', async (_$, e) => {
    stored[e.key] = e.value
    return { value: undefined } as any
  })
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as any)
  // a compaction that stands, its instructions kept for the test to read
  on('session.compact', async (_$, e) => {
    compactions.push(e.instructions)
    // the summarizer's request, billed to the ledger
    if (ledger) ledger.usd += 0.69
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as any
  })
  on('command.register', async () => ({ value: {} }) as any)
  on('session.id', async () => ({ value: 'now' }) as any)
  on('session.turns', async () => ({ value: 3 }) as any)
  // a tool's result: as many characters as the call's `size` asks
  on('tool.call', async (_$, e) => {
    const size = Number((e as unknown as { size?: number }).size ?? 10)
    return { result: {}, text: 'x'.repeat(size) } as any
  })
  mock.env(on, { OS: 'Windows_NT' })
  on('process.run', async (_$, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as any
  })
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('session.usage', async ($, e) => {
    counted.push(e?.breakdown ?? 'none')
    return { value: { startedAt: 0, context: { window: 1_000_000, breakdown }, rateLimits: [], ...(ledger ? { cost: { usd: ledger.usd } } : {}) } } as any
  })
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('ui.close', async () => ({ value: undefined }))
  // what draws beneath the band and the footer
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  on('ui.render', { component: 'SessionMode' }, async (_$, e) => {
    modes.push([...e.props.modes])
    return null as any
  })
  return clock
}

const paneProps = (bodyColumns: number) => ({
  title: 'Context window',
  isFocused: true,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pane draws the breakdown on ${surface}`, async ($, on) => {
    const counted: string[] = []
    const clock = world(on, counted)
    await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
    await clock.settle()
    expect(counted).toEqual(['summary'])

    const ui = await $.ui.mount({ plugin: 'ctx', surface, component: 'Pane', requestId: 'ctx', props: paneProps(48) })
    expect(await ui.find({ text: 'Opus 5.5' })).toBeDefined()
    expect(await ui.find({ text: '4%' })).toBeDefined()
    expect(await ui.find({ text: '▲ auto-compact 967k' })).toBeUndefined()
    expect(await ui.find({ key: 'sec-mcp' })).toBeDefined()
    // only notion's loaded schema counts; the two deferred sit in the subtitle
    expect(await ui.find({ text: '    + 900 in 2 deferred, loaded on demand' })).toBeDefined()

    // the exact toggle counts with the token API, and keeps counting that way
    await ui.press({ key: 'ctx-exact' })
    expect(counted[counted.length - 1]).toBe('full')
    await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
    await clock.settle()
    expect(counted[counted.length - 1]).toBe('full')

    // skills open: the top 12 and a "+3 more" line
    await ui.press({ key: 'sec-skills' })
    expect(await ui.find({ text: '    +3 more, 303' })).toBeDefined()
  })

  test(`pane fits a dock dragged narrow on ${surface}`, async ($, on) => {
    const clock = world(on, [])
    await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'ctx', surface, component: 'Pane', requestId: 'ctx', props: paneProps(30) })
    const marker = (await ui.findAll({ type: 'Text', text: 'auto-compact 967k ▲' })).pop()
    expect(marker).toBeDefined()
    expect(marker!.text.length).toBeLessThanOrEqual(30)
  })

  test(`band shows the fill and the toggle on ${surface}`, async ($, on) => {
    const clock = world(on, [])
    await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
    await clock.settle()
    const ui = await $.ui.mount({
      plugin: 'ctx',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await ui.find({ key: 'ctx-toggle' })).toBeDefined()
    expect(await ui.find({ text: '4%' })).toBeDefined()
    // the tokens hug the slash, and a dot parts them from the percent
    expect(await ui.find({ text: '36.5k/1M·' })).toBeDefined()
  })
}

test('the footer adds ctx N% on desktop only', async ($, on) => {
  const seen: string[][] = []
  const clock = world(on, [], seen)
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
  await clock.settle()
  await $.ui.mount({ plugin: 'ctx', surface: 'desktop', component: 'SessionMode', props: { modes: ['auto'] } }).catch(() => undefined)
  await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'SessionMode', props: { modes: ['auto'] } }).catch(() => undefined)
  expect(seen).toEqual([['auto', 'ctx 4%'], ['auto']])
})

const measure = (tokens: number) => ({ context: { window: 1_000_000, tokens }, rateLimits: [], changed: ['context' as const] })

test('the pane draws the trend from the turns the engine measured', async ($, on) => {
  const clock = world(on, [])
  for (const t of [20_000, 26_000, 30_000, 36_500]) await $.session.measure(measure(t))
  // a repeat reading (a refresh with no turn) adds nothing
  await $.session.measure(measure(36_500))
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(48) })
  expect(await ui.find({ text: 'trend' })).toBeDefined()
  expect(await ui.find({ text: '▁▄▅' })).toBeDefined()
  expect(await ui.find({ text: '█' })).toBeDefined()
  // the engine's count of finished turns (the test world says 3), not the sparkline's steps
  expect(await ui.find({ text: '· 3 turns' })).toBeDefined()
  expect(await ui.find({ text: '+6.5k last turn · ~5.5k/turn' })).toBeDefined()
  // (967k - 36.5k) / 5.5k a turn
  expect(await ui.find({ text: '· ~170 turns to auto-compact' })).toBeDefined()
})

test('the band shows the last step beside its sparkline', async ($, on) => {
  const clock = world(on, [])
  for (const t of [20_000, 36_500]) await $.session.measure(measure(t))
  await clock.settle()
  const ui = await $.ui.mount({
    plugin: 'ctx',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect(await ui.find({ text: '+16.5k' })).toBeDefined()
})

test('a memory file opens with its default app', async ($, on) => {
  const ran: string[][] = []
  const toasts: string[] = []
  const clock = world(on, [], [], ran, toasts)
  await $.session.measure(measure(36_500))
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(48) })
  await ui.press({ key: 'sec-memory' })
  await ui.press({ key: 'mem-0' })
  expect(ran).toEqual([['powershell', '-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath 'C:/bats/CLAUDE.md'"]])
  expect(toasts).toEqual(['Opened …/bats/CLAUDE.md'])
})

const call = (tool: string, args: Record<string, unknown>) => ({ tool, ...args }) as any

test('a heavy result is toasted, listed, and forgotten after a compaction', async ($, on) => {
  const toasts: string[] = []
  const clock = world(on, [], [], [], toasts)
  await $.session.measure(measure(30_000))
  await clock.settle()
  await $.tool.call(call('Read', { file_path: 'C:/x/y/big.ts', size: 80_000 }))
  await $.tool.call(call('Grep', { pattern: 'atom', size: 8_000 }))
  // small ones never make the list
  await $.tool.call(call('Bash', { command: 'ls', size: 300 }))
  expect(toasts).toEqual(['Read …/y/big.ts added ~20k tokens'])

  const ui = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(48) })
  await ui.press({ key: 'sec-eaters' })
  expect(await ui.find({ text: '    Read …/y/big.ts' })).toBeDefined()
  expect(await ui.find({ text: '  ~20k' })).toBeDefined()
  expect(await ui.find({ text: '    Grep "atom"' })).toBeDefined()
  expect(await ui.find({ text: '    Bash ls' })).toBeUndefined()

  // the window fell from 30k to 5k: what was eaten is gone
  await $.session.measure(measure(5_000))
  await clock.settle()
  expect(await ui.find({ text: '    Read …/y/big.ts' })).toBeUndefined()
})

test('unused servers carry their idle streak across sessions', async ($, on) => {
  const log = {
    sessions: [1, 2, 3, 4, 5].map(i => ({ id: 'old' + i, loaded: { notion: 700 }, used: [] as string[] })),
  }
  const stored: Record<string, unknown> = { 'project:C:/bats': log }
  const clock = world(on, [], [], [], [], stored)
  await $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure(30_000))
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  await ui.press({ key: 'sec-dead' })
  expect(await ui.find({ text: '    notion' })).toBeDefined()
  expect(await ui.find({ text: 'idle 6 sessions' })).toBeDefined()
  expect(await ui.find({ text: '    skills  0 of 15 used' })).toBeDefined()
  // this session's line went into the project's log
  const saved = stored['project:C:/bats'] as typeof log
  expect(saved.sessions[saved.sessions.length - 1]).toEqual({ id: 'now', loaded: { notion: 700 }, used: [], requests: 0, misses: 0 })

  // a call clears it, and the skill and agent counts follow theirs
  await $.tool.call(call('mcp__notion__search', {}))
  await $.tool.call(call('Skill', { skill: 'skill-3' }))
  await $.tool.call(call('Agent', { subagent_type: 'Explore', description: 'look' }))
  expect(await ui.find({ text: '    notion' })).toBeUndefined()
  expect(await ui.find({ text: '    skills  1 of 15 used' })).toBeDefined()
  expect(await ui.find({ text: '    agents  1 of 1 used' })).toBeDefined()
})

test('auto-compact warns once per step, and the band wears the badge', async ($, on) => {
  const toasts: string[] = []
  const clock = world(on, [], [], [], toasts)
  for (const t of [300_000, 400_000, 500_000, 800_000]) {
    await $.session.measure(measure(t))
    await clock.settle()
  }
  expect(toasts).toEqual([
    'Auto-compact is coming: ~6 turns left (400k / 967k). /ctx compact keeps what matters.',
    'Auto-compact is close: ~2 turns left (800k / 967k). /ctx compact keeps what matters.',
  ])
  const band = await $.ui.mount({
    plugin: 'ctx',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  const badge = (await band.findAll({ type: 'Text', text: '⚠ ~2 turns' })).pop()
  expect(badge?.props.color).toBe('error')
  const pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(48) })
  expect(await pane.find({ text: '⚠ Auto-compact is close · c compacts on your terms' })).toBeDefined()
})

test('compact keeps the files and requests, toasts the drop, marks the sparkline', async ($, on) => {
  const toasts: string[] = []
  const compactions: (string | undefined)[] = []
  const clock = world(on, [], [], [], toasts, {}, compactions)
  await $.session.measure(measure(100_000))
  await $.session.measure(measure(150_000))
  await clock.settle()
  await $.prompt.submit({ text: 'fix the  bug\nin fmt', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '/ctx', wait: false, origin: { kind: 'composer' } })
  await $.tool.call(call('Edit', { file_path: 'C:/x/fmt.ts', old_string: 'a', new_string: 'b' }))
  await $.tool.call(call('Read', { file_path: 'C:/x/other.ts' }))

  const ui = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(48) })
  await ui.press({ key: 'ctx-compact' })
  await clock.settle()
  expect(compactions).toHaveLength(1)
  const keep = compactions[0]!
  expect(keep).toContain('[ctx keep]')
  expect(keep).toContain('C:/x/fmt.ts')
  expect(keep).not.toContain('other.ts')
  expect(keep).toContain('1. "fix the bug in fmt"')
  expect(keep).not.toContain('/ctx')
  expect(toasts).toEqual(['Compacting…', 'Compacted 150k → ~36.5k (−113.5k)'])

  // the next reading carries the mark: one glyph in the compaction color
  await $.session.measure(measure(30_000))
  await $.session.measure(measure(42_000))
  await clock.settle()
  // (the Messages row shares the color: its bar run and swatch are not bold)
  const lit = (await ui.findAll({ type: 'Text' })).filter(t => t.props.color === 'permission' && t.props.bold)
  expect(lit).toHaveLength(1)
  expect(lit[0]!.text).toBe('▁')
})

test('autokeep adds the keep instructions to every compaction, once', async ($, on) => {
  const compactions: (string | undefined)[] = []
  const clock = world(on, [], [], [], [], {}, compactions)
  await $.session.measure(measure(300_000))
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(48) })
  // the engine's own compaction, as it raises it: the messages it is about to fold
  const auto = { trigger: 'auto' as const, instructions: 'mine', messages: [{ role: 'user' as const, text: 'hi', toolUses: [] }] }
  // off: a compaction passes as given
  await $.session.compact(auto)
  await ui.press({ key: 'ctx-autokeep' })
  expect(await ui.find({ key: 'ctx-autokeep' })).toMatchObject({ props: { label: '◉ autokeep' } })
  await $.session.compact(auto)
  // the mod's own compact is not given them twice
  await ui.press({ key: 'ctx-compact' })
  await clock.settle()
  expect(compactions[0]).toBe('mine')
  expect(compactions[1]!.startsWith('mine\n\n[ctx keep]')).toBe(true)
  expect(compactions[2]!.split('[ctx keep]')).toHaveLength(2)
})

// Opus 5.5's list prices, $ per million tokens: input 4 (output 5x), cache read 0.20, 1-hour write 8
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string }
const priced = (x: Usage) => ((x.input_tokens + 5 * x.output_tokens) * 4 + x.cache_read_input_tokens * 0.2 + x.cache_creation_input_tokens * 8) / 1e6
const u = (input: number, output: number, read: number, write: number, model = 'claude-opus-5-5'): Usage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  model,
})

// The engine beneath the turn events: each request answers with the next usage queued
function turns(on: On, queue: Usage[]) {
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: queue.shift() ?? null }
  })
  on('turn.complete', async () => ({ text: '' }))
}

type Step = { usage: Usage; agentId?: string; extra?: number }
let turnNo = 0

// One main-loop turn as a session runs it: start, the requests, the ledger
// billing them (plus any `extra` a subagent or a tool's model call cost), the end
async function runTurn($: any, queue: Usage[], ledger: { usd: number }, tokens: number, steps: Step[]) {
  const turnId = 't' + ++turnNo
  await $.turn.start({ text: 'go', turnId })
  for (const [index, s] of steps.entries()) {
    queue.push(s.usage)
    const st = $.turn.step({ turnId, index, model: s.usage.model, messageCount: 3, ...(s.agentId ? { agentId: s.agentId } : {}) })
    for await (const _ of st) void _
    ledger.usd += priced(s.usage) + (s.extra ?? 0)
    if (s.agentId) await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'sub', agentId: s.agentId, reason: 'answer' })
  }
  await $.session.measure({ context: { window: 1_000_000, tokens }, rateLimits: [], cost: { usd: ledger.usd }, changed: ['context', 'cost'] })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
}

// Three clean turns: enough for the ledger to teach the model's prices
async function teach($: any, queue: Usage[], ledger: { usd: number }) {
  await runTurn($, queue, ledger, 210_000, [{ usage: u(3, 800, 200_000, 6_000) }, { usage: u(3, 400, 206_000, 2_000) }])
  await runTurn($, queue, ledger, 224_000, [{ usage: u(5, 2_000, 210_000, 12_000) }])
  await runTurn($, queue, ledger, 228_000, [{ usage: u(3, 300, 222_000, 1_000) }, { usage: u(3, 300, 223_000, 500) }, { usage: u(3, 600, 224_000, 3_000) }])
}

const bandProps = (bodyColumns: number) => ({ hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} })
const texts = async (ui: any) => ((await ui.findAll({ type: 'Text' })) as { text: string }[]).map(t => t.text)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band shows what the last turn cost on ${surface}`, async ($, on) => {
    const ledger = { usd: 0 }
    const queue: Usage[] = []
    const clock = world(on, [], [], [], [], {}, [], ledger)
    turns(on, queue)
    await $.session.measure(measure(200_000))
    await clock.settle()
    const band = await $.ui.mount({ plugin: 'ctx', surface, component: 'AbovePrompt', props: bandProps(120) })
    // no turn yet: nothing to say
    expect((await texts(band)).some(t => t.startsWith('+$'))).toBe(false)

    await runTurn($, queue, ledger, 210_000, [{ usage: u(3, 800, 200_000, 6_000) }, { usage: u(3, 400, 206_000, 2_000) }])
    const spent = priced(u(3, 800, 200_000, 6_000)) + priced(u(3, 400, 206_000, 2_000))
    expect(await band.find({ text: '+' + fmtUsd(spent) })).toBeDefined()
    expect(await band.find({ text: '·2r' })).toBeDefined()
  })
}

test('a turn with a subagent shows its share once the prices are learned', async ($, on) => {
  const ledger = { usd: 0 }
  const queue: Usage[] = []
  const clock = world(on, [], [], [], [], {}, [], ledger)
  turns(on, queue)
  await teach($, queue, ledger)
  // a subagent on another model, billed in the same turn
  const sub = u(10, 2_000, 40_000, 20_000, 'claude-haiku-4-5')
  const subCost = 0.31
  const main = [u(3, 500, 228_000, 2_000), u(3, 500, 230_000, 2_000)]
  await runTurn($, queue, ledger, 232_000, [{ usage: main[0]! }, { usage: sub, agentId: 'a1', extra: subCost - priced(sub) }, { usage: main[1]! }])
  await clock.settle()

  const band = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'AbovePrompt', props: bandProps(120) })
  expect(await band.find({ text: '·⑂~$0.31' })).toBeDefined()
  const pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  const all = await texts(pane)
  const total = priced(main[0]!) + priced(main[1]!) + subCost
  expect(all).toContain(`last turn +${fmtUsd(total)} (2 requests · 1 subagent ~$0.31 · cache 99% hit)`)
  // the session's ledger, with the turn as its share
  // (three Texts, so the amount can be green on its own)
  expect(all).toContain('session ')
  expect(all).toContain(fmtUsd(ledger.usd))
  expect(all).toContain(` · last turn was ${Math.round((total / ledger.usd) * 100)}% of it`)
  expect((await pane.findAll({ type: 'Text', text: fmtUsd(ledger.usd) })).some(t => (t as any).props?.color === 'success')).toBe(true)
  // the foot of the pane names the mod's version
  expect(all).toContain(`ctx v${VERSION}`)
  // 232k re-read at $0.20 a million, 8 requests over 4 turns
  expect(all.some(t => t.startsWith('carrying ~$0.05/request · ~$0.09/turn'))).toBe(true)
})

test('a cache miss is shown as it happened, and an idle cache as likely expired', async ($, on) => {
  const ledger = { usd: 0 }
  const queue: Usage[] = []
  const clock = world(on, [], [], [], [], {}, [], ledger)
  turns(on, queue)
  await teach($, queue, ledger)
  // back after 20 minutes and still cached: the cache lives an hour
  await clock.advance(20 * 60_000)
  await runTurn($, queue, ledger, 230_000, [{ usage: u(3, 500, 228_000, 2_000) }])
  // a request that wrote everything afresh
  await runTurn($, queue, ledger, 232_000, [{ usage: u(3, 500, 0, 231_000) }])
  await clock.settle()
  let pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  expect(await texts(pane)).toContain('● cache miss: a request wrote 231k fresh · ~$1.85')
  expect((await texts(pane)).some(t => t.startsWith('⚠ cache likely expired'))).toBe(false)

  await pane.unmount()
  await clock.advance(65 * 60_000)
  pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  const all = await texts(pane)
  expect(all).toContain('⚠ cache likely expired · idle 1h 5m')
  expect(all).toContain('  next request re-writes 232k ≈ ~$1.86 (warm ~$0.05)')
})

test('a compaction is priced from the ledger, and the plan before it from the learned prices', async ($, on) => {
  const ledger = { usd: 0 }
  const queue: Usage[] = []
  const toasts: string[] = []
  const clock = world(on, [], [], [], toasts, {}, [], ledger)
  turns(on, queue)
  await teach($, queue, ledger)
  await runTurn($, queue, ledger, 600_000, [{ usage: u(3, 500, 228_000, 370_000) }])
  await runTurn($, queue, ledger, 602_000, [{ usage: u(3, 500, 600_000, 2_000) }])
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  // after: everything but the 33.4k of messages (3.1k), plus an 8k summary
  const plan = (await texts(pane)).find(t => t.startsWith('compact now saves'))
  expect(plan).toBe('compact now saves ~$0.12/request · ~$0.37 once · pays back in ~4 requests')

  await pane.press({ key: 'ctx-compact' })
  await clock.settle()
  expect(toasts[toasts.length - 1]).toBe('Compacted 602k → ~36.5k (−565.5k) · summary $0.69 · now ~$0.007/request (was ~$0.12)')
})

test('an idle server is priced by the requests and misses each session logged', async ($, on) => {
  const log = {
    sessions: [
      { id: 'old1', loaded: { notion: 700 }, used: [] as string[] },
      { id: 'old2', loaded: { notion: 700 }, used: [] as string[], requests: 2_000, misses: 10 },
    ],
  }
  const ledger = { usd: 0 }
  const queue: Usage[] = []
  const clock = world(on, [], [], [], [], { 'project:C:/bats': log }, [], ledger)
  turns(on, queue)
  await $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
  await teach($, queue, ledger)
  await $.turn.start({ text: 'go', turnId: 'next' })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  await pane.press({ key: 'sec-dead' })
  // old2: 700 x (2000 reads at $0.20 + 10 writes at $8) per million = $0.336; this session adds
  // under a tenth of a cent; old1 logged neither
  expect(await pane.find({ text: '      ~$0.34 so far · ~$0.17/session' })).toBeDefined()
})

test('cost off takes every dollar figure away', async ($, on) => {
  const ledger = { usd: 0 }
  const queue: Usage[] = []
  const stored: Record<string, unknown> = {}
  const toasts: string[] = []
  const clock = world(on, [], [], [], toasts, stored, [], ledger)
  turns(on, queue)
  await teach($, queue, ledger)
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'AbovePrompt', props: bandProps(120) })
  expect((await texts(band)).some(t => t.startsWith('+$'))).toBe(true)
  // the learned prices are kept for later sessions
  expect((stored.costSamples as unknown[]).length).toBe(2)
  await $.command.run({ command: 'ctx', args: 'cost off' } as any)
  expect(toasts).toContain('Cost off: tokens only')
  expect(stored.cost).toBe(false)
  expect((await texts(band)).some(t => t.startsWith('+$'))).toBe(false)
  // nor does the pane keep the session total
  const pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  expect((await texts(pane)).some(t => t.startsWith('session '))).toBe(false)
})

test("a fresh session's first turn writes the prompt afresh, and nothing calls it a miss", async ($, on) => {
  const ledger = { usd: 0 }
  const queue: Usage[] = []
  const clock = world(on, [], [], [], [], {}, [], ledger)
  turns(on, queue)
  await runTurn($, queue, ledger, 47_000, [{ usage: u(3, 500, 0, 45_000) }, { usage: u(3, 300, 45_000, 2_000) }])
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'AbovePrompt', props: bandProps(130) })
  const shown = await texts(band)
  expect(shown.some(t => t.startsWith('+$'))).toBe(true)
  expect(shown.some(t => t.includes('●'))).toBe(false)
  const pane = await $.ui.mount({ plugin: 'ctx', surface: 'terminal', component: 'Pane', requestId: 'ctx', props: paneProps(60) })
  expect((await texts(pane)).some(t => t.startsWith('● cache miss'))).toBe(false)
})
