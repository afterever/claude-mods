import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRun, Flow, Panel } from '../types'

const flow: Flow = {
  title: 'Ship it',
  total: 3,
  done: 1,
  running: 1,
  phase: 'delegate',
  isFinished: false,
  tasks: [{ title: 'Write docs', tier: 'medium', after: [1] }],
}

const agent = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: 'a',
  agentId: 'a',
  type: 'Explore',
  description: 'Map the hooks',
  model: 'claude-opus-5-5',
  status: 'running',
  startedAt: 20_000,
  contextTokens: 120_000,
  contextMax: 1_000_000,
  tokens: 300_000,
  costUsd: 0.42,
  steps: 4,
  round: 1,
  stepDone: 2,
  stepTotal: 5,
  stepNote: 'reading the long register module end to end',
  ...over,
})

// The world beneath the plugin, then its state as its hooks would have left it. Only the
// plugin writes its own state, so one spawn makes it write every key, and the test's
// `state.set` swaps in the seeded value; later writes (a press) go through unchanged.
async function world($: Engine, on: On, state: Record<string, unknown>, opened: string[] = []) {
  let isSeeding = true
  mock.clock(on, { now: 100_000 })
  on('state.set', async (_$, e, next) => next(isSeeding && e.key in state ? { ...e, value: state[e.key] } : e))
  on('agent.spawn', async () => ({ agentId: 'seed', model: 'claude-opus-5-5' }) as any)
  on('ui.panes', async () => ({ value: [] }) as any)
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async () => ({ value: undefined }))
  // The band beneath the plugin: the engine's, or another mod's box (agent-pulse, say).
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, { key: 'beneath' })
  })
  await $.agent.spawn({ subagentType: 'Explore', description: 'seed', tool_use_id: 'seed' } as any)
  isSeeding = false
  opened.length = 0
}

const seed = (panel: Partial<Panel> = {}, f: Flow = flow, list: AgentRun[] = [agent()]) => ({
  flow: f,
  agents: list,
  now: 100_000,
  panel: { isCompact: false, isDoneCollapsed: false, autoOpenedFor: '', ...panel },
})

const paneProps = (bodyColumns: number) => ({
  title: 'Agents',
  isFocused: true,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
})

const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text)

for (const cols of [40, 60, 100]) {
  test(`stats lead with time and cost, steps last, at ${cols} columns`, async ($, on) => {
    await world($, on, seed())
    const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(cols) })
    const stats = (await texts(ui)).find(t => t.includes('ctx 12%') && !t.includes('█'))
    expect(stats).toBeDefined()
    expect(stats!.trim().startsWith('1:20 · ≈$0.42 · ctx 12% · 120k')).toBe(true)
    expect(stats!.endsWith(' · 2/5 reading the long register module end to end')).toBe(true)
    // the whole line, bar and all: its cost ends inside the pane, so a cut takes the steps first
    const line = (await texts(ui)).find(t => t.includes('ctx 12%') && t.includes('░'))
    expect(line!.indexOf('≈$0.42') + '≈$0.42'.length).toBeLessThanOrEqual(cols)
  })
}

test('the pane totals lead with the time', async ($, on) => {
  await world($, on, seed())
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  expect(await ui.find({ text: '1:20 · ≈$0.42 · 300k tokens' })).toBeDefined()
})

test('a planned row drops the trailing clock glyph', async ($, on) => {
  await world($, on, seed())
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const planned = (await texts(ui)).find(t => t.includes('1. Write docs'))
  expect(planned).toBeDefined()
  expect(planned!.includes('◷')).toBe(false)
})

test('compact draws one line per agent, with its time and cost', async ($, on) => {
  const done = agent({ id: 'b', agentId: 'b', description: 'Check the band', status: 'done', endedAt: 50_000, costUsd: 0.1 })
  await world($, on, seed({ isCompact: true }, flow, [agent(), done]))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const all = await texts(ui)
  expect(all).toContain('Map the hooks')
  expect(all).toContain('Check the band')
  expect(all).toContain('1:20 ≈$0.42')
  expect(all).toContain('0:30 ≈$0.10')
  expect(all).toContain('◷ 1. Write docs')
  // the three-line rows' model line is gone
  expect(all.some(t => t.includes('Opus 5.5'))).toBe(false)
})

test('compact keeps finished agents folded when Finished is collapsed', async ($, on) => {
  const done = agent({ id: 'b', agentId: 'b', description: 'Check the band', status: 'done', endedAt: 50_000 })
  await world($, on, seed({ isCompact: true, isDoneCollapsed: true }, flow, [agent(), done]))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  expect(await ui.find({ text: 'Map the hooks' })).toBeDefined()
  expect(await ui.find({ text: 'Check the band' })).toBeUndefined()
  // the toggle that unfolds them is there
  await ui.press({ key: 'done' })
  expect(await ui.find({ text: 'Check the band' })).toBeDefined()
})

test('compact leaves the bar out on a narrow pane', async ($, on) => {
  await world($, on, seed({ isCompact: true }))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(32) })
  expect((await texts(ui)).some(t => t.includes('░') || t.includes('█'))).toBe(false)
  expect(await ui.find({ text: 'Map the hooks' })).toBeDefined()
})

const pulses = async (ui: { findAll: (q: { type: string }) => Promise<Node[]> }) =>
  (await ui.findAll({ type: 'Client' }))
    .map(n => n.props as { module?: string; props?: Record<string, unknown> })
    .filter(p => p.module?.endsWith('pulse.tsx'))
    .map(p => p.props ?? {})

const mountBand = ($: Engine, cols = 100) =>
  $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'AbovePrompt', props: bandProps(cols) })

test('the band bar fills in eighths of a cell, its head a pulsing cell of its own', async ($, on) => {
  await world($, on, seed())
  const ui = await mountBand($)
  // 1/3 of 40 cells is 106.7 eighths: 13 full cells, a 3/8 cell, 26 empty. While agents run the 3/8 head is a Client.
  expect(await ui.find({ text: '█'.repeat(13) })).toBeDefined()
  expect(await ui.find({ text: '░'.repeat(26) })).toBeDefined()
  const head = (await pulses(ui)).find(p => Array.isArray(p.frames) && p.frames[0] === '▍')
  expect(head).toMatchObject({ kind: 'spin', frames: ['▍'] })
  // the ember palette shades the head core to glow
  expect((head?.colors as string[]).length).toBe(12)
})

test('with animation off the band bar is one still text and nothing runs', { options: { animation: 'off' } }, async ($, on) => {
  await world($, on, seed())
  const ui = await mountBand($)
  expect(await ui.find({ text: '█'.repeat(13) + '▍' + '░'.repeat(26) })).toBeDefined()
  expect(await ui.findAll({ type: 'Client' })).toEqual([])
})

test('the band shows a glyph per agent in its costume color, then ✓, ✗ and a dim ○', async ($, on) => {
  const list = [
    agent({ id: 'a', agentId: 'a', type: 'Explore', description: 'Scout' }),
    agent({ id: 'b', agentId: 'b', type: 'general-purpose', description: 'Wire', model: 'claude-sonnet-5-5', effort: 'high' }),
    agent({ id: 'c', agentId: 'c', description: 'Checked', status: 'done', endedAt: 50_000 }),
    agent({ id: 'd', agentId: 'd', description: 'Broke', status: 'failed', endedAt: 60_000 }),
  ]
  await world($, on, seed({}, flow, list))
  const ui = await mountBand($)
  // the running ones first, newest first: the engineer, then the pirate
  const spins = (await pulses(ui)).filter(p => Array.isArray(p.frames) && (p.frames as string[]).length > 1)
  expect(spins.map(p => p.colors)).toEqual([['#BA7517'], ['#888780']])
  // `find` matches a node by its joined text, so a glyph is picked out of the Texts by exact text
  const glyph = async (ch: string) => (await ui.findAll({ type: 'Text' })).find(t => t.text === ch)?.props as { color?: string; dimColor?: boolean } | undefined
  expect((await glyph('✓'))?.color).toBe('success')
  expect((await glyph('✗'))?.color).toBe('error')
  // the planned task is a dim open circle in its costume's color (Opus at medium: the detective)
  expect(await glyph('○')).toMatchObject({ color: '#D85A30', dimColor: true })
})

test('past eight agents the glyph row folds into +n and the row still fits 80 columns', async ($, on) => {
  const many = Array.from({ length: 10 }, (_, i) => agent({ id: `r${i}`, agentId: `r${i}`, description: `Agent ${i}` }))
  const busy: Flow = { title: 'savvy-flow', total: 0, done: 0, running: 10, phase: 'delegate', isFinished: false, tasks: [] }
  await world($, on, seed({}, busy, many))
  const ui = await mountBand($, 80)
  expect((await pulses(ui)).filter(p => p.kind === 'spin')).toHaveLength(8)
  expect(await ui.find({ text: '+2' })).toBeDefined()
  const all = await texts(ui)
  const barText = all.find(t => /^[█▏▎▍▌▋▊▉░]+$/.test(t))!
  // title slot 12, the bar, label 15, percent 2, eight glyphs and `+2` 10, `a: ×10` 6, ✕ 1, six gaps of 2
  expect(12 + barText.length + 15 + 2 + 10 + 6 + 1 + 12).toBeLessThanOrEqual(80)
})

// The sparkle plays at `full`, once, for a finish the band saw happen.
const sweeps = async (ui: { findAll: (q: { type: string }) => Promise<Node[]> }) => (await pulses(ui)).filter(p => p.kind === 'sweep')
const finishedFlow: Flow = { ...flow, done: 3, running: 0, phase: 'close', isFinished: true }
// The orchestrator closes the flow through the mod's own tool, as it does in a session.
const finish = ($: Engine, id: string) => $.tool.call({ tool: 'mcp__subagent-progress__progress', finished: true, tool_use_id: id })

test('the finish sparkle plays once for a finish the band saw', { options: { animation: 'full' } }, async ($, on) => {
  await world($, on, seed())
  const ui = await mountBand($)
  expect(await sweeps(ui)).toEqual([])
  await finish($, 'close-1')
  const [sweep] = await sweeps(ui)
  expect(sweep).toMatchObject({ kind: 'sweep' })
  expect((sweep?.chars as string[]).join('')).toBe('█'.repeat(40))
  // the same finished flow drawn again is the same sweep, not a second one
  await finish($, 'close-2')
  expect(await sweeps(ui)).toHaveLength(1)
})

test('a flow already finished on first sight does not sparkle', { options: { animation: 'full' } }, async ($, on) => {
  await world($, on, seed({}, finishedFlow))
  const ui = await mountBand($)
  expect(await ui.find({ text: 'Done' })).toBeDefined()
  expect(await sweeps(ui)).toEqual([])
})

for (const animation of ['subtle', 'off']) {
  test(`${animation} never sparkles`, { options: { animation } }, async ($, on) => {
    await world($, on, seed())
    const ui = await mountBand($)
    await finish($, 'close-1')
    expect(await ui.find({ text: 'Done' })).toBeDefined()
    expect(await sweeps(ui)).toEqual([])
  })
}

test('a long band label takes its cells from the bar, not the row', async ($, on) => {
  // an orchestrated flow with no report yet: "Tasks 1 running" and "0%", on an 80-column prompt
  const busy: Flow = { title: 'savvy-flow', total: 0, done: 0, running: 1, phase: 'delegate', isFinished: false, tasks: [] }
  await world($, on, seed({}, busy))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'AbovePrompt', props: bandProps(80) })
  const all = await texts(ui)
  const barText = all.find(t => /^[█▏▎▍▌▋▊▉░]+$/.test(t))!
  expect(all).toContain('Tasks 1 running')
  // title slot 12, the bar, label 15, percent 2, ▣ 1, `a: ×1` 5, ✕ 1, six gaps of 2
  expect(12 + barText.length + 15 + 2 + 1 + 5 + 1 + 12).toBeLessThanOrEqual(80)
})

test('a finished band shows a check, Done, and a crew button on the a key', async ($, on) => {
  const opened: string[] = []
  await world($, on, seed({}, { ...flow, done: 3, running: 0, phase: 'close', isFinished: true }), opened)
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'AbovePrompt', props: bandProps(100) })
  expect(await ui.find({ text: '✓ ' })).toBeDefined()
  expect(await ui.find({ text: 'Done' })).toBeDefined()
  expect(await ui.find({ text: '█'.repeat(40) })).toBeDefined()
  const crew = await ui.find({ key: 'subagent-crew' })
  expect((crew?.props as { hotkey?: string }).hotkey).toBe('a')
  await ui.press({ key: 'subagent-crew' })
  expect(opened).toEqual(['subagents'])
})

test('the band stays an SVG row on desktop', async ($, on) => {
  await world($, on, seed())
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'desktop', component: 'AbovePrompt', props: bandProps(100) })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ key: 'subagent-crew' })).toBeDefined()
})

test('an active bar keeps the band of the mods beneath it, on both surfaces', async ($, on) => {
  await world($, on, seed())
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'subagent-progress', surface, component: 'AbovePrompt', props: bandProps(100) })
    expect(await ui.find({ key: 'subagent-crew' })).toBeDefined()
    expect(await ui.find({ key: 'beneath' })).toBeDefined()
    await ui.unmount()
  }
})

// --- costumes follow the model and effort a subagent runs on (hooks/crew.ts)

const svgSources = async (ui: { findAll: (q: { type: string }) => Promise<{ props?: unknown }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).map(n => String((n.props as { source?: string }).source ?? ''))

test('the desktop pane dresses each subagent by its model and effort', async ($, on) => {
  const list = [
    agent({ id: 'a', agentId: 'a', type: 'general-purpose', description: 'Sonnet high', model: 'claude-sonnet-5-5', effort: 'high' }),
    agent({ id: 'b', agentId: 'b', type: 'general-purpose', description: 'Sonnet low', model: 'claude-sonnet-5-5', effort: 'low' }),
    agent({ id: 'c', agentId: 'c', type: 'Plan', description: 'Haiku', model: 'claude-haiku-5-5' }),
    agent({ id: 'd', agentId: 'd', type: 'general-purpose', description: 'Opus low', model: 'claude-opus-5-5', effort: 'low' }),
    agent({ id: 'e', agentId: 'e', type: 'general-purpose', description: 'Opus high', model: 'claude-opus-5-5', effort: 'high' }),
    agent({ id: 'f', agentId: 'f', type: 'Explore', description: 'Pirate', model: 'claude-haiku-5-5' }),
    agent({ id: 'g', agentId: 'g', type: 'custom:plain', description: 'Plain', model: 'gpt-9' }),
  ]
  await world($, on, seed({}, flow, list))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'desktop', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const sources = await svgSources(ui)
  const row = (name: string) => sources.find(s => s.includes(`>${name}</text>`))
  expect(row('Sonnet high')).toContain('class="c-engineer run"')
  expect(row('Sonnet low')).toContain('class="c-chef run"')
  expect(row('Haiku')).toContain('class="c-racer run"')
  expect(row('Opus low')).toContain('class="c-detective run"')
  expect(row('Opus high')).toContain('class="c-astronaut run"')
  expect(row('Pirate')).toContain('class="c-pirate run"')
  expect(row('Plain')).toContain('class="c-other run"')
  // the row names the agent's type, not a costume
  expect(row('Sonnet high')).toContain('>general-purpose</tspan>')
})

test('a finished subagent keeps its costume but stops walking', async ($, on) => {
  const done = agent({ id: 'a', agentId: 'a', type: 'general-purpose', description: 'Finished chef', model: 'claude-sonnet-5-5', effort: 'medium', status: 'done', endedAt: 50_000 })
  await world($, on, seed({}, flow, [done]))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'desktop', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const row = (await svgSources(ui)).find(s => s.includes('>Finished chef</text>'))
  expect(row).toContain('class="c-chef"')
  expect(row).not.toContain('c-chef run')
})

test('planned tasks are dressed by model, effort or savvy tier', async ($, on) => {
  const planned: Flow = {
    ...flow,
    tasks: [
      { title: 'By model', tier: '', model: 'sonnet', effort: 'high', after: [] },
      { title: 'By tier', tier: 'light', after: [] },
      { title: 'Unspecified', tier: '', after: [] },
    ],
  }
  await world($, on, seed({}, planned, []))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'desktop', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const sources = await svgSources(ui)
  const row = (name: string) => sources.find(s => s.includes(name))
  expect(row('1. By model')).toContain('c-engineer')
  expect(row('1. By model')).toContain('Sonnet · high')
  expect(row('2. By tier')).toContain('c-detective')
  expect(row('2. By tier')).toContain('Opus · low')
  expect(row('3. Unspecified')).toContain('c-other')
})

type Node = { props?: unknown }
const crabs = async (ui: { findAll: (q: { type: string }) => Promise<Node[]> }) =>
  (await ui.findAll({ type: 'Client' }))
    .map(n => n.props as { module?: string; props?: Record<string, unknown> })
    .filter(p => p.module?.endsWith('crab.tsx'))
    .map(p => p.props ?? {})

test('the terminal card draws a crab in the costume color and names the agent type', async ($, on) => {
  const list = [agent({ id: 'a', agentId: 'a', type: 'general-purpose', description: 'Engineer', model: 'claude-sonnet-5-5', effort: 'high' })]
  await world($, on, seed({}, flow, list))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  expect((await texts(ui)).some(t => t.includes('general-purpose · Sonnet 5.5 · high'))).toBe(true)
  const running = (await crabs(ui)).find(c => c.costume === 'engineer')
  expect(running).toMatchObject({ costume: 'engineer', accent: '#BA7517', running: true, dim: false })
})

test('finished and planned crabs stand still and dim, only the running one walks', async ($, on) => {
  const list = [
    agent({ id: 'a', agentId: 'a', description: 'Walker' }),
    agent({ id: 'b', agentId: 'b', description: 'Finished', status: 'done', endedAt: 50_000 }),
    agent({ id: 'c', agentId: 'c', description: 'Broken', status: 'failed', endedAt: 60_000 }),
  ]
  await world($, on, seed({}, flow, list))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const all = await crabs(ui)
  expect(all.filter(c => c.running === true)).toHaveLength(1)
  expect(all.filter(c => c.running === false && c.dim === true)).toHaveLength(3) // done, failed, the planned task
  // the planned task's crab replaces the ▢
  expect((await texts(ui)).some(t => t.includes('▢'))).toBe(false)
  expect(await ui.find({ text: '1. Write docs' })).toBeDefined()
})

test('only the newest eight running crabs walk', async ($, on) => {
  const many = Array.from({ length: 10 }, (_, i) => agent({ id: `r${i}`, agentId: `r${i}`, description: `Agent ${i}` }))
  await world($, on, seed({}, flow, many))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  expect((await crabs(ui)).filter(c => c.running === true)).toHaveLength(8)
  expect((await crabs(ui)).filter(c => c.running === false)).toHaveLength(3) // two over the cap and the planned task
})

test('the animation level reaches every crab', { options: { animation: 'off' } }, async ($, on) => {
  await world($, on, seed())
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const all = await crabs(ui)
  expect(all.length).toBeGreaterThan(0)
  expect(all.every(c => c.level === 'off')).toBe(true)
})

test('compact spins a running agent and leaves a finished one a check', async ($, on) => {
  const done = agent({ id: 'b', agentId: 'b', description: 'Check the band', status: 'done', endedAt: 50_000 })
  await world($, on, seed({ isCompact: true }, flow, [agent(), done]))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(60) })
  const spins = (await pulses(ui)).filter(p => p.kind === 'spin')
  expect(spins).toHaveLength(1)
  expect(spins[0]).toMatchObject({ colors: ['#888780'] }) // the Explore pirate
  expect(await crabs(ui)).toEqual([]) // one cell-row is too small for a crab
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === '✓')).toBe(true)
})

test('the context bar of a worker with no steps turns amber, then red; a steps bar never does', async ($, on) => {
  const noSteps = { stepTotal: undefined, stepDone: undefined, stepNote: undefined }
  const list = [
    agent({ id: 'a', agentId: 'a', description: 'Cool', contextTokens: 120_000, ...noSteps }),
    agent({ id: 'b', agentId: 'b', description: 'Warm', contextTokens: 750_000, ...noSteps }),
    agent({ id: 'c', agentId: 'c', description: 'Hot', contextTokens: 950_000, ...noSteps }),
    agent({ id: 'd', agentId: 'd', description: 'Steps', contextTokens: 950_000 }),
  ]
  await world($, on, seed({}, flow, list))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(100) })
  const bars = (await ui.findAll({ type: 'Text' })).filter(t => /^[█▏▎▍▌▋▊▉░]+$/.test(t.text))
  const colors = bars.map(b => (b.props as { color?: string; dimColor?: boolean }).color)
  expect(colors).toContain('#f6d36b') // amber, ember's first heat color, at 75%
  expect(colors).toContain('#ff5c5c') // red at 95%
  expect(bars.some(b => (b.props as { dimColor?: boolean }).dimColor === true)).toBe(true) // 12% stays dim
  // the steps bar at 95% context keeps its costume color: exactly one bar per heat color
  expect(colors.filter(c => c === '#ff5c5c')).toHaveLength(1)
})

test('the desktop draws no Client: its crabs are the SVGs', async ($, on) => {
  await world($, on, seed())
  for (const component of ['AbovePrompt', 'Pane'] as const) {
    const ui = await $.ui.mount({
      plugin: 'subagent-progress',
      surface: 'desktop',
      component,
      ...(component === 'Pane' ? { requestId: 'subagents' } : {}),
      props: component === 'Pane' ? paneProps(60) : bandProps(100),
    })
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.findAll({ type: 'Client' })).toEqual([])
    await ui.unmount()
  }
})

test('a pane under 24 columns keeps the glyph and draws no crab', async ($, on) => {
  const list = [agent({ id: 'a', agentId: 'a', type: 'general-purpose', description: 'Engineer', model: 'claude-sonnet-5-5', effort: 'high' })]
  await world($, on, seed({}, flow, list))
  const ui = await $.ui.mount({ plugin: 'subagent-progress', surface: 'terminal', component: 'Pane', requestId: 'subagents', props: paneProps(20) })
  expect(await crabs(ui)).toEqual([])
  const mark = (await ui.findAll({ type: 'Text' })).find(t => t.text === '▣')
  expect((mark?.props as { color?: string } | undefined)?.color).toBe('#BA7517')
})
