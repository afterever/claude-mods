import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// @ts-ignore plain JavaScript, shared with the module
import Pulse from './pulse.mjs'

const TOOL = 'mcp__waypoints__tasks'
const PANE = 'waypoints'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()
const MIN = 60000

type Opts = {
  rows?: unknown[]
  /** What ui.open answers: false is a window too narrow for a pane nobody asked for. */
  placed?: boolean
}

// The world beneath the mod, with a pane list that opens and closes as the engine's would
function world(on: On, o: Opts = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, { USERPROFILE: 'C:/Users/bats' })
  const toasts: string[] = []
  const opened: any[] = []
  const closed: string[] = []
  let panes: any[] = []
  let listed = 0
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('ui.log', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 'sess-1' }) as any)
  on('session.cwd', async () => ({ value: 'C:/bats' }) as any)
  on('session.surface', async () => ({ value: 'terminal' }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('tool.register', async () => ({ value: { tool: TOOL } }) as any)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as any)
  on('command.run', { command: 'goal' }, async () => ({}) as any)
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('ui.open', async (_$, e) => {
    opened.push(e)
    panes = [...panes.filter((p) => p.id !== e.id), { id: e.id, title: e.title, isShown: true, isFocused: false, isPlaced: o.placed !== false }]
    return { value: o.placed === false ? { isPlaced: false, reason: 'window 100 columns, floor 144' } : { isPlaced: true } } as any
  })
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    panes = panes.filter((p) => p.id !== e.id)
    return { value: undefined } as any
  })
  on('ui.panes', async () => ({ value: panes }) as any)
  on('config.list', async () => {
    listed += 1
    return { value: o.rows ?? [] } as any
  })
  on('config.set', async (_$, e) => ({ value: e.value }) as any)
  on('prompt.compose', async () => ({ sections: [] }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => h($.ui.resolve(e).Box, {}) as any)
  return { clock, toasts, opened, closed, listed: () => listed, shut: () => (panes = []) }
}

const start = ($: any) => $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
let n = 0
const call = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: TOOL, tool_use_id: 't' + ++n, ...input })
const plan = ($: any) => call($, { action: 'plan', tasks: [{ title: 'read', size: 'S' }, { title: 'write', size: 'M' }] })
const byHand = ($: any) => $.command.run({ command: 'waypoints', args: '' })

test('the first plan opens the pane without taking the keys from the prompt', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.opened).toHaveLength(0)
  await plan($)
  expect(w.opened).toHaveLength(1)
  expect(w.opened[0]).toMatchObject({ id: PANE, title: 'Waypoints', closeOnEscape: true })
  // an unasked pane never asks for the keys: `focus` is left out (the host takes only `true`)
  expect(w.opened[0].focus).toBeUndefined()
})

test('only the first plan opens it: not a later plan, an add, a start or a done', async ($, on) => {
  const w = world(on)
  await start($)
  await plan($)
  // shut it, so that only the rules, not "already open", keep it shut
  w.shut()
  await plan($)
  await call($, { action: 'add', tasks: [{ title: 'more' }] })
  await call($, { action: 'start', id: 1 })
  await call($, { action: 'done', id: 1 })
  expect(w.opened).toHaveLength(1)
})

test('a pane that is already open is not opened twice', async ($, on) => {
  const w = world(on)
  await start($)
  await byHand($) // the person opens it first
  await plan($)
  expect(w.opened).toHaveLength(1)
  expect(w.opened[0].focus).toBe(true)
})

test('/waypoints strict on is an unknown word now: it opens the pane and toasts nothing', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run({ command: 'waypoints', args: 'strict on' })
  expect(w.opened.at(-1).id).toBe(PANE)
  expect(w.toasts).toEqual([])
})

test('pane off: a plan opens nothing, /waypoints still opens it', { options: { pane: 'off' } }, async ($, on) => {
  const w = world(on)
  await start($)
  await plan($)
  expect(w.opened).toHaveLength(0)
  await byHand($)
  expect(w.opened).toHaveLength(1)
})

test('a narrow window leaves the pane waiting and says nothing', async ($, on) => {
  const w = world(on, { placed: false })
  await start($)
  await plan($)
  expect(w.opened).toHaveLength(1)
  expect(w.toasts).toEqual([])
})

test('a plan after a finished goal starts another goal and opens the pane again', async ($, on) => {
  const w = world(on)
  await start($)
  await plan($)
  w.shut()
  await $.command.run({ command: 'waypoints', args: 'clear' })
  await w.clock.advance(MIN)
  await plan($) // the old goal ended: this starts another
  expect(w.opened).toHaveLength(2)
})

test('a pane the mod opened leaves with the band, a pane the person opened stays', async ($, on) => {
  const auto = world(on)
  await start($)
  await plan($)
  await $.command.run({ command: 'waypoints', args: 'clear' })
  await auto.clock.advance(20000)
  expect(auto.closed).toEqual([])
  await auto.clock.advance(20000) // past the 30 seconds the band stays
  expect(auto.closed).toEqual([PANE])
})

test('a pane the person opened is never closed by the mod', async ($, on) => {
  const w = world(on)
  await start($)
  await plan($) // the mod opens it ...
  await byHand($) // ... and the person takes it over
  await $.command.run({ command: 'waypoints', args: 'clear' })
  await w.clock.advance(5 * MIN)
  expect(w.closed).toEqual([])
})

test('Agent-Pulse\'s palette change is picked up when it is made and on the 15 s tick', async ($, on) => {
  const w = world(on)
  await start($)
  const atStart = w.listed()
  expect(atStart).toBeGreaterThan(0)
  await $.config.set({ key: 'agent-pulse.palette', value: 'neon' })
  expect(w.listed()).toBeGreaterThan(atStart)
  const before = w.listed()
  await w.clock.advance(16000)
  expect(w.listed()).toBeGreaterThan(before)
  // a row of anyone else's does not wake it
  const other = w.listed()
  await $.config.set({ key: 'theme', value: 'dark' })
  expect(w.listed()).toBe(other)
})

// ---------- pane.mjs: the rules the test engine cannot raise a ui.close for ----------

// @ts-ignore plain JavaScript, shared with the module
import { createAutoPane } from './pane.mjs'

const goalA = { startedAt: 100 }
const goalB = { startedAt: 900 }

test('a pane opens on a goal\'s plan, unless the setting is off or it is open already', async () => {
  const p = createAutoPane()
  expect(p.canOpen('auto', goalA, false)).toBe(true)
  expect(p.canOpen('off', goalA, false)).toBe(false)
  expect(p.canOpen('auto', goalA, true)).toBe(false)
  expect(p.canOpen('auto', null, false)).toBe(false)
})

test('the person\'s close keeps the pane shut for that goal, and a new goal opens it again', async () => {
  const p = createAutoPane()
  p.closed({ kind: 'person' }, goalA)
  expect(p.canOpen('auto', goalA, false)).toBe(false)
  expect(p.canOpen('auto', goalB, false)).toBe(true)
})

test('a close by a plugin or an unload is not the person\'s and keeps nothing shut', async () => {
  for (const kind of ['plugin', 'unload']) {
    const p = createAutoPane()
    p.closed({ kind }, goalA)
    expect(p.canOpen('auto', goalA, false)).toBe(true)
  }
  const p = createAutoPane()
  p.closed(undefined, goalA)
  expect(p.canOpen('auto', goalA, false)).toBe(true)
})

test('the mod closes only a pane it opened itself, once the band is gone', async () => {
  const p = createAutoPane()
  expect(p.shouldClose(true, false)).toBe(false) // never opened by the mod
  p.opened()
  expect(p.shouldClose(true, true)).toBe(false) // the band is still up
  expect(p.shouldClose(false, false)).toBe(false) // already gone
  expect(p.shouldClose(true, false)).toBe(true)
  p.takenOver() // the person opened it themselves
  expect(p.shouldClose(true, false)).toBe(false)
  expect(p.owns()).toBe(false)
})

// ---------- pulse.mjs ----------

function surface() {
  let state: any
  const timers: Array<{ fn: () => void; stopped: boolean }> = []
  return {
    elements: { Text: (p: any) => ({ t: 'Text', ...p }) },
    get state() {
      return state
    },
    setState: (s: any) => {
      state = s
    },
    every: (_ms: number, fn: () => void) => {
      const timer = { fn, stopped: false }
      timers.push(timer)
      return () => {
        timer.stopped = true
      }
    },
    tick: (times = 1) => {
      for (let i = 0; i < times; i++) timers.forEach((t) => !t.stopped && t.fn())
    },
    started: () => timers.length,
    running: () => timers.filter((t) => !t.stopped).length,
  }
}
const textOf = (n: any): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n ? textOf(n.children) : '')

test('the spinner cycles its frames and colours', async () => {
  const s = surface()
  const props = { kind: 'spin', frames: ['a', 'b', 'c'], ms: 80, colors: ['#111', '#222'] }
  expect(Pulse(props, s).children).toEqual(['a'])
  s.tick()
  const second = Pulse(props, s)
  expect(second.children).toEqual(['b'])
  expect(second.color).toBe('#222')
  expect(s.started()).toBe(1) // started once, not on each call
})

test('the node is a ✦ that twinkles to ✧ once a cycle, and flares ✷ only when it breathes', async () => {
  const seenOf = (breathe: boolean) => {
    const s = surface()
    const p = { kind: 'node', colors: ['#111', '#222'], breathe }
    Pulse(p, s)
    const seen: string[] = []
    for (let i = 0; i < 16; i++) {
      s.tick()
      seen.push(textOf(Pulse(p, s)))
    }
    return seen
  }
  const subtle = seenOf(false)
  expect([...new Set(subtle)].sort()).toEqual(['✦', '✧'])
  // mostly the star: the dip is one frame in eight
  expect(subtle.filter((g) => g === '✦')).toHaveLength(14)
  expect([...new Set(seenOf(true))].sort()).toEqual(['✦', '✧', '✷'])
  // it never goes blank, so the route keeps its shape
  expect(subtle.every((g) => g.trim().length === 1)).toBe(true)
})

test('the sweep plays once along the route and rests on the solid colours', async () => {
  const s = surface()
  const chars = '●━━●━━✦'
  const done = [...chars].map((_, i) => '#d' + i)
  const p = { kind: 'sweep', chars, done, colors: ['#f00', '#0f0'] }
  Pulse(p, s)
  s.tick(5)
  const mid = Pulse(p, s)
  expect(textOf(mid)).toBe(chars)
  expect(JSON.stringify(mid)).toContain('#f00') // sparkle on the way
  s.tick(40)
  expect(s.running()).toBe(0) // stopped itself
  const rest = Pulse(p, s)
  expect(JSON.stringify(rest)).not.toContain('#f00')
  expect(JSON.stringify(rest)).not.toContain('#0f0')
  expect(textOf(rest)).toBe(chars)
})
