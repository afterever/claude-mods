// Waypoints' drawing: the band above the prompt (and, below, the pane). Pure: every
// function takes the element table `el` and a `view` and returns a tree, so the harness
// can draw a band without the engine.
//
// view = {
//   g,        the goal                     now,    the clock
//   mask,     Recording Mode's masker      roles,  rolesOf(palette)
//   level,    'off' | 'subtle' | 'full'    width,  bodyColumns
//   maxRows,  rows the band may take       nudged, Claude was reminded to plan
//   pulse,    (key, props, width) → a terminal Client (built in register.mjs, which the
//             engine reads the module path from); absent, nothing animates
//   open,     () → open the pane
// }
// A surface whose element table has `Svg` (Desktop, mobile) gets the route as one Svg and a
// still spinner; the terminal gets Text runs and the Client animations.

import { minutes, clock, clip, basename } from './fmt.mjs'
import { progress, eta, live, weight } from './plan.mjs'
import { routeCells, miniRoute, runs } from './route.mjs'
import { routeSvg, routeAlt, svgWidth } from './svg.mjs'

export const FULL_MS = 8000 // a finished band keeps all its rows this long
export const SPIN = { frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], ms: 80 }

// ---------- words ----------

export function label(g) {
  return g.kind === 'plan' ? 'Plan' : 'Goal'
}

export function isPaused(g) {
  return g.status === 'running' && !g.active && g.lastTurnEnd > 0
}

// A task running past twice the plan's own pace for its size (only once the ETA exists)
export function runsLong(g, t, now) {
  if (!eta(g, now)) return false
  const pace = (now - (g.planAt || g.startedAt)) / progress(g).doneW
  return now - t.startedAt > 2 * pace * weight(t)
}

function byOf(t) {
  return t.by && t.by !== 'main' ? t.by : ''
}

function lastDone(tasks) {
  return tasks.filter((t) => t.status === 'done').sort((a, b) => b.doneAt - a.doneAt || b.id - a.id)[0]
}

// ---------- the route ----------

function colorOf(roles, cell) {
  if (cell.role === 'done') return roles.done(cell.t)
  if (cell.role === 'sparkle') return roles.sparkle[0]
  if (cell.role === 'active') return roles.activeStill
  return roles.pending
}

function routeRow(el, v, cells, tail, tasks) {
  const { Box, Text } = el
  const finishing = v.g.status === 'met'
  // Desktop draws the route as an Svg, which moves by CSS; only the terminal takes a Client
  const animate = v.pulse && !el.Svg
  const kids = []
  if (el.Svg) {
    const p = progress(v.g)
    const running = tasks.map((t, i) => (t.status === 'active' ? i + 1 : 0)).filter(Boolean)
    const width = svgWidth(v.width)
    const source = routeSvg(cells, { hex: v.roles.hex, level: v.level, width, finishId: finishing ? `${v.g.startedAt}-${v.g.endedAt}` : '' })
    kids.push(el.Svg({ key: 'route', source, alt: routeAlt(p.doneN, p.n, running), width, height: 14 }))
  } else if (finishing && v.level === 'full' && animate) {
    // one-shot, keyed by the finish: it sweeps the sparkle colours along the route once,
    // then rests on the solid route
    kids.push(
      v.pulse(
        `sweep-${v.g.startedAt}-${v.g.endedAt}`,
        { kind: 'sweep', chars: cells.map((c) => c.ch).join(''), done: cells.map((c) => colorOf(v.roles, c)), colors: [...v.roles.sparkle] },
        cells.length,
      ),
    )
  } else {
    let buf = []
    const flush = () => {
      for (const r of runs(buf, (c) => colorOf(v.roles, c))) kids.push(Text({ color: r.color, children: [r.text] }))
      buf = []
    }
    for (const c of cells) {
      if (c.role === 'active' && v.level !== 'off' && animate) {
        flush()
        kids.push(v.pulse(`node-${c.id}`, { kind: 'node', colors: [...v.roles.active], breathe: v.level === 'full' }, 1))
      } else buf.push(c)
    }
    flush()
  }
  if (tail) kids.push(Text({ dimColor: true, children: [tail] }))
  return Box({ flexDirection: 'row', children: kids })
}

// ---------- rows ----------

function headerRow(el, v, mark, right) {
  const { Box, Text, Button } = el
  const { g, mask } = v
  const open = Button({ key: 'goal-tasks', label: 'all tasks', hotkey: 'g', plain: true, onPress: () => v.open && v.open() })
  return Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    columnGap: 2,
    children: [
      Box({
        flexDirection: 'row',
        flexShrink: 1,
        children: [mark, Text({ bold: true, wrap: 'truncate-end', children: [`${label(g)}: ${mask(g.title)}`] })],
      }),
      Box({ flexDirection: 'row', columnGap: 2, flexShrink: 0, children: [...right, open] }),
    ],
  })
}

function spinner(el, v, key) {
  if (v.level === 'off' || el.Svg || !v.pulse) return el.Text({ color: v.roles.activeStill, children: ['◉'] })
  return v.pulse(key, { kind: 'spin', frames: SPIN.frames, ms: SPIN.ms, colors: [...v.roles.active] }, 1)
}

function nowRow(el, v, t, more) {
  const { Box, Text } = el
  const { g, now, mask, roles } = v
  const by = byOf(t)
  const long = runsLong(g, t, now)
  const right = []
  if (by) right.push(Text({ color: roles.agent(by), children: [`◆ ${clip(mask(by), 20)}`] }))
  right.push(Text(long ? { color: roles.heat, children: [` · ${minutes(now - t.startedAt)}`] } : { dimColor: true, children: [` · ${minutes(now - t.startedAt)}`] }))
  if (more) right.push(Text({ dimColor: true, children: [`  +${more} running`] }))
  return Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    columnGap: 2,
    children: [
      Box({ flexDirection: 'row', flexShrink: 1, columnGap: 1, children: [spinner(el, v, `spin-${t.id}`), Text({ bold: true, wrap: 'truncate-end', children: [`${t.size}  ${mask(t.title)}`] })] }),
      Box({ flexDirection: 'row', flexShrink: 0, children: right }),
    ],
  })
}

function doneRow(el, v, t) {
  const took = t.doneAt > t.startedAt ? minutes(t.doneAt - t.startedAt) : ''
  return el.Text({ dimColor: true, wrap: 'truncate-end', children: [`✓ ${t.size}  ${v.mask(t.title)}${took ? '  ' + took : ''}`] })
}

function nextRow(el, v, t) {
  return el.Text({ dimColor: true, wrap: 'truncate-end', children: [`  next ○ ${t.size}  ${v.mask(t.title)}`] })
}

function notableRow(el, v) {
  const { g, mask, roles } = v
  if (g.check && g.check.met === false && g.check.reason) {
    return el.Text({ color: roles.attention, wrap: 'truncate-end', children: [`Goal check: not met yet: ${mask(g.check.reason)}`] })
  }
  if (g.interrupted) return el.Text({ color: roles.attention, children: ['interrupted'] })
  if (isPaused(g) && progress(g).doneN < progress(g).n) return el.Text({ color: roles.attention, children: ['⏸ paused, waiting on you'] })
  return null
}

// ---------- the band ----------

export function drawBand(el, v) {
  const { Box, Text } = el
  const { g, now, roles } = v
  const p = progress(g)
  const mark = Text({ color: roles.activeStill, children: ['◎ '] })

  if (g.status === 'running' && !g.planAt) {
    const wait = Text({ dimColor: true, wrap: 'truncate-end', children: [v.nudged ? 'No plan yet: reminded Claude to plan with Waypoints' : "Waiting for Claude's task plan…"] })
    return Box({
      flexDirection: 'column',
      children: [headerRow(el, v, mark, [Text({ dimColor: true, children: ['planning…'] })]), Box({ flexDirection: 'row', columnGap: 1, children: [spinner(el, v, 'spin-plan'), wait] })],
    })
  }

  if (g.status !== 'running') {
    const finished = g.status === 'met'
    if (!finished) return Box({ flexDirection: 'column', children: [headerRow(el, v, mark, [Text({ dimColor: true, children: ['stopped'] })])] })
    if (now - g.endedAt >= FULL_MS) {
      const ok = Text({ color: roles.ok, children: ['✓ '] })
      const took = minutes((g.endedAt || now) - g.startedAt)
      return Box({ flexDirection: 'column', children: [headerRow(el, v, ok, [Text({ dimColor: true, children: [`${p.n} tasks · done in ${took}`] })])] })
    }
  }

  const tasks = live(g).sort((a, b) => a.id - b.id)
  const right = []
  if (g.status === 'met') {
    right.push(Text({ color: roles.ok, bold: true, children: [`done ✓ in ${minutes((g.endedAt || now) - g.startedAt)}`] }))
  } else {
    const t = eta(g, now)
    right.push(Text({ children: [Text({ color: roles.activeStill, bold: true, children: [`${p.doneN} of ${p.n} · ${p.pct}%`] }), t ? Text({ dimColor: true, children: [` · ~${minutes(t.ms)}`] }) : null].filter(Boolean) }))
  }
  const head = headerRow(el, v, mark, right)

  // the route fills the width, less the dim +k when the plan grew
  const grew = g.firstPlan && p.n > g.firstPlan ? ` +${p.n - g.firstPlan}` : ''
  const room = Math.max(8, v.width - grew.length)
  const { cells } = routeCells(tasks, room, { finished: g.status === 'met' })
  const parts = { head: [head, routeRow(el, v, cells, grew, tasks)], now: [], next: [], note: [] }

  const active = tasks.filter((t) => t.status === 'active')
  if (active.length) {
    active.slice(0, 2).forEach((t, i) => parts.now.push(nowRow(el, v, t, i === 1 ? Math.max(0, active.length - 2) : 0)))
  } else {
    const last = lastDone(tasks)
    if (last) parts.now.push(doneRow(el, v, last))
  }
  const pending = tasks.find((t) => t.status === 'pending')
  if (pending && g.status === 'running') parts.next.push(nextRow(el, v, pending))
  const note = g.status === 'running' ? notableRow(el, v) : null
  if (note) parts.note.push(note)

  // short of room, the rows give way in this order: next, notable, now
  const max = v.maxRows > 0 ? v.maxRows : Infinity
  let total = parts.head.length + parts.now.length + parts.next.length + parts.note.length
  for (const k of ['next', 'note', 'now']) {
    while (total > max && parts[k].length) {
      parts[k].pop()
      total -= 1
    }
  }
  return Box({ flexDirection: 'column', children: [...parts.head, ...parts.now, ...parts.next, ...parts.note] })
}

// ---------- the pane ----------

const BAR_CELLS = 12 // the longest finished task's duration bar
const NO_CONNECTORS_OVER = 10 // tasks; past this the trail is rows alone

// 30s, 4m, 1h05m: short enough for a column
export function short(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  return s < 60 ? s + 's' : minutes(s * 1000)
}

// The line under the pane's title: the numbers, elapsed, the ETA, growth, goal checks
export function statsLine(g, p, now) {
  if (g.status === 'met') return `done ✓ in ${minutes((g.endedAt || now) - g.startedAt)}`
  if (g.status !== 'running') return 'stopped'
  if (!g.planAt) return 'planning…'
  const parts = [`${p.doneN} of ${p.n} · ${p.pct}%`, `${minutes(now - g.startedAt)} elapsed`]
  const t = eta(g, now)
  if (t) parts.push(`~${minutes(t.ms)} left (≈${clock(t.at)})`)
  else if (p.doneN < 2) parts.push('ETA after 2 tasks finish')
  if (g.firstPlan && p.n > g.firstPlan) parts.push(`plan grew ${g.firstPlan} → ${p.n}`)
  if (g.checks) parts.push(`${g.checks} goal check${g.checks === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function trailRow(el, v, t, i, count, barOf, titleW) {
  const { Box, Text } = el
  const { now, mask, roles } = v
  const last = i === count - 1
  const glyph = t.status === 'dropped' ? '×' : t.status === 'active' ? '◉' : last ? '◎' : t.status === 'done' ? '●' : '○'
  const color = t.status === 'done' ? roles.done(count > 1 ? i / (count - 1) : 0) : t.status === 'active' ? roles.activeStill : roles.pending
  const title = clip(mask(t.title), titleW - 3)
  const body =
    t.status === 'dropped'
      ? Text({ dimColor: true, strikethrough: true, children: [`${t.size}  ${title}`] })
      : Text({ bold: t.status === 'active', dimColor: t.status === 'pending', children: [`${t.size}  ${title}`] })
  const tail = []
  if (t.status === 'done') {
    const dur = t.doneAt - t.startedAt
    if (dur > 0) tail.push(Text({ color: roles.done(count > 1 ? i / (count - 1) : 0), children: ['▅'.repeat(barOf(dur))] }), Text({ dimColor: true, children: [' ' + short(dur)] }))
  } else if (t.status === 'active') {
    const by = byOf(t)
    if (by) tail.push(Text({ color: roles.agent(by), children: [`◆ ${clip(mask(by), 20)}`] }), Text({ dimColor: true, children: [' · '] }))
    tail.push(Text({ color: runsLong(v.g, t, now) ? roles.heat : undefined, dimColor: !runsLong(v.g, t, now), children: [`running ${short(now - t.startedAt)}`] }))
  } else if (t.status === 'dropped') {
    tail.push(Text({ dimColor: true, children: [t.note ? `dropped: ${mask(t.note)}` : 'dropped'] }))
  }
  // the tail is one Text, so its pieces sit side by side with no column gap between them
  return Box({ flexDirection: 'row', columnGap: 1, children: [Text({ color, children: [glyph] }), Box({ width: titleW, flexShrink: 0, children: [body] }), ...(tail.length ? [Text({ children: tail })] : [])] })
}

function connectorRow(el, v, above) {
  return above.status === 'done' ? el.Text({ color: v.roles.done(0.5), children: ['┃'] }) : el.Text({ dimColor: true, children: ['┆'] })
}

function otherRow(el, v, g) {
  const { Box, Text } = el
  const { now, mask, roles } = v
  const p = progress(g)
  const name = clip(mask(`${g.label || basename(g.cwd)}: ${g.title}`), Math.max(16, Math.floor(v.width * 0.35)))
  let tail
  if (g.status === 'met') tail = 'done ✓'
  else if (g.status !== 'running') tail = 'stopped'
  else if (!g.planAt) tail = 'planning'
  else {
    const t = eta(g, now)
    tail = `${p.pct}% · ${t ? '~' + minutes(t.ms) : p.doneN + '/' + p.n}`
  }
  const { cells } = miniRoute(g)
  const route = runs(cells, (c) => colorOf(roles, c)).map((r) => Text({ color: r.color, children: [r.text] }))
  return Box({
    flexDirection: 'row',
    columnGap: 2,
    children: [Text({ wrap: 'truncate-end', children: [name] }), Box({ flexDirection: 'row', children: route }), Text(g.status === 'met' ? { color: roles.ok, children: [tail] } : { dimColor: true, children: [tail] })],
  })
}

// view adds: others (the other chats' goals), sessionId, commandName, settings
export function drawPane(el, v) {
  const { Box, Text } = el
  const { g, mask, roles } = v
  const rows = []
  if (g) {
    const p = progress(g)
    rows.push(Text({ bold: true, wrap: 'truncate-end', children: [`◎ ${label(g)}: ${mask(g.title)}`] }))
    rows.push(Text({ dimColor: true, wrap: 'truncate-end', children: ['  ' + statsLine(g, p, v.now)] }))
    rows.push(Text({ children: [' '] }))
    const tasks = g.tasks.filter((t) => !t.replaced)
    if (!tasks.length) rows.push(Text({ dimColor: true, children: ['No task plan yet.'] }))
    const longest = Math.max(1, ...tasks.filter((t) => t.status === 'done').map((t) => t.doneAt - t.startedAt))
    const barOf = (dur) => Math.max(1, Math.round((BAR_CELLS * dur) / longest))
    const titleW = Math.max(16, Math.min(48, v.width - 34))
    tasks.forEach((t, i) => {
      rows.push(trailRow(el, v, t, i, tasks.length, barOf, titleW))
      if (i < tasks.length - 1 && tasks.length <= NO_CONNECTORS_OVER) rows.push(connectorRow(el, v, t))
    })
    if (g.check && g.check.reason) {
      rows.push(Text({ children: [' '] }))
      rows.push(Text(g.check.met === false ? { color: roles.attention, children: [`Last goal check: not met yet: ${mask(g.check.reason)}`] } : { dimColor: true, children: [`Last goal check: ${mask(g.check.reason)}`] }))
    }
  } else {
    rows.push(Text({ dimColor: true, children: ['No goal in this chat. Type /goal <what done looks like> to start one.'] }))
  }
  const rest = (v.others || []).filter((o) => o.sessionId !== v.sessionId)
  rows.push(Text({ children: [' '] }))
  rows.push(Text({ bold: true, children: [`Other chats (${rest.length})`] }))
  if (!rest.length) rows.push(Text({ dimColor: true, children: ['No other chat has a goal in the last 12 hours.'] }))
  for (const o of rest.slice(0, 15)) rows.push(otherRow(el, v, o))
  rows.push(Text({ children: [' '] }))
  const s = v.settings || {}
  const c = v.commandName || 'waypoints'
  rows.push(Text({ dimColor: true, children: [`/${c} hide|show · strict ${s.strict ? 'off' : 'on'} · auto ${s.auto ? 'off' : 'on'} · clear · look: /config → Waypoints`] }))
  return Box({ flexDirection: 'column', children: rows })
}
