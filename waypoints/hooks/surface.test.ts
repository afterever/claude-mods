import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// The band through the engine's own element tables. The terminal's table lists `Svg` as well as
// Desktop's, so a band that guesses its surface from the table draws no route on the terminal;
// draw.test.ts, with its own element table, cannot see that.

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()

function world(on: On) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, { USERPROFILE: 'C:/Users/bats' })
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('tool.register', async () => ({ value: { tool: TOOL } }) as any)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as any)
  on('ui.toast', async () => ({ value: undefined }) as any)
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  return clock
}

async function planned($: any, surface: 'terminal' | 'desktop') {
  await $.session.start({ cwd: 'C:/bats', surface, isInteractive: true })
  const call = (o: object, n: number) => $.tool.call({ tool: TOOL, tool_use_id: `t${n}`, ...o })
  await call({ action: 'plan', tasks: [{ title: 'one', size: 'S' }, { title: 'two', size: 'S' }, { title: 'three', size: 'M' }] }, 1)
  await call({ action: 'start', id: 1 }, 2)
  await call({ action: 'done', id: 1 }, 3)
  await call({ action: 'start', id: 2 }, 4)
}

const band = ($: any, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'waypoints', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} } })

test('on the terminal the route is text, and the running node is a Client', async ($, on) => {
  world(on)
  await planned($, 'terminal')
  const ui = await band($, 'terminal')
  const text = ((await ui.findAll({ type: 'Text' })) as any[]).map((t) => t.text).join('')
  expect(text).toContain('●') // the finished start node: the route is drawn
  expect(text).toContain('┄') // a pending leg
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  expect((await ui.findAll({ type: 'Client' })).length).toBeGreaterThan(0)
  await ui.unmount()
})

const DONE = { answer: 'x', durationMs: 1, isAborted: false, reason: 'answer' } as const
const STOP = { hook_event_name: 'Stop', session_id: 's', transcript_path: 'C:/bats/t.jsonl', cwd: 'C:/bats', stop_hook_active: false } as const
const SHELL = { id: 'b1', type: 'shell', status: 'running', description: 'Sleep 40 seconds in background', command: 'sleep 40' }
const AGENT = { id: 'a1', type: 'subagent', status: 'running', description: 'Review the diff', agent_type: 'general-purpose' }

// A turn ends mid-plan, the engine's Stop listing what it left running (either order: both fire at its end)
async function ended($: any, on: On, background: object[], order: 'stop first' | 'complete first' = 'stop first') {
  world(on)
  on('turn.complete', async () => ({ text: '' }) as any)
  on('classic.Stop', async () => ({}) as any)
  await planned($, 'terminal')
  const stop = () => $.classic.Stop({ ...STOP, background_tasks: background } as any)
  const complete = () => $.turn.complete({ ...DONE, turnId: 'turn-1' } as any)
  if (order === 'stop first') {
    await stop()
    await complete()
  } else {
    await complete()
    await stop()
  }
  const ui = await band($, 'terminal')
  const text = ((await ui.findAll({ type: 'Text' })) as any[]).map((t) => t.text).join('\n')
  await ui.unmount()
  return text
}

test('a turn that ends with a background shell running says it waits on the shell, not on the person', async ($, on) => {
  const text = await ended($, on, [SHELL])
  expect(text).toContain('◆ waiting on Sleep 40 seconds in background')
  expect(text).not.toContain('waiting on you')
})

test('a background agent reads the same when the Stop comes before the end of the turn', async ($, on) => {
  const text = await ended($, on, [AGENT], 'stop first')
  expect(text).toContain('◆ waiting on Review the diff')
  expect(text).not.toContain('waiting on you')
})

test('a background agent reads the same when its Stop comes after the end of the turn', async ($, on) => {
  const text = await ended($, on, [AGENT], 'complete first')
  expect(text).toContain('◆ waiting on Review the diff')
  expect(text).not.toContain('waiting on you')
})

test('several background tasks are counted', async ($, on) => {
  expect(await ended($, on, [SHELL, AGENT])).toContain('◆ waiting on 2 background tasks')
})

test('with nothing left running the pause waits on the person again', async ($, on) => {
  const text = await ended($, on, [])
  expect(text).toContain('⏸ paused, waiting on you')
  expect(text).not.toContain('◆ waiting on')
})

test('a new turn forgets what the last one waited on', async ($, on) => {
  world(on)
  on('turn.complete', async () => ({ text: '' }) as any)
  on('classic.Stop', async () => ({}) as any)
  on('turn.start', async () => ({ turnId: 't2' }) as any)
  await planned($, 'terminal')
  await $.classic.Stop({ ...STOP, background_tasks: [SHELL] } as any)
  await $.turn.complete({ ...DONE, turnId: 'turn-1' } as any)
  await $.turn.start({ text: 'carry on', turnId: 't2' } as any)
  await $.turn.complete({ ...DONE, turnId: 't2' } as any)
  const ui = await band($, 'terminal')
  const text = ((await ui.findAll({ type: 'Text' })) as any[]).map((t) => t.text).join('\n')
  await ui.unmount()
  expect(text).toContain('⏸ paused, waiting on you')
})

// A finished plan keeps its band and the footer's `◎ plan done ✓` for RECENT_MS, the `linger` setting
// (1 minute by default). Nothing else redraws an idle session, so the mod has to ask for the redraw
// that drops them.
const SEC = 1000

const footer = ($: any) =>
  $.ui.mount({ plugin: 'waypoints', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })

async function finished($: any, on: On) {
  const clock = world(on)
  on('turn.complete', async () => ({ text: '' }) as any)
  on('ui.render', { component: 'SessionMode' }, async ($, e) => $.ui.resolve(e).Text({ children: [(e.props?.modes ?? []).join(' ')] }) as any)
  await $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
  const call = (o: object, n: number) => $.tool.call({ tool: TOOL, tool_use_id: `t${n}`, ...o })
  await call({ action: 'plan', tasks: [{ title: 'one', size: 'S' }] }, 1)
  await call({ action: 'start', id: 1 }, 2)
  await call({ action: 'done', id: 1 }, 3)
  await $.turn.complete({ ...DONE, turnId: 'turn-1' } as any)
  return clock
}

// The band and the footer label on screen at `before` seconds after the finish and at `after`, with no redraw between
async function lingers($: any, on: On, before: number, after: number) {
  const clock = await finished($, on)
  const ui = await band($, 'terminal')
  const label = await footer($)
  const shown = async (u: any) => ((await u.findAll({ type: 'Text' })) as any[]).map((t) => t.text).join('\n')
  const state = async () => ({ band: (await shown(ui)).includes('done'), label: JSON.stringify(await label.findAll({ type: 'Text' })).includes('plan done') })
  const first = await state()
  await clock.advance(before * SEC)
  const early = await state()
  await clock.advance((after - before) * SEC)
  const late = await state()
  await ui.unmount()
  await label.unmount()
  return { first, early, late }
}

const SHOWN = { band: true, label: true }
const GONE = { band: false, label: false }

test('by default a finished plan is still on screen just before 1 minute and gone just after, with no other redraw', async ($, on) => {
  expect(await lingers($, on, 55, 65)).toEqual({ first: SHOWN, early: SHOWN, late: GONE })
})

test('linger 30 seconds: the band and the footer label go at 30 s', { options: { linger: '30 seconds' } }, async ($, on) => {
  expect(await lingers($, on, 25, 35)).toEqual({ first: SHOWN, early: SHOWN, late: GONE })
})

test('linger 10 minutes: still on screen at 9 minutes, gone at 11', { options: { linger: '10 minutes' } }, async ($, on) => {
  expect(await lingers($, on, 9 * 60, 11 * 60)).toEqual({ first: SHOWN, early: SHOWN, late: GONE })
})

test('a value the setting does not list falls back to 1 minute', { options: { linger: 'forever' } }, async ($, on) => {
  expect(await lingers($, on, 55, 65)).toEqual({ first: SHOWN, early: SHOWN, late: GONE })
})

test('on Desktop the route is one Svg and no Client', async ($, on) => {
  world(on)
  await planned($, 'desktop')
  const ui = await band($, 'desktop')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
  await ui.unmount()
})
