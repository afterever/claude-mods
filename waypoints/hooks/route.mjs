// The route: the plan drawn as a line of nodes and legs. Pure: it returns cells
// { ch, role, t } and knows nothing of colour or the engine; draw.mjs colours them
// and svg.mjs draws the same cells as a picture. Roles: 'done', 'active' (the pulsing
// node), 'pending' (dim, the running leg included) and 'sparkle' (the finish mark).

import { weight } from './plan.mjs'

const MAX_UNIT = 6 // cells per unit of work when there is room to spare

function route(tasks) {
  return tasks.filter((t) => t.status !== 'dropped' && !t.replaced).sort((a, b) => a.id - b.id)
}

function cell(ch, role) {
  return { ch, role, t: 0 }
}

// Cells for a route whose legs are already measured. legs[i] is the length of task i's leg.
function layout(tasks, legs, finished) {
  const cells = []
  // node k is the start of task k (the end of task k-1); a running task lights its start node
  const lit = (k) => tasks[k] && tasks[k].status === 'active'
  for (let k = 0; k <= tasks.length; k++) {
    const last = k === tasks.length
    if (finished) cells.push(last ? cell('✦', 'sparkle') : cell('●', 'done'))
    else if (lit(k)) cells.push({ ...cell('◉', 'active'), id: tasks[k].id })
    else if (last) cells.push(cell('◎', tasks[k - 1].status === 'done' ? 'done' : 'pending'))
    else if (k === 0 || tasks[k - 1].status === 'done') cells.push(cell('●', 'done'))
    else cells.push(cell('○', 'pending'))
    if (last) break
    const done = finished || tasks[k].status === 'done'
    for (let i = 0; i < legs[k]; i++) cells.push(done ? cell('━', 'done') : cell('┄', 'pending'))
  }
  const span = Math.max(1, cells.length - 1)
  cells.forEach((c, i) => (c.t = i / span))
  return cells
}

// One glyph per task, no legs, cut with … when the plan is longer than the room
function dense(tasks, width, finished) {
  const glyph = (t) => (finished || t.status === 'done' ? cell('●', 'done') : t.status === 'active' ? { ...cell('◉', 'active'), id: t.id } : cell('○', 'pending'))
  let cells = tasks.map(glyph)
  if (cells.length > width) cells = [...cells.slice(0, Math.max(0, width - 1)), cell('…', 'pending')]
  const span = Math.max(1, cells.length - 1)
  cells.forEach((c, i) => (c.t = i / span))
  return cells
}

// The band's route, fitted to `width` cells: legs proportional to S/M/L (at least 2 cells),
// then 1 cell each, then dense. `finished` draws it all solid with a ✦ at the end.
export function routeCells(allTasks, width, { finished = false } = {}) {
  const tasks = route(allTasks || [])
  const room = Math.max(1, Math.floor(width))
  if (!tasks.length) return { cells: [], dense: false }
  // the start node, then a leg and a node for each task
  const fits = (legs) => 1 + legs.reduce((a, l) => a + l + 1, 0) <= room
  for (let unit = MAX_UNIT; unit >= 1; unit--) {
    const legs = tasks.map((t) => Math.max(2, weight(t) * unit))
    if (fits(legs)) return { cells: layout(tasks, legs, finished), dense: false }
  }
  const ones = tasks.map(() => 1)
  if (fits(ones)) return { cells: layout(tasks, ones, finished), dense: false }
  return { cells: dense(tasks, room, finished), dense: true }
}

// Another chat's route in the pane: a node and a leg per task, or a glyph per task past maxTasks
export function miniRoute(goal, maxTasks = 12) {
  const tasks = route(goal.tasks || [])
  if (!tasks.length) return { cells: [], dense: false }
  const finished = goal.status === 'met'
  if (tasks.length > maxTasks) return { cells: dense(tasks, tasks.length, finished), dense: true }
  return { cells: layout(tasks, tasks.map(() => 1), finished), dense: false }
}

// Merge neighbouring cells that take the same colour into runs { text, color }, so a
// tick of drawing is a few Text elements, not one per cell. colorOf(cell) → string | null.
export function runs(cells, colorOf) {
  const out = []
  for (const c of cells) {
    const color = colorOf(c)
    const last = out[out.length - 1]
    if (last && last.color === color) last.text += c.ch
    else out.push({ text: c.ch, color })
  }
  return out
}
