import { test, expect, mock } from 'claude-code/testing'
import type { On, SessionContextBreakdown } from 'claude-code'

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
function world(on: On, counted: string[], modes: string[][] = [], ran: string[][] = [], toasts: string[] = [], stored: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 100_000 })
  // the plugin's store, kept in `stored` so a test can read what was written
  on('store.get', async (_$, e) => ({ value: stored[e.key] }) as any)
  on('store.set', async (_$, e) => {
    stored[e.key] = e.value
    return { value: undefined } as any
  })
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('session.start', async () => ({ cwd: 'C:/bats' }))
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
    return { value: { startedAt: 0, context: { window: 1_000_000, breakdown }, rateLimits: [] } } as any
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
  expect(saved.sessions[saved.sessions.length - 1]).toEqual({ id: 'now', loaded: { notion: 700 }, used: [] })

  // a call clears it, and the skill and agent counts follow theirs
  await $.tool.call(call('mcp__notion__search', {}))
  await $.tool.call(call('Skill', { skill: 'skill-3' }))
  await $.tool.call(call('Agent', { subagent_type: 'Explore', description: 'look' }))
  expect(await ui.find({ text: '    notion' })).toBeUndefined()
  expect(await ui.find({ text: '    skills  1 of 15 used' })).toBeDefined()
  expect(await ui.find({ text: '    agents  1 of 1 used' })).toBeDefined()
})
