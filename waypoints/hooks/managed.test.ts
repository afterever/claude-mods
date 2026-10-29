import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// Managed mode. On Team and Enterprise plans a built-in guard runs before every mod and sends
// the system prompt, the classic settings-hook events and the attachment rows on past them, and
// the engine posts a "hook was skipped" line for each. The mod spots it (a turn seen whole with
// neither its system prompt nor its Stop), switches its own /config row to `on`, and then leaves
// those three hooks out, with a fallback for two of them.

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()

type Opts = {
  /** What config.set answers: a deny, as a guard or the engine would refuse the row. */
  deny?: string
  interactive?: boolean
}

function world(on: On, o: Opts = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, { USERPROFILE: 'C:/Users/bats', OS: 'Windows_NT' })
  const toasts: string[] = []
  const sets: any[] = []
  const submitted: any[] = []
  const log = { tail: '' } // what the end of the chat's log reads
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('session.surface', async () => ({ value: 'terminal' }) as any)
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('process.run', async () => ({ value: { exitCode: 0, stdout: log.tail, stderr: '' } }) as any)
  on('tool.register', async () => ({ value: { tool: TOOL } }) as any)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as any)
  on('command.run', { command: 'goal' }, async () => ({}) as any)
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('config.list', async () => ({ value: [] }) as any)
  on('config.set', async (_$, e) => {
    sets.push(e)
    return (o.deny ? { deny: o.deny } : { value: e.value }) as any
  })
  on('prompt.submit', async (_$, e) => {
    submitted.push(e)
    return { text: e.text, context: e.context } as any
  })
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  on('classic.Stop', async () => ({}) as any)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  return { clock, toasts, sets, submitted, log }
}

const start = ($: any, interactive = true) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: interactive })
const compose = ($: any) =>
  $.prompt.compose({ model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
const STOP = { hook_event_name: 'Stop', session_id: 's', transcript_path: 'C:/bats/t.jsonl', cwd: 'C:/bats', stop_hook_active: false } as const
let n = 0
const begin = ($: any) => $.turn.start({ text: 'go', turnId: 'turn-' + ++n } as any)
const end = ($: any, how: Record<string, unknown> = {}) =>
  $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, reason: 'answer', turnId: 'turn-' + n, ...how } as any)
const submit = ($: any, text: string, extra: Record<string, unknown> = {}) => $.prompt.submit({ text, wait: false, ...extra } as any)
const SWITCH = { key: 'waypoints.managed', value: 'on' }

// ---------- auto: spotting the guard ----------

test('a turn with neither the system prompt nor its Stop switches the row to on, and says so', async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await end($)
  expect(w.sets).toEqual([]) // Stop can still be on its way
  await w.clock.advance(5000)
  expect(w.sets).toEqual([expect.objectContaining(SWITCH)])
  expect(w.toasts.at(-1)).toContain('switched to managed mode')
})

test('the next turn\'s start judges a finished turn before the timer does, and only once', async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await end($)
  await begin($)
  expect(w.sets).toHaveLength(1)
  await end($)
  await w.clock.advance(10000)
  expect(w.sets).toHaveLength(1)
})

test('a turn whose Stop arrives, even after the end, is a plan with no guard', async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await end($)
  await $.classic.Stop({ ...STOP, background_tasks: [] } as any)
  await w.clock.advance(5000)
  expect(w.sets).toEqual([])
})

test('a turn whose system prompt reached the mod is a plan with no guard', async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await compose($)
  await end($)
  await w.clock.advance(5000)
  expect(w.sets).toEqual([])
})

test('an interrupted turn, a failed one, or one not seen from its start proves nothing', async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await end($, { isAborted: true, reason: 'aborted' })
  await begin($)
  await end($, { reason: 'error' })
  await w.clock.advance(5000)
  await end($) // no turn.start since the last judgement: a reload mid-turn looks like this
  await w.clock.advance(5000)
  expect(w.sets).toEqual([])
})

test('a subagent\'s turns are not the main turn being watched', async ($, on) => {
  const w = world(on)
  await start($)
  await $.turn.start({ text: 'sub', turnId: 'a-1', agentId: 'agent-1' } as any)
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, reason: 'answer', turnId: 'a-1', agentId: 'agent-1' } as any)
  await w.clock.advance(5000)
  expect(w.sets).toEqual([])
})

test('a refused switch asks the person to set the row', async ($, on) => {
  const w = world(on, { deny: 'managed settings hold this row' })
  await start($)
  await begin($)
  await end($)
  await w.clock.advance(5000)
  expect(w.toasts.at(-1)).toBe('Waypoints: a Team or Enterprise guard skips some of its hooks. Set Managed plan to on in /config to stop the notices')
})

test('off never switches', { options: { managed: 'off' } }, async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await end($)
  await w.clock.advance(5000)
  expect(w.sets).toEqual([])
})

// ---------- on: the hooks left out, and their fallbacks ----------

const MANAGED = { options: { managed: 'on' } }

test('on: the system prompt gets no section, as the hook is not there', MANAGED, async ($, on) => {
  world(on)
  await start($)
  const r: any = await compose($)
  expect(r.sections.map((s: any) => s.id)).toEqual(['intro'])
})

test('on: the standing ask rides beside the first prompt typed, and only that one', MANAGED, async ($, on) => {
  const w = world(on)
  await start($)
  await submit($, '/model', { command: { name: 'model' } })
  await submit($, 'a message from a peer', { isMeta: true })
  await submit($, 'fix the band')
  await submit($, 'and the footer')
  const ctx = w.submitted.map((e) => e.context ?? [])
  expect(ctx[0]).toEqual([])
  expect(ctx[1]).toEqual([])
  expect(ctx[2]).toHaveLength(1)
  expect(ctx[2][0]).toContain(TOOL)
  expect(ctx[2][0]).toContain('3 or more steps')
  expect(ctx[3]).toEqual([])
})

test('on: no ask under -p, nor with /waypoints auto off', MANAGED, async ($, on) => {
  const w = world(on)
  await start($, false)
  await submit($, 'fix the band')
  expect(w.submitted[0].context ?? []).toEqual([])
})

test('on: /waypoints auto off leaves the first prompt alone', MANAGED, async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run({ command: 'waypoints', args: 'auto off' })
  await submit($, 'fix the band')
  expect(w.submitted[0].context ?? []).toEqual([])
})

test('on: the mod never asks to switch, having nothing to watch', MANAGED, async ($, on) => {
  const w = world(on)
  await start($)
  await begin($)
  await end($)
  await w.clock.advance(5000)
  expect(w.sets).toEqual([])
})

const row = (attachment: object, at = NOW + 2000) => JSON.stringify({ type: 'attachment', timestamp: new Date(at).toISOString(), attachment: { type: 'goal_status', ...attachment } })

async function goalRunning($: any, w: ReturnType<typeof world>) {
  await start($)
  await $.command.run({ command: 'goal', args: 'ship the band' } as any)
  await $.tool.call({ tool: TOOL, action: 'plan', tasks: [{ title: 'one', size: 'S' }, { title: 'two', size: 'S' }], tool_use_id: 'p1' })
  await begin($)
  return w
}

test('on: a met verdict in the log when the turn ends finishes the goal', MANAGED, async ($, on) => {
  const w = await goalRunning($, world(on))
  w.log.tail = row({ met: true })
  await end($) // the read runs beside the hook, which does not wait on a process
  await w.clock.advance(1500)
  expect(w.toasts.some((t) => t.startsWith('Goal done in'))).toBe(true)
})

test('on: a verdict that lands while the check still runs is read on a later try', MANAGED, async ($, on) => {
  const w = await goalRunning($, world(on))
  w.log.tail = row({ sentinel: true }, NOW) // the goal's own record, still the newest
  await end($)
  await w.clock.advance(5500)
  expect(w.toasts.some((t) => t.startsWith('Goal done in'))).toBe(false)
  w.log.tail = row({ met: false, reason: 'the footer is still stale' })
  await w.clock.advance(10000)
  const ui = await $.ui.mount({ plugin: 'waypoints', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} } })
  const text = ((await ui.findAll({ type: 'Text' })) as any[]).map((t) => t.text).join('\n')
  await ui.unmount()
  expect(text).toContain('not met yet: the footer is still stale')
})

test('on: an older check\'s verdict is not this turn\'s', MANAGED, async ($, on) => {
  const w = await goalRunning($, world(on))
  w.log.tail = row({ met: true }, NOW - 60000)
  await end($)
  await w.clock.advance(80000)
  expect(w.toasts.some((t) => t.startsWith('Goal done in'))).toBe(false)
})
