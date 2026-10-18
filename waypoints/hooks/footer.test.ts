import { test, expect, mock, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The footer's plan label. Desktop draws a footer's tree but not the labels in `modes` (the label
// never showed there, 2.0.2), so on Desktop it is a node, and only while the band is away: the
// band already shows the plan. On the terminal it stays a label in `modes`.

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 18, 14, 30).getTime()

function world(on: On, modes: string[][] = []) {
  mock.clock(on, { now: NOW })
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
  // the engine's footer is one node, with the labels in `modes` already in it
  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    modes.push([...e.props.modes])
    return h($.ui.resolve(e).Box, { key: 'engine-footer' }) as any
  })
}

async function planned($: Engine, surface: 'terminal' | 'desktop') {
  await $.session.start({ cwd: 'C:/bats', surface, isInteractive: true })
  const call = (o: object, n: number) => $.tool.call({ tool: TOOL, tool_use_id: `t${n}`, ...o } as any)
  await call({ action: 'plan', tasks: [{ title: 'one', size: 'S' }, { title: 'two', size: 'S' }, { title: 'three', size: 'M' }] }, 1)
  await call({ action: 'start', id: 1 }, 2)
  await call({ action: 'done', id: 1 }, 3)
  await call({ action: 'start', id: 2 }, 4)
}

const footer = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'waypoints', surface, component: 'SessionMode', props: { modes: ['auto'] } })

const labels = async (ui: Awaited<ReturnType<typeof footer>>) =>
  ((await ui.findAll({ type: 'Text' })) as unknown as { text: string }[]).map((t) => t.text).filter((t) => t.startsWith('◎'))

const waypoints = ($: Engine, args: string) => $.command.run({ command: 'waypoints', args } as any)

test('on Desktop the plan label stays out of the footer while the band is up', async ($, on) => {
  world(on)
  await planned($, 'desktop')
  const ui = await footer($, 'desktop')
  expect(await labels(ui)).toEqual([])
  expect(await ui.find({ key: 'engine-footer' })).toBeDefined()
})

test('on Desktop /waypoints hide puts the plan label in the footer, around the engine’s footer, and show takes it out', async ($, on) => {
  const seen: string[][] = []
  world(on, seen)
  await planned($, 'desktop')
  await waypoints($, 'hide')
  const hidden = await footer($, 'desktop')
  expect(await labels(hidden)).toEqual([expect.stringMatching(/^◎ plan \d+%/)])
  expect(await hidden.find({ key: 'engine-footer' })).toBeDefined()
  await hidden.unmount()
  await waypoints($, 'show')
  const shown = await footer($, 'desktop')
  expect(await labels(shown)).toEqual([])
  // the labels in `modes` are left as the engine gave them
  expect(seen.every((m) => m.length === 1 && m[0] === 'auto')).toBe(true)
})

test('on Desktop there is no label without a plan, hidden or not', async ($, on) => {
  world(on)
  await $.session.start({ cwd: 'C:/bats', surface: 'desktop', isInteractive: true })
  await waypoints($, 'hide')
  const ui = await footer($, 'desktop')
  expect(await labels(ui)).toEqual([])
  expect(await ui.find({ key: 'engine-footer' })).toBeDefined()
})

test('on the terminal the plan label stays a label in modes, hidden band or not', async ($, on) => {
  const seen: string[][] = []
  world(on, seen)
  await planned($, 'terminal')
  const up = await footer($, 'terminal')
  expect(await labels(up)).toEqual([])
  await up.unmount()
  await waypoints($, 'hide')
  const hidden = await footer($, 'terminal')
  expect(await labels(hidden)).toEqual([])
  expect(await hidden.find({ key: 'engine-footer' })).toBeDefined()
  // one label added to what the engine gave, each time
  expect(seen.map((m) => m.length)).toEqual([2, 2])
  expect(seen.every((m) => m[0] === 'auto' && /^◎ plan \d+%/.test(m[1] ?? ''))).toBe(true)
})
