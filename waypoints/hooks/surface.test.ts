import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// The band through the engine's own element tables. The terminal's table lists `Svg` as well as
// Desktop's, so a band that guesses its surface from the table draws no route on the terminal;
// draw.test.ts, with its own element table, cannot see that.

const TOOL = 'mcp__waypoints__tasks'
const NOW = new Date(2026, 9, 17, 14, 30).getTime()

function world(on: On) {
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

test('on Desktop the route is one Svg and no Client', async ($, on) => {
  world(on)
  await planned($, 'desktop')
  const ui = await band($, 'desktop')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
  await ui.unmount()
})
