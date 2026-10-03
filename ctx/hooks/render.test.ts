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
function world(on: On, counted: string[], modes: string[][] = []) {
  const clock = mock.clock(on, { now: 100_000 })
  mock.store(on)
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
