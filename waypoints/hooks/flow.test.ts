import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()

type Opts = {
  /** Make tool.register fail, as an engine that refuses the tool would. */
  noTool?: boolean
  stored?: Record<string, unknown>
}

// The world beneath the mod: clock, store, environment, the engine's own prompt
function world(on: On, o: Opts = {}) {
  mock.clock(on, { now: NOW })
  mock.store(on, o.stored ?? {})
  mock.env(on, { USERPROFILE: 'C:/Users/bats' })
  const toasts: string[] = []
  const commands: string[] = []
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('tool.register', async () => {
    if (o.noTool) throw new Error('refused')
    return { value: { tool: TOOL } } as any
  })
  on('command.register', async (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  return { toasts, commands }
}

const start = ($: any) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
// The engine always hands a hook the whole input; a test has to say it all
const compose = ($: any, traits: string[] = []) =>
  $.prompt.compose({ model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits })
const ids = (r: any) => r.sections.map((s: any) => s.id)
const mine = (r: any) => r.sections.find((s: any) => s.id === 'waypoints:plan')

test('the command is /waypoints', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.commands).toEqual(['waypoints'])
})

test('the system prompt asks Claude to plan multi-step work, after the engine\'s own sections', async ($, on) => {
  world(on)
  await start($)
  const r = await compose($)
  expect(ids(r)).toEqual(['intro', 'waypoints:plan'])
  expect(mine(r).scope).toBe('session')
  expect(mine(r).text).toContain(TOOL)
  expect(mine(r).text).toContain('3 or more steps')
})

test('it asks nothing where no one watches the bar or a teammate must not replace the plan', async ($, on) => {
  world(on)
  await start($)
  for (const trait of ['print', 'bare', 'teammate'] as const) {
    const r = await compose($, [trait])
    expect(ids(r)).toEqual(['intro'])
  }
})

test('/waypoints auto off removes the ask and auto on brings it back, kept between sessions', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run({ command: 'waypoints', args: 'auto off' })
  expect(ids(await compose($))).toEqual(['intro'])
  expect(w.toasts.at(-1)).toContain('off')
  await $.command.run({ command: 'waypoints', args: 'auto on' })
  expect(ids(await compose($))).toEqual(['intro', 'waypoints:plan'])
})

test('a session that saved auto off starts without the ask', async ($, on) => {
  world(on, { stored: { settings: { strict: false, auto: false } } })
  await start($)
  expect(ids(await compose($))).toEqual(['intro'])
})

test('it does not ask for a tool that did not register', async ($, on) => {
  world(on, { noTool: true })
  await start($)
  expect(ids(await compose($))).toEqual(['intro'])
})

test('a plan made without /goal is tracked the same way', async ($, on) => {
  world(on)
  await start($)
  const r: any = await $.tool.call({
    tool: TOOL,
    action: 'plan',
    tasks: [{ title: 'read', size: 'S' }, { title: 'write', size: 'M' }],
    tool_use_id: 't1',
  })
  expect(r.result).toContain('Plan: 0 of 2 tasks done')
  const d: any = await $.tool.call({ tool: TOOL, action: 'done', id: 1, tool_use_id: 't2' })
  expect(d.result).toContain('Plan: 1 of 2 tasks done, 33% of the work.')
})
