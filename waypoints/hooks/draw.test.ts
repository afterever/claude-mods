import { test, expect } from 'claude-code/testing'

// @ts-ignore plain JavaScript, shared with the module
import { newGoal, applyAction } from './plan.mjs'
// @ts-ignore
import { drawBand, drawPane, statsLine, short, runsLong, FULL_MS } from './draw.mjs'
// @ts-ignore
import { rolesOf } from './palette.mjs'
// @ts-ignore
import { routeSvg, routeAlt, svgWidth } from './svg.mjs'
// @ts-ignore
import { routeCells } from './route.mjs'

const T0 = 1_000_000
const MIN = 60000

// An element table that keeps what it was given, so a test reads the tree
const el: any = {
  Box: (p: any) => ({ t: 'Box', ...p }),
  Text: (p: any) => ({ t: 'Text', ...p }),
  Button: (p: any) => ({ t: 'Button', ...p }),
}
const flat = (n: any): string => {
  if (n == null || n === false) return ''
  if (typeof n === 'string') return n
  if (Array.isArray(n)) return n.map(flat).join('')
  if (n.t === 'Client') return `[${n.key}]`
  if (n.t === 'Button') return `[${n.label}]`
  // a Box's columnGap is blank cells between its children, as the terminal draws it
  if (n.t === 'Box' && n.columnGap && Array.isArray(n.children)) return n.children.map(flat).join(' '.repeat(n.columnGap))
  return flat(n.children)
}
const walk = (n: any, fn: (x: any) => void) => {
  if (n == null || typeof n === 'string') return
  if (Array.isArray(n)) return n.forEach((x) => walk(x, fn))
  fn(n)
  walk(n.children, fn)
}
const all = (n: any, pred: (x: any) => boolean) => {
  const out: any[] = []
  walk(n, (x) => pred(x) && out.push(x))
  return out
}
const rows = (tree: any) => tree.children.map(flat)

const pulse = (key: string, props: any, width: number) => ({ t: 'Client', key, props, width })

function goal() {
  const g = newGoal({ sessionId: 's1', condition: 'ship the band', now: T0, cwd: 'C:/bats' })
  applyAction(g, { action: 'plan', tasks: [{ title: 'parse', size: 'M' }, { title: 'settings', size: 'S' }, { title: 'tests', size: 'M' }, { title: 'readme', size: 'S' }] }, { now: T0 })
  return g
}
// parse and settings done, tests running by a reviewer, readme pending: 3 of 6 units, 50%
function midway() {
  const g = goal()
  applyAction(g, { action: 'start', id: 1 }, { now: T0 })
  applyAction(g, { action: 'done', id: 1 }, { now: T0 + MIN })
  applyAction(g, { action: 'start', id: 2 }, { now: T0 + MIN })
  applyAction(g, { action: 'done', id: 2 }, { now: T0 + 2 * MIN })
  applyAction(g, { action: 'start', id: 3 }, { now: T0 + 2 * MIN, by: 'reviewer' })
  return g
}
function view(g: any, o: any = {}) {
  return { g, now: T0 + 3 * MIN, mask: (s: string) => s, roles: rolesOf('ember'), level: 'subtle', width: 60, nudged: false, pulse, open: () => {}, ...o }
}

test('the header carries the numbers, the ETA and the all tasks button', async () => {
  const g = midway()
  const head = rows(drawBand(el, view(g)))[0]
  expect(head).toContain('◎ Goal: ship the band')
  expect(head).toContain('2 of 4 · 50% · ~3m')
  expect(head).toContain('[all tasks]')
  // one task done: no ETA yet
  const young = goal()
  applyAction(young, { action: 'done', id: 1 }, { now: T0 + MIN })
  const h2 = rows(drawBand(el, view(young, { now: T0 + MIN })))[0]
  expect(h2).toContain('1 of 4')
  expect(h2).not.toContain('~')
})

test('a running task has a row with its spinner, size, title, who runs it and for how long', async () => {
  const g = midway()
  const r = rows(drawBand(el, view(g)))
  const now = r.find((x: string) => x.includes('tests'))
  expect(now).toContain('[spin-3]')
  expect(now).toContain('M  tests')
  expect(now).toContain('◆ reviewer')
  expect(now).toContain(' · 1m')
  // main is the default and says nothing
  const main = goal()
  applyAction(main, { action: 'start', id: 1, by: 'main' }, { now: T0 })
  expect(rows(drawBand(el, view(main))).join('\n')).not.toContain('◆')
})

test('with nothing running the now row shows the last finished task, dim', async () => {
  const g = goal()
  applyAction(g, { action: 'done', ids: [1] }, { now: T0 + MIN })
  const tree = drawBand(el, view(g, { now: T0 + MIN }))
  const r = rows(tree)
  expect(r.some((x: string) => x.startsWith('✓ M  parse'))).toBe(true)
  expect(r.some((x: string) => x.includes('next ○ S  settings'))).toBe(true)
})

test('the next row names the first task still to do and is left out when none is', async () => {
  const g = midway()
  expect(rows(drawBand(el, view(g)))).toContain('  next ○ S  readme')
  applyAction(g, { action: 'done', ids: [3, 4] }, { now: T0 + 3 * MIN })
  expect(rows(drawBand(el, view(g))).some((x: string) => x.includes('next'))).toBe(false)
})

test('a task running past twice the plan\'s pace turns amber', async () => {
  const g = midway()
  const heat = rolesOf('ember').heat
  const amber = (tree: any) => all(tree, (x) => x.t === 'Text' && x.color === heat)
  expect(amber(drawBand(el, view(g)))).toHaveLength(0)
  // a small task that started with the plan and is still going: pace is 1m a unit, so 2m is long
  applyAction(g, { action: 'start', id: 4 }, { now: T0 })
  expect(runsLong(g, g.tasks[3], T0 + 3 * MIN)).toBe(true)
  expect(runsLong(g, g.tasks[2], T0 + 3 * MIN)).toBe(false)
  expect(amber(drawBand(el, view(g))).length).toBeGreaterThan(0)
})

test('no more than two tasks are listed as running, the rest fold into +n running', async () => {
  const g = midway()
  applyAction(g, { action: 'start', id: 4 }, { now: T0 + 2 * MIN })
  const many = newGoal({ sessionId: 's2', condition: 'many', now: T0, cwd: '' })
  applyAction(many, { action: 'plan', tasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }] }, { now: T0 })
  applyAction(many, { action: 'start', ids: [1, 2, 3, 4] }, { now: T0 })
  const r = rows(drawBand(el, view(many)))
  expect(r.filter((x: string) => x.includes('[spin-'))).toHaveLength(2)
  expect(r.join('\n')).toContain('+2 running')
})

test('the notable row shows the goal check first, then interrupted, then paused', async () => {
  const g = midway()
  const note = (x: any) => rows(drawBand(el, view(x))).slice(-1)[0]
  expect(note(g)).toContain('next')
  g.lastTurnEnd = T0 + 2 * MIN
  g.active = false
  expect(note(g)).toBe('⏸ paused, waiting on you')
  g.interrupted = true
  expect(note(g)).toBe('interrupted')
  g.check = { met: false, reason: 'tests are missing', at: T0 }
  expect(note(g)).toBe('Goal check: not met yet: tests are missing')
})

test('a plan that grew shows how many tasks it gained after the route', async () => {
  const g = midway()
  expect(flat(drawBand(el, view(g)).children[1])).not.toMatch(/\+\d/)
  applyAction(g, { action: 'add', tasks: [{ title: 'extra' }, { title: 'more' }] }, { now: T0 + 3 * MIN })
  expect(flat(drawBand(el, view(g)).children[1])).toMatch(/ \+2$/)
})

test('short of rows, next gives way first, then the notable row, then the now rows', async () => {
  const g = midway()
  g.interrupted = true
  const count = (max: number) => rows(drawBand(el, view(g, { maxRows: max }))).length
  expect(count(5)).toBe(5) // header, route, now, next, notable
  const four = rows(drawBand(el, view(g, { maxRows: 4 })))
  expect(four.some((x: string) => x.includes('next'))).toBe(false)
  expect(four.slice(-1)[0]).toBe('interrupted')
  const three = rows(drawBand(el, view(g, { maxRows: 3 })))
  expect(three).toHaveLength(3)
  expect(three.some((x: string) => x.includes('interrupted'))).toBe(false)
  expect(count(2)).toBe(2) // the header and the route stay
  expect(count(1)).toBe(2)
})

test('before there is a plan the band waits, then says Claude was reminded', async () => {
  const g = newGoal({ sessionId: 's1', condition: 'x', now: T0, cwd: '' })
  const r = rows(drawBand(el, view(g)))
  expect(r).toHaveLength(2)
  expect(r[0]).toContain('planning…')
  expect(r[1]).toContain("Waiting for Claude's task plan…")
  expect(rows(drawBand(el, view(g, { nudged: true })))[1]).toContain('No plan yet: reminded Claude')
})

test('the running node pulses on a Client keyed by its task, and not at animation off', async () => {
  const g = midway()
  const nodes = (tree: any) => all(tree, (x) => x.t === 'Client' && String(x.key).startsWith('node-'))
  const subtle = nodes(drawBand(el, view(g)))
  expect(subtle.map((n: any) => n.key)).toEqual(['node-3'])
  expect(subtle[0].props.breathe).toBe(false)
  expect(nodes(drawBand(el, view(g, { level: 'full' })))[0].props.breathe).toBe(true)
  const off = drawBand(el, view(g, { level: 'off' }))
  expect(nodes(off)).toHaveLength(0)
  expect(flat(off.children[1])).toContain('◉')
  // and its spinner is a still ◉
  expect(all(off, (x) => x.t === 'Client')).toHaveLength(0)
})

test('a finished plan sweeps the route at full, stays solid below, then collapses to one row', async () => {
  const g = midway()
  applyAction(g, { action: 'done', ids: [3, 4] }, { now: T0 + 3 * MIN })
  g.status = 'met'
  g.endedAt = T0 + 3 * MIN
  const fresh = (level: string) => drawBand(el, view(g, { now: g.endedAt + 2000, level }))
  const full = fresh('full')
  const sweep = all(full, (x) => x.t === 'Client')
  expect(sweep).toHaveLength(1)
  expect(sweep[0].key).toBe(`sweep-${g.startedAt}-${g.endedAt}`)
  expect(sweep[0].props.chars.endsWith('✦')).toBe(true)
  const subtle = fresh('subtle')
  expect(all(subtle, (x) => x.t === 'Client')).toHaveLength(0)
  expect(flat(subtle.children[1]).endsWith('✦')).toBe(true)
  expect(rows(subtle)[0]).toContain('done ✓ in 3m')
  // eight seconds on: one row
  const later = rows(drawBand(el, view(g, { now: g.endedAt + FULL_MS + 1 })))
  expect(later).toHaveLength(1)
  expect(later[0]).toContain('✓ Goal: ship the band')
  expect(later[0]).toContain('4 tasks · done in 3m')
  // a stopped goal collapses at once
  const stopped = midway()
  stopped.status = 'stopped'
  stopped.endedAt = T0 + 3 * MIN
  const s = rows(drawBand(el, view(stopped)))
  expect(s).toHaveLength(1)
  expect(s[0]).toContain('stopped')
})

test('Recording Mode masks every title, who runs it and the goal check', async () => {
  const g = midway()
  g.check = { met: false, reason: 'secret reason', at: T0 }
  const text = rows(drawBand(el, view(g, { mask: () => '•••' }))).join('\n')
  expect(text).not.toContain('tests')
  expect(text).not.toContain('reviewer')
  expect(text).not.toContain('secret')
  expect(text).not.toContain('ship the band')
  expect(text).toContain('•••')
})

// ---------- the pane ----------

const paneView = (g: any, o: any = {}) => view(g, { others: [], sessionId: 's1', commandName: 'waypoints', settings: { auto: true }, width: 80, ...o })
const lines = (tree: any) => tree.children.map(flat)

test('the pane\'s stats line holds the numbers, elapsed time, the ETA, growth and goal checks', async () => {
  const g = midway()
  applyAction(g, { action: 'add', tasks: [{ title: 'extra' }] }, { now: T0 + 3 * MIN })
  g.checks = 1
  const s = statsLine(g, { doneN: 2, n: 5, pct: 43 }, T0 + 3 * MIN)
  expect(s).toContain('2 of 5 · 43%')
  expect(s).toContain('3m elapsed')
  expect(s).toContain('plan grew 4 → 5')
  expect(s).toContain('1 goal check')
  expect(statsLine(goal(), { doneN: 0, n: 4, pct: 0 }, T0 + MIN)).toContain('ETA after 2 tasks finish')
  g.status = 'met'
  g.endedAt = T0 + 3 * MIN
  expect(statsLine(g, { doneN: 5, n: 5, pct: 100 }, T0 + 4 * MIN)).toBe('done ✓ in 3m')
})

test('the trail lists every task with its node, a connector between them and its time', async () => {
  const g = midway()
  const l = lines(drawPane(el, paneView(g)))
  expect(l[0]).toBe('◎ Goal: ship the band')
  const trail = l.filter((x: string) => /^[●◉○◎×] [SML]  /.test(x))
  expect(trail).toHaveLength(4)
  expect(trail[0]).toMatch(/^● M  parse +▅+ 1m$/)
  expect(trail[2]).toMatch(/^◉ M  tests +◆ reviewer · running 1m$/)
  expect(trail[3]).toMatch(/^◎ S  readme/) // the last node is the destination
  // ┃ under a finished task, ┆ otherwise
  expect(l.filter((x: string) => x === '┃')).toHaveLength(2)
  expect(l.filter((x: string) => x === '┆')).toHaveLength(1)
})

test('duration bars scale so the longest task is 12 cells', async () => {
  const g = goal()
  applyAction(g, { action: 'start', id: 1 }, { now: T0 })
  applyAction(g, { action: 'done', id: 1 }, { now: T0 + 6 * MIN })
  applyAction(g, { action: 'start', id: 2 }, { now: T0 + 6 * MIN })
  applyAction(g, { action: 'done', id: 2 }, { now: T0 + 9 * MIN })
  const trail = lines(drawPane(el, paneView(g, { now: T0 + 9 * MIN }))).filter((x: string) => x.startsWith('●'))
  expect(trail[0].match(/▅+/)![0]).toHaveLength(12)
  expect(trail[1].match(/▅+/)![0]).toHaveLength(6)
  expect(short(30000)).toBe('30s')
  expect(short(90000)).toBe('2m')
})

test('replaced tasks are hidden, dropped ones stay with their note', async () => {
  const g = midway()
  applyAction(g, { action: 'plan', tasks: [{ title: 'fresh start', size: 'S' }] }, { now: T0 + 3 * MIN })
  applyAction(g, { action: 'drop', id: 3, note: 'not needed' }, { now: T0 + 3 * MIN })
  const trail = lines(drawPane(el, paneView(g))).filter((x: string) => /^[●◉○◎×] [SML]  /.test(x))
  expect(trail.some((x: string) => x.includes('readme'))).toBe(false) // replaced
  expect(trail.some((x: string) => x.includes('fresh start'))).toBe(true)
  const dropped = trail.find((x: string) => x.startsWith('×'))!
  expect(dropped).toContain('dropped: not needed')
})

test('connectors are left out past ten tasks', async () => {
  const g = newGoal({ sessionId: 's3', condition: 'big', now: T0, cwd: '' })
  applyAction(g, { action: 'plan', tasks: Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, size: 'S' })) }, { now: T0 })
  const l = lines(drawPane(el, paneView(g)))
  expect(l.filter((x: string) => x === '┃' || x === '┆')).toHaveLength(0)
  expect(l.filter((x: string) => /^[○◎] [SML]  /.test(x))).toHaveLength(12)
})

test('other chats get a mini route and their own tail; this chat is not listed twice', async () => {
  const other = { sessionId: 's9', label: 'agent-pulse', title: 'palette work', cwd: '', status: 'running', planAt: T0, startedAt: T0, tasks: [{ id: 1, size: 'M', status: 'done', doneAt: T0 + MIN, startedAt: T0 }, { id: 2, size: 'S', status: 'done', doneAt: T0 + 2 * MIN, startedAt: T0 + MIN }, { id: 3, size: 'M', status: 'active', startedAt: T0 + 2 * MIN }, { id: 4, size: 'S', status: 'pending' }] }
  const done = { ...other, sessionId: 's8', label: 'work-report', title: 'band setting', status: 'met', endedAt: T0 + 3 * MIN, tasks: [{ id: 1, size: 'S', status: 'done', doneAt: T0, startedAt: T0 }] }
  const mine = { ...other, sessionId: 's1' }
  const l = lines(drawPane(el, paneView(midway(), { others: [other, done, mine] })))
  expect(l).toContain('Other chats (2)')
  const row = l.find((x: string) => x.includes('agent-pulse: palette work'))!
  expect(row).toContain('●━●━◉┄○┄◎')
  expect(row).toMatch(/50% · ~3m$/)
  expect(l.find((x: string) => x.includes('band setting'))).toMatch(/●━✦ +done ✓$/)
})

test('the pane ends with the commands and where the look is set', async () => {
  const l = lines(drawPane(el, paneView(midway(), { settings: { strict: true, auto: false } })))
  expect(l.slice(-1)[0]).toBe('/waypoints hide|show · strict off · auto on · clear · look: /config → Waypoints')
  expect(lines(drawPane(el, paneView(null))).join('\n')).toContain('No goal in this chat')
})

test('Recording Mode masks the trail, the notes and the other chats', async () => {
  const g = midway()
  applyAction(g, { action: 'drop', id: 4, note: 'secret note' }, { now: T0 + 3 * MIN })
  g.check = { met: false, reason: 'secret reason', at: T0 }
  const other = { sessionId: 's9', label: 'private-repo', title: 'secret job', cwd: '', status: 'running', planAt: T0, startedAt: T0, tasks: [{ id: 1, size: 'S', status: 'pending' }] }
  const text = lines(drawPane(el, paneView(g, { mask: () => '•••', others: [other] }))).join('\n')
  for (const word of ['parse', 'tests', 'secret', 'reviewer', 'private-repo', 'ship the band']) expect(text).not.toContain(word)
})

// ---------- the Desktop route ----------

const hex = rolesOf('ember').hex
const cellsOf = (g: any, finished = false) => routeCells(g.tasks, 40, { finished }).cells
const svg = (g: any, o: any = {}) => routeSvg(cellsOf(g, !!o.finishId), { hex, level: 'subtle', width: 300, ...o })

test('the route SVG draws done legs as a gradient and pending legs dashed', async () => {
  const s = svg(midway())
  expect(s).toContain('<linearGradient id="g"')
  expect(s).toContain('stroke="url(#g)"') // the finished leg
  expect(s).toContain('stroke-dasharray="3 3"') // the legs still to go
  expect(s).toContain(hex.done)
  expect(s).toContain(hex.glow)
  expect(s).toContain('prefers-reduced-motion: reduce')
})

test('the source holds no time: the same plan draws the same SVG every time', async () => {
  expect(svg(midway())).toBe(svg(midway()))
  expect(svg(midway(), { level: 'full' })).toBe(svg(midway(), { level: 'full' }))
})

test('the running node pulses at subtle and above, and a light travels the leg at full only', async () => {
  const g = midway()
  expect(svg(g, { level: 'off' })).not.toContain('class="halo"')
  expect(svg(g, { level: 'off' })).not.toContain('@keyframes')
  expect(svg(g, { level: 'subtle' })).toContain('class="halo"')
  expect(svg(g, { level: 'subtle' })).not.toContain('class="go"')
  expect(svg(g, { level: 'full' })).toContain('class="go"')
})

test('the finish plays once: a sweep and three stars at full, only the ✦ below', async () => {
  const g = midway()
  applyAction(g, { action: 'done', ids: [3, 4] }, { now: T0 + 3 * MIN })
  const full = svg(g, { level: 'full', finishId: '100-200' })
  expect(full).toContain('<g id="fin-100-200">')
  expect(full).toContain('class="sweep"')
  expect(full.match(/class="tw"/g)).toHaveLength(3)
  // the next finish is a different source, so its animations play again
  expect(svg(g, { level: 'full', finishId: '100-999' })).not.toBe(full)
  const subtle = svg(g, { level: 'subtle', finishId: '100-200' })
  expect(subtle).not.toContain('fin-100-200')
  expect(subtle).toContain('<polygon') // the ✦ on the last node
  // a running plan has no finish effects at all
  expect(svg(midway(), { level: 'full' })).not.toContain('class="sweep"')
})

test('the SVG takes hex only, even in the palettes that follow the theme', async () => {
  for (const name of ['ember', 'claude', 'neon', 'mono']) {
    const h = rolesOf(name).hex
    for (const color of [h.done, h.glow, h.pending, ...h.sparkle]) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  }
})

test('the width follows the columns, clamped; the alt says the numbers', async () => {
  expect(svgWidth(80)).toBe(600)
  expect(svgWidth(10)).toBe(140)
  expect(svgWidth(300)).toBe(640)
  expect(routeAlt(3, 6, [4])).toBe('3 of 6 tasks done, task 4 running')
  expect(routeAlt(3, 6, [4, 5])).toBe('3 of 6 tasks done, tasks 4 and 5 running')
  expect(routeAlt(6, 6, [])).toBe('6 of 6 tasks done')
})

test('on Desktop the band draws the route as an Svg and a still spinner, with a masked-safe alt', async () => {
  const desktop: any = { ...el, Svg: (p: any) => ({ t: 'Svg', ...p }) }
  const g = midway()
  const tree = drawBand(desktop, view(g, { level: 'full', mask: () => '•••', svg: true }))
  const svgs = all(tree, (x) => x.t === 'Svg')
  expect(svgs).toHaveLength(1)
  expect(svgs[0].alt).toBe('2 of 4 tasks done, task 3 running')
  expect(svgs[0].source).toContain('<svg')
  // the motion is in the SVG: no Client anywhere, and the now row's spinner is a still ◉
  expect(all(tree, (x) => x.t === 'Client')).toHaveLength(0)
  expect(rows(tree).find((x: string) => x.includes('M  •••'))).toContain('◉')
  expect(JSON.stringify(svgs[0].alt)).not.toContain('tests')
})
