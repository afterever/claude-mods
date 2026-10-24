import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BOTH = ['prompt-upgrade', 'work-report', 'model', 'ctx']

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
  /** The person's home folder; the files of `disk` are found under it. */
  home?: string
  /** `$.session.root()`. */
  root?: string
  /** Every file there is, by absolute path, and its text. A folder is a path with files under it. */
  disk?: Record<string, string>
  /** The commands `$.command.list()` gives as the person's own (`source: 'user'`). */
  own?: { name: string; description?: string }[]
  /** What `git rev-parse` answers; none is a folder outside git. */
  git?: { top: string; common: string }
  /** A git without `--path-format`: the flag is refused, and this is the common dir it prints, relative to the folder. */
  oldGit?: string
  /** What `$.store` holds as the session starts. */
  store?: Record<string, unknown>
  /** `$.store.set` rejects. */
  saveFails?: boolean
  /** What the prompt box holds. */
  draft?: string
  /** The prompt box cannot take text (a dialog holds the keys). */
  cannotFill?: boolean
  /** The sound player never returns (a hung PowerShell). */
  hangs?: boolean
  /** A hook beneath the plugin holds every prompt, as Prompt Upgrade can. */
  holds?: boolean
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
  /** What `$.store` holds now. */
  store: Record<string, unknown>
  /** Every text put in the prompt box. */
  fills: string[]
  /** The rows each `ui.open` asked for. */
  rows: (number | undefined)[]
  /** Every sound player the plugin ran, as its argv. */
  played: string[][]
}

// The fake disk is keyed by Windows paths (`C:/home/...`). Off Windows the
// engine reads those as relative and puts the working folder in front, so cut
// back to the drive letter to get the key the test wrote.
const fake = (path: string) => {
  const slashed = path.replace(/\\/g, '/')
  const drive = slashed.search(/(^|\/)[A-Za-z]:\//)
  return drive < 0 ? slashed : slashed.slice(slashed[drive] === '/' ? drive + 1 : drive)
}

// The world beneath the plugin: the command list, the model, prompt-upgrade's
// switch, the panes, and the line and footer other mods draw
function world(on: On, o: Opts = {}): World {
  const w: World = { runs: [], registered: [], toasts: [], calls: [], steps: [], auto: { on: o.auto ?? false }, model: { value: o.model ?? 'opus' }, store: { ...o.store }, fills: [], rows: [], played: [] }
  const panes = new Set(o.panes ?? [])
  const draft = { text: o.draft ?? '' }
  const disk = o.disk ?? {}
  mock.clock(on, { now: 100_000 })
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('command.register', async (_$, e) => {
    w.registered.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('command.list', async () => {
    const tools = (o.commands ?? BOTH).map(name => ({ name, description: '', source: 'plugin' }))
    const own = (o.own ?? []).map(c => ({ name: c.name, description: c.description ?? `about ${c.name}`, source: 'user' }))
    return { value: [...tools, ...own] } as any
  })
  // the folders and files of the person's own commands, and the git around them
  on('env.get', async (_$, e) => ({ value: e.name === 'USERPROFILE' ? (o.home ?? 'C:/home') : e.name === 'OS' ? 'Windows_NT' : undefined }) as any)
  // the system's sounds are all there; the person's folder is whatever `disk` holds
  on('fs.exists', async (_$, e) => ({ value: fake(e.path).startsWith('C:/Windows/Media/') || fake(e.path) in disk }) as any)
  on('session.root', async () => ({ value: o.root ?? 'C:/bats' }) as any)
  on('fs.list', async (_$, e) => {
    const below = `${fake(e.path).replace(/\/+$/, '')}/`
    const entries = new Map<string, 'file' | 'dir'>()
    for (const path of Object.keys(disk)) {
      if (!path.startsWith(below)) continue
      const [first = '', ...more] = path.slice(below.length).split('/')
      entries.set(first, more.length ? 'dir' : 'file')
    }
    if (!entries.size) throw new Error('ENOENT')
    return { value: [...entries].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) } as any
  })
  on('fs.read', async (_$, e) => {
    const text = disk[fake(e.path)]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text } as any
  })
  on('process.run', async (_$, e) => {
    // the sound player: logged, and answered as played
    if (e.argv[0] === 'powershell' || e.argv[0] === 'afplay') {
      w.played.push([...e.argv])
      if (o.hangs) return new Promise(() => {}) as any
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
    }
    const git = o.git
    const refused = { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }
    if (!git) return refused as any
    const flag = e.argv[2]
    const answer = (stdout: string) => ({ value: { exitCode: 0, stdout: `${stdout}\n`, stderr: '' } })
    if (flag === '--show-toplevel') return answer(git.top) as any
    if (flag === '--path-format=absolute') return (o.oldGit ? { value: { exitCode: 129, stdout: '', stderr: 'unknown option' } } : answer(git.common)) as any
    if (flag === '--git-common-dir') return answer(o.oldGit ?? git.common) as any
    return refused as any
  })
  on('store.get', async (_$, e) => ({ value: w.store[e.key] }) as any)
  on('store.set', async (_$, e) => {
    if (o.saveFails) throw new Error('disk full')
    w.store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined } as any
  })
  on('prompt.read', async () => ({ value: { text: draft.text, cursor: draft.text.length } }) as any)
  on('prompt.fill', async (_$, e) => {
    if (o.cannotFill) return { isFilled: false }
    w.fills.push(e.text)
    draft.text = e.text
    return { isFilled: true }
  })
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
    w.rows.push(e.rows)
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
  // what the engine does beneath the plugin when a reply ends, a tool is called and a notice comes
  on('turn.complete', async (_$, e) => ({ text: e.answer }) as any)
  on('tool.call', async () => ({ result: 'ok', ref: 0, text: 'ok' }) as any)
  on('classic.Notification', async () => ({}) as any)
  // and a prompt the person sends
  on('prompt.submit', async (_$, e) => (o.holds ? { drop: 'held' } : { text: e.text }) as any)
  on('turn.step', async function* (_$, e) {
    w.steps.push({ model: e.model, effort: e.effort, agentId: e.agentId })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  // the engine's hint line and its footer (the node the labels of other mods,
  // waypoints' plan among them, are already in)
  on('ui.render', { component: 'PromptHint' }, ($, e) => h($.ui.resolve(e).Box, { key: 'hint-line' }) as any)
  on('ui.render', { component: 'SessionMode' }, ($, e) => h($.ui.resolve(e).Box, { key: 'engine-footer' }) as any)
  return w
}

const start = ($: Engine) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })

type Surface = 'terminal' | 'desktop'

const paneProps = (bodyColumns: number) => ({
  title: 'Arsenal',
  isFocused: false,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 14 },
  view: {},
})

const footer = ($: Engine, surface: Surface = 'terminal') =>
  $.ui.mount({ plugin: 'arsenal', surface, component: 'SessionMode', props: { modes: [] } })

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

const arrow = async ($: Engine) => ((await (await footer($)).find({ key: 'arsenal-toggle' }))?.props as { label?: string } | undefined)?.label

/** Opens the menu the way the person does: a press on the launcher. */
async function open($: Engine) {
  const ui = await footer($)
  await ui.press({ key: 'arsenal-toggle' })
  await ui.unmount()
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

test('a session starts with the menu closed: the launcher in the footer, the engine’s footer wrapped after it', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await footer($)
  expect(await ui.find({ key: 'arsenal-launcher' })).toBeDefined()
  expect(await ui.find({ key: 'engine-footer' })).toBeDefined()
  expect(w.calls).toEqual([])
})

test('the launcher comes first on the row, a space before what the engine’s footer holds', async ($, on) => {
  world(on)
  await start($)
  const ui = await footer($)
  const rows = (await ui.findAll({ type: 'Box' })) as unknown as { props: { key?: string }; key?: string }[]
  const keys = rows.map(r => r.key ?? r.props.key).filter((k): k is string => k === 'engine-footer' || k === 'arsenal-launcher')
  expect(keys).toEqual(['arsenal-launcher', 'engine-footer'])
  expect(await texts(ui)).toEqual(['[ ◆ Arsenal ▾ ]', ' '])
})

test('the launcher is a plain button in Claude’s orange that opens the menu as a pane, its arrow turning up', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await footer($)
  const button = await ui.find({ key: 'arsenal-toggle' })
  expect((button?.props as { label?: string }).label).toBe('◆ Arsenal ▾')
  expect((button?.props as { plain?: boolean }).plain).toBe(true)
  const drawn = (button as unknown as { children: { props: { color?: string }; children: string[] }[] }).children[0]
  expect(drawn.children).toEqual(['[ ◆ Arsenal ▾ ]'])
  expect(drawn.props.color).toBe('claude')
  await open($)
  expect(w.calls).toEqual(['open arsenal'])
  expect(await arrow($)).toBe('◆ Arsenal ▴')
})

test('the hint line under the status line is left to the engine', async ($, on) => {
  world(on)
  await start($)
  const line = await hint($)
  expect(await line.find({ key: 'hint-line' })).toBeDefined()
  expect(await line.find({ key: 'arsenal-toggle' })).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane draws the menu on ${surface}, and the footer keeps no menu`, async ($, on) => {
    world(on)
    await start($)
    await open($)
    const ui = await pane($, 48, surface)
    expect(await ui.find({ key: 'arsenal-menu' })).toBeDefined()
    const all = await texts(ui)
    expect(all).toContain('◆  A R S E N A L')
    expect(all).toContain('── S E T T I N G S')
    expect(all).toContain('── L A U N C H')
    expect(await (await footer($, surface)).find({ key: 'arsenal-menu' })).toBeUndefined()
  })
}

test('pressing the launcher again closes the pane', async ($, on) => {
  const w = world(on)
  await start($)
  await open($)
  await (await footer($)).press({ key: 'arsenal-toggle' })
  expect(w.calls).toEqual(['open arsenal', 'close arsenal'])
  expect(await arrow($)).toBe('◆ Arsenal ▾')
})

test('/arsenal toggles the pane and was registered to run mid-turn', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.registered).toEqual(['arsenal', 'chime'])
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

test('the launcher draws on the desktop as well', async ($, on) => {
  world(on)
  await start($)
  const ui = await footer($, 'desktop')
  expect(await ui.find({ key: 'arsenal-toggle' })).toBeDefined()
  expect(await ui.find({ key: 'engine-footer' })).toBeDefined()
})

test('every Launch row closes the pane, then runs its tool’s own command', async ($, on) => {
  const w = world(on)
  await start($)
  const rows: [string, string, string][] = [
    ['arsenal-upgrade', 'prompt-upgrade', ''],
    ['arsenal-history', 'prompt-upgrade', 'history'],
    ['arsenal-today', 'work-report', 'today'],
    ['arsenal-week', 'work-report', 'week'],
    ['arsenal-settings', 'work-report', 'settings'],
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
  // two switches draw a pill: Prompt Upgrade's and the chime's, which is off
  const pills = async (pill: string) => (await inPane($, texts)).filter(t => t === pill).length
  expect(await pills(' ○ Off ')).toBe(2)
  w.auto.on = true
  expect(await pills(' ● On ')).toBe(1)
  expect(await pills(' ○ Off ')).toBe(1)
})

test('pressing the pill asks /prompt-upgrade for the other state and keeps the pane open, the pill unchanged until prompt-upgrade writes', async ($, on) => {
  const w = world(on, { auto: false })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-auto' }))
  expect(w.runs).toEqual([{ command: 'prompt-upgrade', args: 'on' }])
  expect(w.calls).toEqual(['open arsenal'])
  const after = await inPane($, texts)
  expect(after).toContain('ran: /prompt-upgrade on')
  // the value is prompt-upgrade’s: nothing was set optimistically
  expect(after).toContain(' ○ Off ')

  w.auto.on = true
  await inPane($, ui => ui.press({ key: 'arsenal-auto' }))
  expect(w.runs[1]).toEqual({ command: 'prompt-upgrade', args: 'off' })
})

test('a command that fails leaves a note in the open pane, or a toast once it has closed', async ($, on) => {
  const w = world(on, { fails: true })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-auto' }))
  expect((await inPane($, texts)).some(t => t.startsWith('/prompt-upgrade on failed: '))).toBe(true)
  await inPane($, ui => ui.press({ key: 'arsenal-history' }))
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]?.startsWith('/prompt-upgrade history failed: ')).toBe(true)
})

test('a missing tool takes its rows with it, and the section if none are left', async ($, on) => {
  world(on, { commands: ['work-report', 'model'] })
  await start($)
  await open($)
  const ui = await pane($)
  expect(await ui.find({ key: 'arsenal-today' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-upgrade' })).toBeUndefined()
  const all = await texts(ui)
  // SETTINGS stays: the chime needs no tool, so only Prompt Upgrade goes
  expect(all).toContain('── S E T T I N G S')
  expect(all).not.toContain('Prompt Upgrade')
  expect(all).toContain('── L A U N C H')
})

test('with neither tool the launcher and SETTINGS still draw, and /arsenal opens the menu', async ($, on) => {
  const w = world(on, { commands: ['model', 'ctx'] })
  await start($)
  const ui = await footer($)
  expect(await ui.find({ key: 'engine-footer' })).toBeDefined()
  expect(await ui.find({ key: 'arsenal-launcher' })).toBeDefined()
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(w.calls).toEqual(['open arsenal'])
  const all = await inPane($, texts)
  expect(all).toContain('── S E T T I N G S')
  expect(all).toContain('Sound notifications')
  expect(all).not.toContain('Prompt Upgrade')
  expect(all).not.toContain('── L A U N C H')
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

// ── USER and PROJECT ─────────────────────────────────────────────────────

const fm = (description: string, hint = '') => `---\ndescription: ${description}\n${hint ? `argument-hint: "${hint}"\n` : ''}---\nbody\n`

/** /handoff (a skill with a hint) and /standup under USER, /seed-db under PROJECT. */
const OWN: Opts = {
  disk: {
    'C:/home/.claude/skills/handoff/SKILL.md': fm('Save a handoff', '[list|archive]'),
    'C:/home/.claude/commands/standup.md': fm('Yesterday'),
    'C:/bats/.claude/commands/seed-db.md': fm('Reset the local data'),
  },
  own: [{ name: 'handoff', description: 'Save a handoff' }, { name: 'standup', description: 'Yesterday' }, { name: 'seed-db', description: 'Reset the local data' }],
}

const label = async (ui: Mounted, key: string) => ((await ui.find({ key }))?.props as { label?: string } | undefined)?.label

test('an empty section is not drawn', async ($, on) => {
  world(on)
  await start($)
  await open($)
  const all = await inPane($, texts)
  expect(all).toContain('── L A U N C H')
  expect(all.some(t => t.includes('U S E R') || t.includes('P R O J E C T'))).toBe(false)
})

test('USER and PROJECT follow LAUNCH, each row a bare command with a … only where it takes arguments', async ($, on) => {
  world(on, OWN)
  await start($)
  await open($)
  const ui = await pane($)
  try {
    const all = await texts(ui)
    const at = (t: string) => all.indexOf(t)
    expect(at('── L A U N C H')).toBeGreaterThan(-1)
    expect(at('── U S E R')).toBeGreaterThan(at('── L A U N C H'))
    expect(at('── P R O J E C T')).toBeGreaterThan(at('── U S E R'))
    expect(all).toContain('/handoff')
    expect(all).toContain('/seed-db')
    expect(await ui.find({ key: 'arsenal-user-run-handoff' })).toBeDefined()
    expect(await ui.find({ key: 'arsenal-user-more-handoff' })).toBeDefined()
    expect(await ui.find({ key: 'arsenal-user-more-standup' })).toBeUndefined()
    expect(await ui.find({ key: 'arsenal-project-run-seed-db' })).toBeDefined()
    // no hotkeys on these rows; LAUNCH keeps its own
    expect(((await ui.find({ key: 'arsenal-user-run-standup' }))?.props as { hotkey?: string }).hotkey).toBeUndefined()
    expect(((await ui.find({ key: 'arsenal-upgrade' }))?.props as { hotkey?: string }).hotkey).toBe('u')
  } finally {
    await ui.unmount()
  }
})

test('only what the engine lists as the person’s own is drawn', async ($, on) => {
  world(on, { ...OWN, own: [{ name: 'standup' }] })
  await start($)
  await open($)
  const ui = await pane($)
  try {
    expect(await ui.find({ key: 'arsenal-user-run-standup' })).toBeDefined()
    expect(await ui.find({ key: 'arsenal-user-run-handoff' })).toBeUndefined()
    expect(await ui.find({ key: 'arsenal-project-run-seed-db' })).toBeUndefined()
  } finally {
    await ui.unmount()
  }
})

test('a row press closes the pane and runs the bare command', async ($, on) => {
  const w = world(on, OWN)
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-user-run-handoff' }))
  expect(w.runs).toEqual([{ command: 'handoff', args: '' }])
  expect(w.calls).toEqual(['open arsenal', 'close arsenal'])
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-project-run-seed-db' }))
  expect(w.runs[1]).toEqual({ command: 'seed-db', args: '' })
})

test('… puts the command in an empty box, closing the pane first', async ($, on) => {
  const w = world(on, OWN)
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-user-more-handoff' }))
  expect(w.fills).toEqual(['/handoff '])
  expect(w.runs).toEqual([])
  expect(w.toasts).toEqual([])
  expect(w.calls).toEqual(['open arsenal', 'close arsenal'])
})

test('… never writes over a draft', async ($, on) => {
  const w = world(on, { ...OWN, draft: 'fix the build and' })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-user-more-handoff' }))
  expect(w.fills).toEqual([])
  expect(w.toasts).toEqual(['Clear the prompt box to fill /handoff.'])
})

test('… says so when the box cannot take the text', async ($, on) => {
  const w = world(on, { ...OWN, cannotFill: true })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-user-more-handoff' }))
  expect(w.toasts).toEqual(['Could not fill the prompt box.'])
})

test('✎ edit shows every command with a pill, a press flips it at once and saves it, ✓ done goes back', async ($, on) => {
  const w = world(on, OWN)
  await start($)
  await open($)
  const ui = await pane($)
  try {
    expect(await label(ui, 'arsenal-user-edit')).toBe('✎ edit')
    await ui.press({ key: 'arsenal-user-edit' })
    expect(await label(ui, 'arsenal-user-edit')).toBe('✓ done')
    // in edit mode a row runs nothing: there are pills, not run buttons
    expect(await ui.find({ key: 'arsenal-user-run-standup' })).toBeUndefined()
    expect((await texts(ui)).filter(t => t === ' ● On ').length).toBeGreaterThanOrEqual(2)

    await ui.press({ key: 'arsenal-user-pill-standup' })
    expect(w.store.off).toEqual({ version: 1, user: ['standup'], project: {} })
    expect(w.runs).toEqual([])
    // still listed in edit mode, now Off
    expect(await ui.find({ key: 'arsenal-user-pill-standup' })).toBeDefined()
    expect(await texts(ui)).toContain(' ○ Off ')

    await ui.press({ key: 'arsenal-user-edit' })
    expect(await label(ui, 'arsenal-user-edit')).toBe('✎ edit')
    expect(await ui.find({ key: 'arsenal-user-run-standup' })).toBeUndefined()
    expect(await ui.find({ key: 'arsenal-user-run-handoff' })).toBeDefined()

    // and on again
    await ui.press({ key: 'arsenal-user-edit' })
    await ui.press({ key: 'arsenal-user-pill-standup' })
    expect(w.store.off).toEqual({ version: 1, user: [], project: {} })
  } finally {
    await ui.unmount()
  }
})

test('one section is in edit mode at a time, and closing the pane leaves it', async ($, on) => {
  world(on, OWN)
  await start($)
  await open($)
  const ui = await pane($)
  try {
    await ui.press({ key: 'arsenal-user-edit' })
    await ui.press({ key: 'arsenal-project-edit' })
    expect(await label(ui, 'arsenal-user-edit')).toBe('✎ edit')
    expect(await label(ui, 'arsenal-project-edit')).toBe('✓ done')
  } finally {
    await ui.unmount()
  }
  await $.command.run({ command: 'arsenal', args: '' } as any)
  await open($)
  const again = await pane($)
  try {
    expect(await label(again, 'arsenal-project-edit')).toBe('✎ edit')
  } finally {
    await again.unmount()
  }
})

test('a section whose commands are all off keeps its header, ✎ edit and an all off line', async ($, on) => {
  world(on, { ...OWN, store: { off: { version: 1, user: ['handoff', 'standup'], project: {} } } })
  await start($)
  await open($)
  const ui = await pane($)
  try {
    const all = await texts(ui)
    expect(all).toContain('── U S E R')
    expect(all).toContain('  all off')
    expect(await label(ui, 'arsenal-user-edit')).toBe('✎ edit')
    expect(await ui.find({ key: 'arsenal-user-run-handoff' })).toBeUndefined()
    // PROJECT is untouched by USER's list
    expect(await ui.find({ key: 'arsenal-project-run-seed-db' })).toBeDefined()
  } finally {
    await ui.unmount()
  }
})

test('what was turned off is still off in the next session, and new commands are on', async ($, on) => {
  world(on, { ...OWN, store: { off: { version: 1, user: ['standup', 'long-gone'], project: {} } } })
  await start($)
  await open($)
  const ui = await pane($)
  try {
    expect(await ui.find({ key: 'arsenal-user-run-standup' })).toBeUndefined()
    expect(await ui.find({ key: 'arsenal-user-run-handoff' })).toBeDefined()
  } finally {
    await ui.unmount()
  }
})

test('a saved list that makes no sense is no list', async ($, on) => {
  world(on, { ...OWN, store: { off: 'everything' } })
  await start($)
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-user-run-standup' }))).toBeDefined()
})

test('a save that fails is a toast, and the pill still follows for the session', async ($, on) => {
  const w = world(on, { ...OWN, saveFails: true })
  await start($)
  await open($)
  const ui = await pane($)
  try {
    await ui.press({ key: 'arsenal-user-edit' })
    await ui.press({ key: 'arsenal-user-pill-standup' })
    expect(w.toasts).toEqual(['Could not save which commands are off.'])
    expect(await texts(ui)).toContain(' ○ Off ')
  } finally {
    await ui.unmount()
  }
})

test('PROJECT is the repo: found from a subfolder, with one off list for every checkout of it', async ($, on) => {
  const repo = {
    root: 'C:/work/repo/sub',
    git: { top: 'C:/work/repo', common: 'C:/work/repo/.git' },
    disk: { 'C:/work/repo/.claude/commands/deploy.md': fm('Ship it') },
    own: [{ name: 'deploy', description: 'Ship it' }],
  }
  const w = world(on, repo)
  await start($)
  await open($)
  await inPane($, async ui => {
    await ui.press({ key: 'arsenal-project-edit' })
    await ui.press({ key: 'arsenal-project-pill-deploy' })
  })
  // keyed by the shared .git folder: not the subfolder, not this checkout’s top
  expect(w.store.off).toEqual({ version: 1, user: [], project: { 'c:/work/repo/.git': ['deploy'] } })
})

test('a worktree of that repo has the same command off', async ($, on) => {
  world(on, {
    root: 'C:/work/repo-wt',
    git: { top: 'C:/work/repo-wt', common: 'C:/work/repo/.git' },
    disk: { 'C:/work/repo-wt/.claude/commands/deploy.md': fm('Ship it') },
    own: [{ name: 'deploy', description: 'Ship it' }],
    store: { off: { version: 1, user: [], project: { 'c:/work/repo/.git': ['deploy'] } } },
  })
  await start($)
  await open($)
  const ui = await pane($)
  try {
    expect(await ui.find({ key: 'arsenal-project-run-deploy' })).toBeUndefined()
    expect(await texts(ui)).toContain('  all off')
  } finally {
    await ui.unmount()
  }
})

test('another repo’s list does not turn this repo’s command off', async ($, on) => {
  world(on, {
    root: 'C:/work/other',
    git: { top: 'C:/work/other', common: 'C:/work/other/.git' },
    disk: { 'C:/work/other/.claude/commands/deploy.md': fm('Ship it') },
    own: [{ name: 'deploy' }],
    store: { off: { version: 1, user: [], project: { 'c:/work/repo/.git': ['deploy'] } } },
  })
  await start($)
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-project-run-deploy' }))).toBeDefined()
})

test('an older git’s relative common dir gives the same key', async ($, on) => {
  const w = world(on, {
    root: 'C:/work/repo/sub',
    git: { top: 'C:/work/repo', common: 'C:/work/repo/.git' },
    oldGit: '../.git',
    disk: { 'C:/work/repo/.claude/commands/deploy.md': fm('Ship it') },
    own: [{ name: 'deploy' }],
  })
  await start($)
  await open($)
  await inPane($, async ui => {
    await ui.press({ key: 'arsenal-project-edit' })
    await ui.press({ key: 'arsenal-project-pill-deploy' })
  })
  expect(w.store.off).toEqual({ version: 1, user: [], project: { 'c:/work/repo/.git': ['deploy'] } })
})

test('in the home folder everything is USER and there is no PROJECT', async ($, on) => {
  world(on, { root: 'C:/home', disk: { 'C:/home/.claude/commands/standup.md': fm('Yesterday') }, own: [{ name: 'standup' }] })
  await start($)
  await open($)
  const all = await inPane($, texts)
  expect(all).toContain('── U S E R')
  expect(all.some(t => t.includes('P R O J E C T'))).toBe(false)
})

test('a name in both places is drawn under USER only', async ($, on) => {
  world(on, {
    disk: { 'C:/home/.claude/commands/handoff.md': fm('Global'), 'C:/bats/.claude/commands/handoff.md': fm('Project') },
    own: [{ name: 'handoff' }],
  })
  await start($)
  await open($)
  const ui = await pane($)
  try {
    expect(await ui.find({ key: 'arsenal-user-run-handoff' })).toBeDefined()
    expect(await ui.find({ key: 'arsenal-project-run-handoff' })).toBeUndefined()
    expect((await texts(ui)).some(t => t.includes('P R O J E C T'))).toBe(false)
  } finally {
    await ui.unmount()
  }
})

test('a skill added mid-session shows up when the menu opens again', async ($, on) => {
  const disk: Record<string, string> = { 'C:/home/.claude/commands/standup.md': fm('Yesterday') }
  const own = [{ name: 'standup' }]
  world(on, { disk, own })
  await start($)
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-user-run-deploy' }))).toBeUndefined()
  await $.command.run({ command: 'arsenal', args: '' } as any)
  disk['C:/home/.claude/commands/deploy.md'] = fm('Ship it')
  own.push({ name: 'deploy' })
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-user-run-deploy' }))).toBeDefined()
})

test('the launcher shows for commands of the person’s own with neither tool, even when all are off', async ($, on) => {
  const w = world(on, { ...OWN, commands: ['model', 'ctx'] })
  await start($)
  expect(await arrow($)).toBe('◆ Arsenal ▾')
  await $.command.run({ command: 'arsenal', args: '' } as any)
  expect(w.calls).toEqual(['open arsenal'])
  const all = await inPane($, texts)
  expect(all).not.toContain('── L A U N C H')
  // SETTINGS is always there: the chime needs no tool
  expect(all).toContain('── S E T T I N G S')
  expect(all).toContain('── U S E R')
})

test('every own command off still leaves the launcher, so edit mode is reachable', async ($, on) => {
  world(on, { ...OWN, commands: ['model'], store: { off: { version: 1, user: ['handoff', 'standup'], project: { 'c:/bats': ['seed-db'] } } } })
  await start($)
  expect(await arrow($)).toBe('◆ Arsenal ▾')
})

test('the pane asks for as many rows as the menu has lines', async ($, on) => {
  const many = Array.from({ length: 12 }, (_, i) => `cmd${i}`)
  const w = world(on, { disk: Object.fromEntries(many.map(n => [`C:/home/.claude/commands/${n}.md`, fm(n)])), own: many.map(name => ({ name })) })
  await start($)
  await open($)
  expect(w.calls).toEqual(['open arsenal'])
  // 2 header + 5 settings + 6 launch + 13 user + 1 note, and 2 of slack
  expect(w.rows).toEqual([29])
})

test('nothing found and nothing broken: no folders, no git, no home', async ($, on) => {
  world(on, { home: '', disk: {} })
  await start($)
  await open($)
  const all = await inPane($, texts)
  expect(all.some(t => t.includes('U S E R') || t.includes('P R O J E C T'))).toBe(false)
})

// ── Sound notifications ──────────────────────────────────────────────────

const SOUNDS_DIR = 'C:/home/.claude/arsenal/sounds'
const ON = { chime: { version: 1, isOn: true, sound: '' } }

/** `/chime <args>`, answered with the text the command gave back. */
const chime = async ($: Engine, args: string) => ((await $.command.run({ command: 'chime', args } as any)) as { text?: string }).text ?? ''

test('/chime is registered to run mid-turn, and on and off are saved', async ($, on) => {
  const w = world(on)
  await start($)
  await chime($, 'on')
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '' })
  await chime($, 'off')
  expect(w.store.chime).toEqual({ version: 1, isOn: false, sound: '' })
})

test('a session loads the saved chime and its sound', async ($, on) => {
  world(on, { store: { chime: { version: 1, isOn: true, sound: 'Windows Ding' } } })
  await start($)
  const said = await chime($, '')
  expect(said).toContain('**on**')
  expect(said).toContain('Windows Ding')
})

test('garbage in the store is the chime off', async ($, on) => {
  world(on, { store: { chime: 'x' } })
  await start($)
  expect(await chime($, '')).toContain('**off**')
})

test('/chime sound saves a name and plays it', async ($, on) => {
  const w = world(on)
  await start($)
  await chime($, 'sound windows ding')
  expect(w.store.chime).toEqual({ version: 1, isOn: false, sound: 'Windows Ding' })
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Ding.wav')
})

test('/chime sound with a name that is not there saves nothing, plays nothing and lists the names', async ($, on) => {
  const w = world(on)
  await start($)
  const said = await chime($, 'sound nope')
  expect(w.store.chime).toBeUndefined()
  expect(w.played).toEqual([])
  expect(said).toContain('Windows Ding')
})

test('/chime test plays the chosen sound even while the chime is off', async ($, on) => {
  const w = world(on)
  await start($)
  await chime($, 'test')
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Notify Messaging.wav')
})

test('the sounds folder lists wav files by name, question.wav among them; other files are not choices', async ($, on) => {
  world(on, { disk: { [`${SOUNDS_DIR}/mine.wav`]: '', [`${SOUNDS_DIR}/question.wav`]: '', [`${SOUNDS_DIR}/notes.txt`]: '' } })
  await start($)
  const said = await chime($, '')
  expect(said).toContain('Sounds: mine, question, Windows Notify Messaging')
  expect(said).not.toContain('notes')
})

test('no sounds folder at all still lists the system’s sounds', async ($, on) => {
  world(on, { disk: {} })
  await start($)
  expect(await chime($, '')).toContain('Sounds: Windows Notify Messaging')
})

// ── The SETTINGS rows ────────────────────────────────────────────────────

/** What the switch's pill says: ` ● On ` or ` ○ Off `. */
const chimePill = async (ui: Mounted) =>
  ((await ui.find({ key: 'arsenal-chime-switch' })) as unknown as { children: { children: string[] }[] } | undefined)?.children[0]?.children[0]

const soundLabel = async (ui: Mounted) => (await texts(ui)).find(t => t.includes('Windows') || t.includes('mine'))

test('the Sound notifications switch follows the chime, and a press saves it', async ($, on) => {
  const w = world(on)
  await start($)
  await open($)
  expect(await inPane($, chimePill)).toBe(' ○ Off ')
  await inPane($, ui => ui.press({ key: 'arsenal-chime-switch' }))
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '' })
  expect(await inPane($, chimePill)).toBe(' ● On ')
  await inPane($, ui => ui.press({ key: 'arsenal-chime-switch' }))
  expect(w.store.chime).toEqual({ version: 1, isOn: false, sound: '' })
  expect(w.runs).toEqual([])
})

test('the chime’s keys are c, o and m', async ($, on) => {
  world(on, { store: ON })
  await start($)
  await open($)
  const ui = await pane($)
  expect(((await ui.find({ key: 'arsenal-chime-switch' }))?.props as { hotkey?: string }).hotkey).toBe('c')
  expect(((await ui.find({ key: 'arsenal-chime-sound' }))?.props as { hotkey?: string }).hotkey).toBe('o')
  expect(((await ui.find({ key: 'arsenal-chime-sent' }))?.props as { hotkey?: string }).hotkey).toBe('m')
})

test('the Sound row is there only while the chime is on, and names the default', async ($, on) => {
  world(on)
  await start($)
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-chime-sound' }))).toBeUndefined()
  await inPane($, ui => ui.press({ key: 'arsenal-chime-switch' }))
  const ui = await pane($)
  try {
    expect(await ui.find({ key: 'arsenal-chime-sound' })).toBeDefined()
    expect(await soundLabel(ui)).toContain('Windows Notify Messaging')
  } finally {
    await ui.unmount()
  }
})

test('a press on Sound saves the next sound and plays it', async ($, on) => {
  const w = world(on, { store: ON, disk: { [`${SOUNDS_DIR}/mine.wav`]: '' } })
  await start($)
  await open($)
  // the list is mine, Windows Notify Messaging, …; the default is the second
  await inPane($, ui => ui.press({ key: 'arsenal-chime-sound' }))
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: 'Windows Notify System Generic' })
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Notify System Generic.wav')
})

test('a saved sound that is gone shows the default’s name', async ($, on) => {
  world(on, { store: { chime: { version: 1, isOn: true, sound: 'gone' } } })
  await start($)
  await open($)
  expect(await inPane($, soundLabel)).toContain('Windows Notify Messaging')
})

/** The words on the Sent row's button. */
const sentLabel = async (ui: Mounted) => (await texts(ui)).find(t => t.endsWith('▸') && !t.includes('Windows Notify Messaging ▸'))

test('the Sent row is there only while the chime is on, and starts at none', async ($, on) => {
  world(on)
  await start($)
  await open($)
  expect(await inPane($, ui => ui.find({ key: 'arsenal-chime-sent' }))).toBeUndefined()
  await inPane($, ui => ui.press({ key: 'arsenal-chime-switch' }))
  const ui = await pane($)
  try {
    expect(await ui.find({ key: 'arsenal-chime-sent' })).toBeDefined()
    expect(await sentLabel(ui)).toContain('none')
  } finally {
    await ui.unmount()
  }
})

test('a press on Sent saves the first sound and plays it; none plays nothing', async ($, on) => {
  const w = world(on, { store: ON, disk: { [`${SOUNDS_DIR}/mine.wav`]: '' } })
  await start($)
  await open($)
  await inPane($, ui => ui.press({ key: 'arsenal-chime-sent' }))
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '', sent: 'mine' })
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('mine.wav')
  // the Sound row is untouched
  expect((w.store.chime as { sound: string }).sound).toBe('')
})

test('a saved sent sound is loaded, and one that is gone is none', async ($, on) => {
  world(on, { store: { chime: { version: 1, isOn: true, sound: '', sent: 'gone' } } })
  await start($)
  await open($)
  expect(await inPane($, sentLabel)).toContain('none')
})

// ── The events ───────────────────────────────────────────────────────────

const DONE = { answer: 'x', durationMs: 1, isAborted: false, reason: 'answer' as const }
const finish = ($: Engine, more: object = {}) => $.turn.complete({ ...DONE, turnId: 't1', ...more } as any)
const ask = ($: Engine) => $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as any)
const notice = ($: Engine, type: string) => $.classic.Notification({ notification_type: type, message: 'ok?' } as any)
/** The sounds are started and not waited for: give them a moment to be seen. */
const settle = () => new Promise<void>(done => setTimeout(done, 60))

test('a finished reply plays the picked sound once', async ($, on) => {
  const w = world(on, { store: ON })
  await start($)
  await finish($)
  await settle()
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Notify Messaging.wav')
})

test('with the chime off nothing plays', async ($, on) => {
  const w = world(on)
  await start($)
  await finish($)
  await ask($)
  await notice($, 'permission_prompt')
  await send($)
  await settle()
  expect(w.played).toEqual([])
})

test('a subagent’s turn and a stopped turn play nothing', async ($, on) => {
  const w = world(on, { store: ON })
  await start($)
  await finish($, { agentId: 'a1' })
  await finish($, { isAborted: true })
  await settle()
  expect(w.played).toEqual([])
})

test('AskUserQuestion plays the Claude sound, the one a reply plays', async ($, on) => {
  const w = world(on, { store: ON })
  await start($)
  await ask($)
  await settle()
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Notify Messaging.wav')
})

test('a question.wav in the folder is an ordinary sound: picked, it plays for a question', async ($, on) => {
  const w = world(on, {
    store: { chime: { version: 1, isOn: true, sound: 'question' } },
    disk: { [`${SOUNDS_DIR}/question.wav`]: '' },
  })
  await start($)
  await ask($)
  await settle()
  expect(w.played[0]?.[4]).toContain('question.wav')
})

test('a permission prompt plays the Claude sound once, and another notice plays nothing', async ($, on) => {
  const w = world(on, { store: ON })
  await start($)
  await notice($, 'idle_prompt')
  await settle()
  expect(w.played).toEqual([])
  await notice($, 'permission_prompt')
  await settle()
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Notify Messaging.wav')
})

/** What the person's Enter on a prompt raises; `more` overrides, for a command or another origin. */
const send = ($: Engine, more: object = {}) => $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' }, ...more } as any)
const SENT = { chime: { version: 1, isOn: true, sound: '', sent: 'Windows Ding' } }

test('the person’s Enter plays the sent sound once and sends the prompt on unchanged', async ($, on) => {
  const w = world(on, { store: SENT })
  await start($)
  const sent: any = await send($)
  await settle()
  expect(sent.text).toBe('hello')
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('Windows Ding.wav')
})

test('with the sent sound at none, an Enter plays nothing', async ($, on) => {
  const w = world(on, { store: ON })
  await start($)
  await send($)
  await settle()
  expect(w.played).toEqual([])
})

test('with the chime off, an Enter plays nothing even with a sent sound saved', async ($, on) => {
  const w = world(on, { store: { chime: { version: 1, isOn: false, sound: '', sent: 'Windows Ding' } } })
  await start($)
  await send($)
  await settle()
  expect(w.played).toEqual([])
})

test('a slash command, a plugin’s prompt and a hidden prompt play no sent sound', async ($, on) => {
  const w = world(on, { store: SENT })
  await start($)
  await send($, { command: { name: 'chime', args: 'test' } })
  await send($, { origin: { kind: 'plugin', name: 'prompt-upgrade' } })
  await send($, { isMeta: true })
  await settle()
  expect(w.played).toEqual([])
})

test('a prompt another hook drops still played its sound: it was the person’s Enter', async ($, on) => {
  const w = world(on, { store: SENT, holds: true })
  await start($)
  const held: any = await send($)
  await settle()
  expect(held.drop).toBeDefined()
  expect(w.played).toHaveLength(1)
})

test('/chime sent saves a name or none, plays the name, and says so', async ($, on) => {
  const w = world(on, { store: ON })
  await start($)
  expect(await chime($, 'sent windows ding')).toContain('Windows Ding')
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '', sent: 'Windows Ding' })
  expect(w.played).toHaveLength(1)
  expect(await chime($, 'sent none')).toContain('none')
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '' })
  expect(w.played).toHaveLength(1)
  const said = await chime($, 'sent nope')
  expect(said).toContain('No sound called "nope"')
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '' })
})

test('an mp3 in the folder is a choice in both lists and plays through the media player', async ($, on) => {
  const w = world(on, { store: ON, disk: { [`${SOUNDS_DIR}/swoosh.mp3`]: '' } })
  await start($)
  expect(await chime($, '')).toContain('Sounds: swoosh, Windows Notify Messaging')
  await chime($, 'sent swoosh')
  expect(w.store.chime).toEqual({ version: 1, isOn: true, sound: '', sent: 'swoosh' })
  expect(w.played).toHaveLength(1)
  expect(w.played[0]?.[4]).toContain('System.Windows.Media.MediaPlayer')
  expect(w.played[0]?.[4]).toContain('swoosh.mp3')
  // a wav still goes to the lighter player
  await chime($, 'sound windows ding')
  expect(w.played[1]?.[4]).toContain('SoundPlayer')
})

test('a player that never returns does not hold the turn, the question, the notice or the prompt', async ($, on) => {
  const w = world(on, { store: SENT, hangs: true })
  await start($)
  await finish($)
  await ask($)
  await notice($, 'permission_prompt')
  await send($)
  await settle()
  expect(w.played).toHaveLength(4)
})
