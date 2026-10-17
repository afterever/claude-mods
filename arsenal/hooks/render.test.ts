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
  /** Holds every `$.command.run` of another command until this resolves. */
  hold?: Promise<void>
}

type World = {
  runs: { command: string; args: string }[]
  registered: string[]
  toasts: string[]
  /** The request `turn.step` reached beneath the plugin. */
  steps: { model: string; effort?: unknown; agentId?: string }[]
  /** prompt-upgrade's value, which a test may flip. */
  auto: { on: boolean }
  /** What `/model` names, which a test may change. */
  model: { value: string }
}

// The world beneath the plugin: the command list, the model, prompt-upgrade's
// switch, and the line and bands other mods draw
function world(on: On, o: Opts = {}): World {
  const w: World = { runs: [], registered: [], toasts: [], steps: [], auto: { on: o.auto ?? false }, model: { value: o.model ?? 'opus' } }
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
      if (o.hold) await o.hold
      return { text: 'ok' }
    })
  }
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

const bandProps = (bodyColumns: number, over: { hasSurvey?: boolean; isWorking?: boolean } = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
  ...over,
})

const hintProps = (isWorking = false) => ({ isDraft: false, isWorking, hint: '? for shortcuts' })

const band = ($: Engine, cols = 100, over: { hasSurvey?: boolean; isWorking?: boolean } = {}, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'arsenal', surface, component: 'AbovePrompt', props: bandProps(cols, over) })

const hint = ($: Engine, isWorking = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'arsenal', surface, component: 'PromptHint', props: hintProps(isWorking) })

/** Opens the menu the way the person does: a press on the footer button. */
async function open($: Engine, isWorking = false) {
  const footer = await hint($, isWorking)
  await footer.press({ key: 'arsenal-toggle' })
  await footer.unmount()
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

test('a session starts with the menu closed: the band is only what the mods beneath draw', async ($, on) => {
  world(on)
  await start($)
  const ui = await band($)
  expect(await ui.find({ key: 'beneath' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('the footer keeps the engine line and adds the button at the right end, closed then open', async ($, on) => {
  world(on)
  await start($)
  const footer = await hint($)
  expect(await footer.find({ key: 'hint-line' })).toBeDefined()
  const button = await footer.find({ key: 'arsenal-toggle' })
  expect((button?.props as { label?: string; variant?: string }).label).toBe('◆ Arsenal ▾')
  expect((button?.props as { variant?: string }).variant).toBe('primary')
  await footer.press({ key: 'arsenal-toggle' })
  const opened = await footer.find({ key: 'arsenal-toggle' })
  expect((opened?.props as { label?: string }).label).toBe('◆ Arsenal ▴')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pressing the button draws the menu above the bands beneath, on ${surface}`, async ($, on) => {
    world(on)
    await start($)
    const footer = await hint($, false, surface)
    await footer.press({ key: 'arsenal-toggle' })
    const ui = await band($, 100, {}, surface)
    expect(await ui.find({ key: 'arsenal-menu' })).toBeDefined()
    // the status mods' bands stay, below the menu
    expect(await ui.find({ key: 'beneath' })).toBeDefined()
    const all = await texts(ui)
    expect(all).toContain('◆  A R S E N A L')
    expect(all).toContain('── S E T T I N G S')
    expect(all).toContain('── L A U N C H')
  })
}

test('pressing the button again closes the menu', async ($, on) => {
  world(on)
  await start($)
  await open($)
  const footer = await hint($)
  await footer.press({ key: 'arsenal-toggle' })
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('/arsenal toggles the menu and was registered to run mid-turn', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.registered).toEqual(['arsenal'])
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeDefined()
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('the ✕ button closes the menu', async ($, on) => {
  world(on)
  await start($)
  await open($)
  const ui = await band($)
  const close = await ui.find({ key: 'arsenal-close' })
  expect((close?.props as { role?: string }).role).toBe('dismiss')
  await ui.press({ key: 'arsenal-close' })
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('a survey takes the band: the open menu yields to it', async ($, on) => {
  world(on)
  await start($)
  await open($)
  const ui = await band($, 100, { hasSurvey: true })
  expect(await ui.find({ key: 'arsenal-menu' })).toBeUndefined()
  expect(await ui.find({ key: 'beneath' })).toBeDefined()
})

test('every Launch row runs its tool’s own command and closes the menu', async ($, on) => {
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
    await open($)
    const ui = await band($)
    await ui.press({ key })
    expect(w.runs[w.runs.length - 1]).toEqual({ command, args })
    expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
  }
  expect(w.runs).toHaveLength(5)
})

test('the Launch rows carry their hotkeys, none on a key another mod’s band uses', async ($, on) => {
  world(on)
  await start($)
  await open($)
  const ui = await band($)
  const hotkeys: Record<string, string> = { 'arsenal-auto': 'p', 'arsenal-upgrade': 'u', 'arsenal-history': 'h', 'arsenal-today': 't', 'arsenal-week': 'w', 'arsenal-settings': 's' }
  for (const [key, hotkey] of Object.entries(hotkeys)) {
    expect(((await ui.find({ key }))?.props as { hotkey?: string }).hotkey).toBe(hotkey)
  }
  // subagent-progress’s band button is on `a`
  expect(Object.values(hotkeys)).not.toContain('a')
})

test('the Prompt Upgrade pill follows prompt-upgrade’s auto value', async ($, on) => {
  const w = world(on, { auto: false })
  await start($)
  await open($)
  expect(await texts(await band($))).toContain(' ○ Off ')
  w.auto.on = true
  expect(await texts(await band($))).toContain(' ● On ')
  expect(await texts(await band($))).not.toContain(' ○ Off ')
})

test('pressing the pill asks /better for the other state and leaves the menu open, the pill unchanged until prompt-upgrade writes', async ($, on) => {
  const w = world(on, { auto: false })
  await start($)
  await open($)
  const ui = await band($)
  await ui.press({ key: 'arsenal-auto' })
  expect(w.runs).toEqual([{ command: 'better', args: 'on' }])
  const after = await band($)
  expect(await after.find({ key: 'arsenal-menu' })).toBeDefined()
  // the value is prompt-upgrade’s: nothing was set optimistically
  expect(await texts(after)).toContain(' ○ Off ')

  w.auto.on = true
  await (await band($)).press({ key: 'arsenal-auto' })
  expect(w.runs[1]).toEqual({ command: 'better', args: 'off' })
})

test('a press during a turn queues: the menu stays open with a note until the command has run', async ($, on) => {
  let release: () => void = () => undefined
  const hold = new Promise<void>(resolve => (release = resolve))
  const w = world(on, { hold })
  await start($)
  await open($, true)
  const ui = await band($, 100, { isWorking: true })
  const pressed = ui.press({ key: 'arsenal-today' })
  for (let i = 0; i < 100 && w.runs.length === 0; i++) await new Promise(r => (globalThis as any).setTimeout(r, 2))
  expect(w.runs).toEqual([{ command: 'report', args: 'today' }])
  const mid = await band($, 100, { isWorking: true })
  expect(await mid.find({ key: 'arsenal-menu' })).toBeDefined()
  expect(await texts(mid)).toContain('queued: /report today')
  release()
  await pressed
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('a command that fails leaves a note in the open menu and a toast when it had closed', async ($, on) => {
  const w = world(on, { fails: true })
  await start($)
  // a switch press keeps the menu open, so the note shows there
  await open($)
  await (await band($)).press({ key: 'arsenal-auto' })
  expect((await texts(await band($))).some(t => t.startsWith('/better on failed: '))).toBe(true)
  // a Launch press closes the menu first, so the failure is a toast
  await (await band($)).press({ key: 'arsenal-history' })
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]?.startsWith('/better history failed: ')).toBe(true)
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('a missing tool takes its rows with it, and the section if none are left', async ($, on) => {
  world(on, { commands: ['report', 'model'] })
  await start($)
  await open($)
  const ui = await band($)
  expect(await ui.find({ key: 'arsenal-today' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-upgrade' })).toBeUndefined()
  const all = await texts(ui)
  expect(all).not.toContain('── S E T T I N G S')
  expect(all).toContain('── L A U N C H')
})

test('with neither tool there is no button and no band', async ($, on) => {
  world(on, { commands: ['model', 'ctx'] })
  await start($)
  const footer = await hint($)
  expect(await footer.find({ key: 'hint-line' })).toBeDefined()
  expect(await footer.find({ key: 'arsenal-toggle' })).toBeUndefined()
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(await (await band($)).find({ key: 'arsenal-menu' })).toBeUndefined()
})

test('the Launch rows are two columns from 64 cells and one below', async ($, on) => {
  world(on)
  await start($)
  await open($)
  expect(await (await band($, 64)).find({ key: 'arsenal-column-1' })).toBeDefined()
  expect(await (await band($, 63)).find({ key: 'arsenal-column-1' })).toBeUndefined()
  expect(await (await band($, 63)).find({ key: 'arsenal-column-0' })).toBeDefined()
})

test('the header names the model from /model until a request says more', async ($, on) => {
  world(on, { model: 'opus' })
  await start($)
  await open($)
  expect(await texts(await band($))).toContain('Opus')
})

test('a main-loop step puts model and effort in the header; a subagent’s step changes nothing', async ($, on) => {
  const w = world(on, { model: 'opus' })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })) void _
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'claude-haiku-5-5', effort: 'low', messageCount: 3, agentId: 'sub' })) void _
  await open($)
  expect(await texts(await band($))).toContain('Opus 5.5 · High')
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
  expect(await texts(await band($))).toContain('Haiku 5.5')
})

test('opening the menu after /model changed the model drops the old effort', async ($, on) => {
  const w = world(on, { model: 'opus' })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })) void _
  // the same family keeps what the last request said
  await open($)
  expect(await texts(await band($))).toContain('Opus 5.5 · High')
  await $.command.run({ command: 'arsenal', args: '' } as any)
  // /model now says sonnet: the header follows it, with no effort to show
  w.model.value = 'sonnet'
  await open($)
  const all = await texts(await band($))
  expect(all).toContain('Sonnet')
  expect(all.some(t => t.includes('High'))).toBe(false)
})
