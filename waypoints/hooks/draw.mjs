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
//   svg,      the surface paints Svg (Desktop, mobile): the engine's `e.surface` says so, as
//             the terminal's element table lists `Svg` too and cannot tell them apart
// }
// A surface that paints Svg gets the route as one Svg and a still spinner; the terminal
// gets Text runs and the Client animations.

import { minutes, clock, clip, basename } from './fmt.mjs'
import { progress, eta, live, weight } from './plan.mjs'
import { routeCells, miniRoute, runs, FLAG, FLAG_DONE, PARKED, RUNNING } from './route.mjs'
import { routeSvg, routeAlt, svgWidth } from './svg.mjs'
import { NOTE_AT, OTHERS_MS } from './prune.mjs'
import { VERSION } from './version.mjs'

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

// The parked tasks in a few words: one names its blocker (when `withNote`), more are counted
function parkedWords(p, mask, withNote) {
  const parked = p.parked || []
  const n = parked.length
  if (!n) return ''
  const note = parked[0].note
  return n === 1 && withNote && note ? `1 parked: ${mask(note)}` : `${n} parked`
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
  const svg = v.svg && el.Svg
  const animate = v.pulse && !svg
  const kids = []
  if (svg) {
    const p = progress(v.g)
    const running = tasks.map((t, i) => (t.status === 'active' ? i + 1 : 0)).filter(Boolean)
    const width = svgWidth(v.width)
    const source = routeSvg(cells, { hex: v.roles.hex, level: v.level, width, finishId: finishing ? `${v.g.startedAt}-${v.g.endedAt}` : '' })
    kids.push(el.Svg({ key: 'route', source, alt: routeAlt(p.doneN, p.n, running, p.parked.length), width, height: 14 }))
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
  if (v.level === 'off' || v.svg || !v.pulse) return el.Text({ color: v.roles.activeStill, children: [RUNNING] })
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
  // parked tasks are left out of n, so only an open task of this chat's own waits on the person
  const p = progress(g)
  if (isPaused(g) && p.doneN < p.n) {
    // the turn ended but background work it started still runs (an agent, a shell, a
    // monitor), and its end wakes the session: nothing waits on the person
    const waiting = v.waiting || []
    if (waiting.length) {
      const what = waiting.length === 1 ? mask(waiting[0]) : `${waiting.length} background tasks`
      return el.Text({ dimColor: true, wrap: 'truncate-end', children: [`◆ waiting on ${what}`] })
    }
    return el.Text({ color: roles.attention, children: ['⏸ paused, waiting on you'] })
  }
  // someone outside the chat has the ball: worth a glance, not the person's attention
  if (p.parked.length) {
    const more = p.parked.length > 1 ? `  +${p.parked.length - 1}` : ''
    return el.Text({ dimColor: true, wrap: 'truncate-end', children: [`${PARKED} parked: ${mask(p.parked[0].note || '')}${more}`] })
  }
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
      // a parked task outlives the finish here, so green is not read as "all of it is done"
      const parked = parkedWords(p, v.mask, true)
      return Box({ flexDirection: 'column', children: [headerRow(el, v, ok, [Text({ dimColor: true, children: [`${p.n} tasks · done in ${took}${parked ? ' · ' + parked : ''}`] })])] })
    }
  }

  const tasks = live(g).sort((a, b) => a.id - b.id)
  const parked = parkedWords(p, v.mask, false)
  const right = []
  if (g.status === 'met') {
    right.push(Text({ color: roles.ok, bold: true, children: [`done ✓ in ${minutes((g.endedAt || now) - g.startedAt)}`] }))
    if (parked) right.push(Text({ dimColor: true, children: [parked] }))
  } else {
    const t = eta(g, now)
    right.push(
      Text({
        children: [
          Text({ color: roles.activeStill, bold: true, children: [`${p.doneN} of ${p.n} · ${p.pct}%`] }),
          t ? Text({ dimColor: true, children: [` · ~${minutes(t.ms)}`] }) : null,
          parked ? Text({ dimColor: true, children: [` · ${parked}`] }) : null,
        ].filter(Boolean),
      }),
    )
  }
  const head = headerRow(el, v, mark, right)

  // the route fills the width, less the dim +k when the plan grew (parked tasks count:
  // they are on the route, and they were in the first plan)
  const grew = g.firstPlan && tasks.length > g.firstPlan ? ` +${tasks.length - g.firstPlan}` : ''
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

// Where the plan last changed course: "revised after #3" ("revised" before any task was done)
function revisedWords(r) {
  return r.after ? `revised after #${r.after}` : 'revised'
}

// The line under the pane's title: the numbers, elapsed, the ETA, growth, parked tasks,
// the latest revision, goal checks
export function statsLine(g, p, now, mask = (s) => s) {
  const parked = parkedWords(p, mask, false)
  if (g.status === 'met') return `done ✓ in ${minutes((g.endedAt || now) - g.startedAt)}` + (parked ? ` · ${parked}` : '')
  if (g.status !== 'running') return 'stopped'
  if (!g.planAt) return 'planning…'
  const parts = [`${p.doneN} of ${p.n} · ${p.pct}%`, `${minutes(now - g.startedAt)} elapsed`]
  const t = eta(g, now)
  if (t) parts.push(`~${minutes(t.ms)} left (≈${clock(t.at)})`)
  else if (p.doneN < 2) parts.push('ETA after 2 tasks finish')
  const n = live(g).length
  if (g.firstPlan && n > g.firstPlan) parts.push(`plan grew ${g.firstPlan} → ${n}`)
  if (parked) parts.push(parked)
  const revs = g.revisions || []
  if (revs.length) parts.push(revisedWords(revs[revs.length - 1]))
  if (g.checks) parts.push(`${g.checks} goal check${g.checks === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function trailRow(el, v, t, i, count, barOf, titleW) {
  const { Box, Text } = el
  const { now, mask, roles } = v
  const last = i === count - 1
  // the last task's node is the destination flag, raised once that task is done
  const glyph =
    t.status === 'dropped' ? '×' : t.status === 'parked' ? PARKED : t.status === 'active' ? RUNNING : last ? (t.status === 'done' ? FLAG_DONE : FLAG) : t.status === 'done' ? '●' : '○'
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
  } else if (t.status === 'parked') {
    tail.push(Text({ dimColor: true, children: [`parked: ${mask(t.note || '')}`] }))
  } else if (t.rev) {
    tail.push(Text({ dimColor: true, children: ['revised'] }))
  }
  // the tail is one Text, so its pieces sit side by side with no column gap between them
  // the running task's star twinkles here as on the route: a Client on the terminal, still elsewhere
  const twinkle = t.status === 'active' && v.pulse && !v.svg && v.level !== 'off'
  const node = twinkle ? v.pulse(`pane-node-${t.id}`, { kind: 'node', colors: [...roles.active], breathe: v.level === 'full' }, 1) : Text({ color, children: [glyph] })
  return Box({ flexDirection: 'row', columnGap: 1, children: [node, Box({ width: titleW, flexShrink: 0, children: [body] }), ...(tail.length ? [Text({ children: tail })] : [])] })
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
  const { mask, roles } = v
  // this chat's finished goal goes an hour after it ended, as another chat's does from the list
  const g = v.g && v.g.status !== 'running' && v.g.endedAt && v.now - v.g.endedAt > OTHERS_MS ? null : v.g
  const rows = []
  if (g) {
    const p = progress(g)
    rows.push(Text({ bold: true, wrap: 'truncate-end', children: [`◎ ${label(g)}: ${mask(g.title)}`] }))
    rows.push(Text({ dimColor: true, wrap: 'truncate-end', children: ['  ' + statsLine(g, p, v.now, mask)] }))
    rows.push(Text({ children: [' '] }))
    const tasks = g.tasks.filter((t) => !t.replaced)
    if (!tasks.length) rows.push(Text({ dimColor: true, children: ['No task plan yet.'] }))
    const longest = Math.max(1, ...tasks.filter((t) => t.status === 'done').map((t) => t.doneAt - t.startedAt))
    const barOf = (dur) => Math.max(1, Math.round((BAR_CELLS * dur) / longest))
    const titleW = Math.max(16, Math.min(48, v.width - 34))
    tasks.forEach((t, i) => {
      rows.push(trailRow(el, v, t, i, tasks.length, barOf, titleW))
      // what a finished task turned out to be, under it: the reason a later step changed
      if (t.status === 'done' && t.note) rows.push(Text({ dimColor: true, wrap: 'truncate-end', children: [`      ${mask(t.note)}`] }))
      if (i < tasks.length - 1 && tasks.length <= NO_CONNECTORS_OVER) rows.push(connectorRow(el, v, t))
    })
    const revs = (g.revisions || []).slice(-3)
    if (revs.length) {
      rows.push(Text({ children: [' '] }))
      for (const r of revs) rows.push(Text({ dimColor: true, wrap: 'truncate-end', children: [`${revisedWords(r)}: ${mask(r.note)}`] }))
    }
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
  if (!rest.length) rows.push(Text({ dimColor: true, children: ['No other chat has a goal in the last hour.'] }))
  for (const o of rest.slice(0, 15)) rows.push(otherRow(el, v, o))
  rows.push(Text({ children: [' '] }))
  const s = v.settings || {}
  const c = v.commandName || 'waypoints'
  const f = v.files
  if (f && f.count > NOTE_AT) rows.push(Text({ dimColor: true, children: [`${f.count} old files in ${f.dir} · /${c} prune, or delete them while no plan is running`] }))
  rows.push(Text({ dimColor: true, children: [`auto: ${s.auto ? 'on' : 'off'} · /${c} hide|show · clear (stop the goal) · look & pane: /config → Waypoints`] }))
  rows.push(Text({ dimColor: true, children: [`waypoints v${VERSION}`] }))
  return Box({ flexDirection: 'column', children: rows })
}
