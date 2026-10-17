import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BOTH = ['better', 'report', 'model', 'ctx']

type Opts = {
  /** The command names the session lists. */
  commands?: string[]
  /** What `$.session.model()` answers. */
  model?: string
  /** Whether prompt-upgrade's `auto` is on. */
  auto?: boolean
  /** Nothing answers `$.command.run` of another command: the engine rejects it. */
  fails?: boolean
  /** The surface does not place the pane. */
  unplaced?: boolean
  /** Panes already open as the session starts (a hot reload). */
  panes?: string[]
}

type World = {
  runs: { command: string; args: string }[]
  registered: string[]
  toasts: string[]
  /** Every open and close, in order: `open arsenal`, `close arsenal`. */
  calls: string[]
  /** The request `turn.step` reached beneath the plugin. */
  steps: { model: string; effort?: unknown; agentId?: string }[]
  /** prompt-upgrade's value, which a test may flip. */
  auto: { on: boolean }
  /** What `/model` names, which a test may change. */
  model: { value: string }
}

// The world beneath the plugin: the command list, the model, prompt-upgrade's
// switch, the panes, and the line and bands other mods draw
function world(on: On, o: Opts = {}): World {
  const w: World = { runs: [], registered: [], toasts: [], calls: [], steps: [], auto: { on: o.auto ?? false }, model: { value: o.model ?? 'opus' } }
  const panes = new Set(o.panes ?? [])
  mock.clock(on, { now: 100_000 })
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('command.register', async (_$, e) => {
    w.registered.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('command.list', async () => ({ value: (o.commands ?? BOTH).map(name => ({ name, description: '', source: 'plugin' })) }) as any)
  on('session.model', async () => ({ value: w.model.value }) as any)
  on('state.get', async (_$, e, next) => ((e as { plugin: string }).plugin === 'prompt-upgrade' ? ({ value: { value: w.auto.on, version: 1 } } as any) : next(e)))
  // a hook that throws is skipped, so a failing command is one nothing answers
  if (!o.fails) {
    on('command.run', async (_$, e) => {
      w.runs.push({ command: e.command, args: e.args })
      return { text: 'ok' }
    })
  }
  on('ui.open', async (_$, e) => {
    w.calls.push(`open ${e.id}`)
    if (o.unplaced) return { value: { isPlaced: false as const, reason: 'narrow' } } as any
    panes.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async (_$, e) => {
    w.calls.push(`close ${e.id}`)
    panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', async () => ({ value: [...panes].map(id => ({ id, title: id, isPlaced: true })) }) as any)
  on('ui.toast', async (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined } as any
  })
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    w.steps.push({ model: e.model, effort: e.effort, agentId: e.agentId })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  // the engine's hint line and the band of a mod beneath this one
  on('ui.render', { component: 'PromptHint' }, ($, e) => h($.ui.resolve(e).Box, { key: 'hint-line' }) as any)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, { key: 'beneath' }) as any)
  return w
}

const start = ($: Engine) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })

type Surface = 'terminal' | 'desktop'

const bandProps = (over: { hasSurvey?: boolean } = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
  ...over,
})

const paneProps = (bodyColumns: number) => ({
  title: 'Arsenal',
  isFocused: false,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 14 },
  view: {},
})

const band = ($: Engine, over: { hasSurvey?: boolean } = {}, surface: Surface = 'terminal') =>
  $.ui.mount({ plugin: 'arsenal', surface, component: 'AbovePrompt', props: bandProps(over) })

const pane = ($: Engine, cols = 48, surface: Surface = 'terminal') =>
  $.ui.mount({ plugin: 'arsenal', surface, component: 'Pane', requestId: 'arsenal', props: paneProps(cols) })

type Mounted = Awaited<ReturnType<typeof pane>>

/** Mounts the pane, hands it to `look` and unmounts it: a pane mounts once at a time. */
async function inPane<T>($: Engine, look: (ui: Mounted) => Promise<T>, cols = 48): Promise<T> {
  const ui = await pane($, cols)
  try {
    return await look(ui)
  } finally {
    await ui.unmount()
  }
}

const hint = ($: Engine) => $.ui.mount({ plugin: 'arsenal', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })

const arrow = async ($: Engine) => ((await (await band($)).find({ key: 'arsenal-toggle' }))?.props as { label?: string } | undefined)?.label

/** Opens the menu the way the person does: a press on the launcher. */
async function open($: Engine) {
  const ui = await band($)
  await ui.press({ key: 'arsenal-toggle' })
  await ui.unmount()
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

test('a session starts with the menu closed: the bands beneath, then the launcher', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await band($)
  expect(await ui.find({ key: 'beneath' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-launcher' })).toBeDefined()
  expect(w.calls).toEqual([])
})

test('the launcher is the band’s last row, after what the mods beneath draw', async ($, on) => {
  world(on)
  await start($)
  const ui = await band($)
  const rows = (await ui.findAll({ type: 'Box' })) as unknown as { props: { key?: string }; key?: string }[]
  const keys = rows.map(r => r.key ?? r.props.key).filter((k): k is string => k === 'beneath' || k === 'arsenal-launcher')
  expect(keys).toEqual(['beneath', 'arsenal-launcher'])
})

test('the launcher is a primary button that opens the menu as a pane, its arrow turning up', async ($, on) => {
  const w = world(on)
  await start($)
  const button = await (await band($)).find({ key: 'arsenal-toggle' })
  expect((button?.props as { label?: string }).label).toBe('◆ Arsenal ▾')
  expect((button?.props as { variant?: string }).variant).toBe('primary')
  await open($)
  expect(w.calls).toEqual(['open arsenal'])
  expect(await arrow($)).toBe('◆ Arsenal ▴')
})

test('the hint line under the status line is left to the engine', async ($, on) => {
  world(on)
  await start($)
  const footer = await hint($)
  expect(await footer.find({ key: 'hint-line' })).toBeDefined()
  expect(await footer.find({ key: 'arsenal-toggle' })).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane draws the menu on ${surface}, and the band keeps no menu`, async ($, on) => {
    world(on)
    await start($)
    await open($)
    const ui = await pane($, 48, surface)
    expect(await ui.find({ key: 'arsenal-menu' })).toBeDefined()
    const all = await texts(ui)
    expect(all).toContain('◆  A R S E N A L')
    expect(all).toContain('── S E T T I N G S')
    expect(all).toContain('── L A U N C H')
    expect(await (await band($, {}, surface)).find({ key: 'arsenal-menu' })).toBeUndefined()
  })
}

test('pressing the launcher again closes the pane', async ($, on) => {
  const w = world(on)
  await start($)
  await open($)
  await (await band($)).press({ key: 'arsenal-toggle' })
  expect(w.calls).toEqual(['open arsenal', 'close arsenal'])
  expect(await arrow($)).toBe('◆ Arsenal ▾')
})

test('/arsenal toggles the pane and was registered to run mid-turn', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.registered).toEqual(['arsenal'])
  await $.command.run({ command: 'arsenal', args: '' } as any)
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(w.calls).toEqual(['open arsenal', 'close arsenal'])
})

test('a pane the surface cannot place leaves the arrow down and says so', async ($, on) => {
  const w = world(on, { unplaced: true })
  await start($)
  await open($)
  expect(await arrow($)).toBe('◆ Arsenal ▾')
  expect(w.toasts).toEqual(['Arsenal needs a wider window to open.'])
})

test('after a hot reload an open pane keeps the arrow up', async ($, on) => {
  world(on, { panes: ['arsenal'] })
  await start($)
  expect(await arrow($)).toBe('◆ Arsenal ▴')
})

test('a survey takes the band: the launcher yields to it', async ($, on) => {
  world(on)
  await start($)
  const ui = await band($, { hasSurvey: true })
  expect(await ui.find({ key: 'arsenal-launcher' })).toBeUndefined()
  expect(await ui.find({ key: 'beneath' })).toBeDefined()
})

test('every Launch row closes the pane, then runs its tool’s own command', async ($, on) => {
  const w = world(on)
  await start($)
  const rows: [string, string, string][] = [
    ['arsenal-upgrade', 'better', ''],
    ['arsenal-history', 'better', 'history'],
    ['arsenal-today', 'report', 'today'],
    ['arsenal-week', 'report', 'week'],
    ['arsenal-settings', 'report', 'settings'],
  ]
  for (const [key, command, args] of rows) {
    w.calls.length = 0
    await open($)
    await inPane($, ui => ui.press({ key }))
    expect(w.runs[w.runs.length - 1]).toEqual({ command, args })
    expect(w.calls).toEqual(['open arsenal', 'close arsenal'])
    expect(await arrow($)).toBe('◆ Arsenal ▾')
  }
  expect(w.runs).toHaveLength(5)
})

test('the menu’s buttons carry their hotkeys, none on a key another mod’s band uses', async ($, on) => {
  world(on)
  await start($)
  await open($)
  const ui = await pane($)
  const hotkeys: Record<string, string> = { 'arsenal-auto': 'p', 'arsenal-upgrade': 'u', 'arsenal-history': 'h', 'arsenal-today': 't', 'arsenal-week': 'w', 'arsenal-settings': 's' }
  for (const [key, hotkey] of Object.entries(hotkeys)) {
    expect(((await ui.find({ key }))?.props as { hotkey?: string }).hotkey).toBe(hotkey)
  }
})

test('the Prompt Upgrade pill follows prompt-upgrade’s auto value', async ($, on) => {
  const w = world(on, { auto: false })
  await start($)
  await open($)
  expect(await inPane($, texts)).toContain(' ○ Off ')
  w.auto.on = true
  expect(await inPane($, texts)).toContain(' ● On ')
  expect(await inPane($, texts)).not.toContain(' ○ Off ')
})

test('pressing the pill asks /better for the other state and keeps the pane open, the pill unchanged until prompt-upgrade writes', async ($, on) => {
  const w = world(on, { auto: false })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-auto' }))
  expect(w.runs).toEqual([{ command: 'better', args: 'on' }])
  expect(w.calls).toEqual(['open arsenal'])
  const after = await inPane($, texts)
  expect(after).toContain('ran: /better on')
  // the value is prompt-upgrade’s: nothing was set optimistically
  expect(after).toContain(' ○ Off ')

  w.auto.on = true
  await inPane($, ui => ui.press({ key: 'arsenal-auto' }))
  expect(w.runs[1]).toEqual({ command: 'better', args: 'off' })
})

test('a command that fails leaves a note in the open pane, or a toast once it has closed', async ($, on) => {
  const w = world(on, { fails: true })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-auto' }))
  expect((await inPane($, texts)).some(t => t.startsWith('/better on failed: '))).toBe(true)
  await inPane($, ui => ui.press({ key: 'arsenal-history' }))
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]?.startsWith('/better history failed: ')).toBe(true)
})

test('a missing tool takes its rows with it, and the section if none are left', async ($, on) => {
  world(on, { commands: ['report', 'model'] })
  await start($)
  await open($)
  const ui = await pane($)
  expect(await ui.find({ key: 'arsenal-today' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-upgrade' })).toBeUndefined()
  const all = await texts(ui)
  expect(all).not.toContain('── S E T T I N G S')
  expect(all).toContain('── L A U N C H')
})

test('with neither tool there is no launcher, and /arsenal opens nothing', async ($, on) => {
  const w = world(on, { commands: ['model', 'ctx'] })
  await start($)
  const ui = await band($)
  expect(await ui.find({ key: 'beneath' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-launcher' })).toBeUndefined()
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(w.calls).toEqual([])
})

test('the Launch rows are two columns from 64 cells and one below', async ($, on) => {
  world(on)
  await start($)
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-column-1' }), 64)).toBeDefined()
  expect(await inPane($, ui => ui.find({ key: 'arsenal-column-1' }), 63)).toBeUndefined()
  expect(await inPane($, ui => ui.find({ key: 'arsenal-column-0' }), 63)).toBeDefined()
})

test('the header names the model from /model until a request says more', async ($, on) => {
  world(on, { model: 'opus' })
  await start($)
  await open($)
  expect(await inPane($, texts)).toContain('Opus')
})

test('a main-loop step puts model and effort in the header; a subagent’s step changes nothing', async ($, on) => {
  const w = world(on, { model: 'opus' })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })) void _
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'claude-haiku-5-5', effort: 'low', messageCount: 3, agentId: 'sub' })) void _
  await open($)
  expect(await inPane($, texts)).toContain('Opus 5.5 · High')
  // the request went down as it came, both times
  expect(w.steps).toEqual([
    { model: 'claude-opus-5-5', effort: 'high', agentId: undefined },
    { model: 'claude-haiku-5-5', effort: 'low', agentId: 'sub' },
  ])
})

test('a model without effort shows the model alone', async ($, on) => {
  const w = world(on, { model: 'claude-haiku-5-5' })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', messageCount: 3 })) void _
  expect(w.steps[0]?.effort).toBeUndefined()
  await open($)
  expect(await inPane($, texts)).toContain('Haiku 5.5')
})

test('opening the menu after /model changed the model drops the old effort', async ($, on) => {
  const w = world(on, { model: 'opus' })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })) void _
  // the same family keeps what the last request said
  await open($)
  expect(await inPane($, texts)).toContain('Opus 5.5 · High')
  await $.command.run({ command: 'arsenal', args: '' } as any)
  // /model now says sonnet: the header follows it, with no effort to show
  w.model.value = 'sonnet'
  await open($)
  const all = await inPane($, texts)
  expect(all).toContain('Sonnet')
  expect(all.some(t => t.includes('High'))).toBe(false)
})
