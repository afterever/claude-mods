// Waypoints: a progress bar for /goal, built from Claude's own task plan.
// (A fork of Nate Herk's goal-meter 1.0.0.)
// - /goal starts it. The mod asks Claude to plan the goal as sized tasks (S, M, L)
//   with the mod's tool, mcp__waypoints__tasks, then mark each task started and
//   done. Claude Code stopped shipping a task-list tool after 2.1.229, so the mod
//   brings its own. A plan made outside a /goal shows the same way.
// - The band above the prompt: the route (the plan as nodes and legs, weighted by
//   size), the ETA at this goal's own pace, what's running and who runs it, the next
//   task, and the goal check's latest "not met yet" reason. The drawing is in draw.mjs.
// - The footer: "◎ goal 69% · ~15m" in every view, terminal and Desktop.
// - /waypoints: a pane with this chat's whole task trail and every other chat's goal.
//   It opens by itself when a plan starts (userConfig pane: auto|off).
//   /waypoints hide|show (the band), /waypoints strict on|off, /waypoints auto on|off,
//   /waypoints clear.
// - The look (userConfig palette, animation) follows Agent-Pulse's by default.
// - A standing line in the system prompt asks Claude to plan any multi-step work,
//   not only a /goal; /waypoints auto off removes it.
// - Each chat writes ~/.claude/mods-data/waypoints/<session>.json for /waypoints.
//   The mod sends no model requests of its own.

import { minutes, clip, bar, basename } from './fmt.mjs'
import { makeMasker } from './privacy.mjs'
import { newGoal, applyAction, progress, eta, parseCheck, isStopWord, normalizeTasks, planSubject, TOOL_SPEC, instruction, standing, nudge, strictDeny } from './plan.mjs'
import { rolesOf, resolveLook } from './palette.mjs'
import { drawBand, drawPane, statsLine, label, FULL_MS } from './draw.mjs'
import { createAutoPane } from './pane.mjs'

const DIR = '/.claude/mods-data/waypoints'
const PANE = 'waypoints'
const RECENT_MS = 3 * 60000 // a finished goal stays on screen this long
const OTHERS_MS = 12 * 3600000 // other chats' goals shown in /waypoints
const REOPEN_MS = 5 * 60000 // a goal closed on its tasks reopens if Claude carries on this soon
const NUDGE_AFTER = 4 // tool calls into a goal with no plan before the reminder
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

let G = null
let sessionId = ''
let home = ''
let cwd = ''
let now = 0
let toolName = 'mcp__waypoints__tasks'
let commandName = 'waypoints'
let settings = { strict: false, auto: true }
let toolFailed = false
let hidden = false
let nudged = false
let callsWithoutPlan = 0
let pendingGoal = null
let paneUp = false // the pane is open (placed or waiting), from $.ui.panes() and ui.close
const autoPane = createAutoPane() // when the pane opens and closes by itself
let options = { palette: 'follow', animation: 'follow', pane: 'auto' }
let look = { palette: 'ember', level: 'subtle' }
let roles = rolesOf('ember')
let others = []
let transcriptPath = ''
const agentNames = new Map()
const runningAgents = new Set()
let rec = { on: false, strict: false }
let mask = (s) => s

function goalFile(id) {
  return `${home}${DIR}/${id}.json`
}

function isRecent(g) {
  return g && g.status !== 'running' && g.endedAt && now - g.endedAt < RECENT_MS
}

async function save($) {
  if (!G || !sessionId) return
  G.updatedAt = now
  try {
    await $.fs.write(goalFile(sessionId), JSON.stringify({ ...G, label: basename(cwd) }))
  } catch {
    // the pane falls back to this chat alone
  }
}

async function restore($) {
  try {
    const path = goalFile(sessionId)
    if (!(await $.fs.exists(path))) return
    const saved = JSON.parse(await $.fs.read(path))
    if (saved && Array.isArray(saved.tasks) && now - (saved.updatedAt || 0) < 24 * 3600000) G = saved
  } catch {
    G = null
  }
}

async function loadOthers($) {
  const dir = home + DIR
  const list = []
  try {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json') || entry.name === sessionId + '.json') continue
      if (now - (entry.mtimeMs || 0) > OTHERS_MS) continue
      try {
        const g = JSON.parse(await $.fs.read(dir + '/' + entry.name))
        if (!g || !Array.isArray(g.tasks)) continue
        if (g.status !== 'running' && now - (g.endedAt || 0) > OTHERS_MS) continue
        list.push(g)
      } catch {
        // a file another chat is writing right now; next refresh reads it
      }
    }
  } catch {
    // no folder yet
  }
  others = list.sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.updatedAt - a.updatedAt)
}

async function readRecording($) {
  try {
    const path = (home || '.') + '/.claude/mods-data/recording.json'
    if (!(await $.fs.exists(path))) rec = { on: false, strict: false }
    else {
      const flag = JSON.parse(await $.fs.read(path))
      rec = { on: !!flag.on, strict: !!flag.on && !!flag.strict }
    }
  } catch {
    rec = { on: false, strict: false }
  }
  mask = rec.on ? makeMasker({ strict: rec.strict }) : (s) => s
}

// The palette and animation to draw with: this mod's own setting, or 'follow' Agent-Pulse's row
async function refreshLook($) {
  let rows = []
  try {
    rows = await $.config.list()
  } catch {
    // no rows: follow falls back to ember / subtle
  }
  const next = resolveLook(options, rows)
  if (next.palette === look.palette && next.level === look.level) return
  look = next
  roles = rolesOf(next.palette)
  $.ui.invalidate('ui.render')
}

// Whether the pane is open: the engine's own record, which survives a reload
async function refreshPanes($) {
  try {
    paneUp = (await $.ui.panes()).some((p) => p.id === PANE)
  } catch {
    // keep the last answer
  }
}

// The first plan of a goal opens the pane, unasked: it never takes the keys from the
// prompt, waits undrawn on a narrow window, and stays shut once the person closed it
async function maybeAutoOpen($) {
  await refreshPanes($)
  if (!autoPane.canOpen(options.pane, G, paneUp)) return
  try {
    await loadOthers($)
    // no `focus`: the pane never asks for the prompt's keys
    await $.ui.open({ id: PANE, title: 'Waypoints', closeOnEscape: true })
    paneUp = true
    autoPane.opened()
  } catch (err) {
    // nobody asked, so no toast; the log keeps the reason
    $.ui.log(`waypoints: the pane did not open (${err && err.message ? err.message : err})`)
  }
}

// A pane the mod opened leaves with the band; one the person opened stays
async function maybeAutoClose($) {
  if (!autoPane.shouldClose(paneUp, !!G && (G.status === 'running' || isRecent(G)))) return
  autoPane.takenOver()
  try {
    await $.ui.close({ id: PANE })
  } catch {
    // already gone
  }
  paneUp = false
}

async function registerCommand($) {
  const spec = { name: 'waypoints', description: 'Waypoints: this chat\'s goal task list and every chat\'s goal (/waypoints hide|show|strict on|off|auto on|off|clear)', argumentHint: '[hide|show|strict on|off|auto on|off|clear]', immediate: true }
  try {
    await $.command.register(spec)
    return 'waypoints'
  } catch {
    try {
      await $.command.register({ ...spec, name: 'waypoints-mod' })
      return 'waypoints-mod'
    } catch {
      return null
    }
  }
}

async function startGoal($, condition) {
  G = newGoal({ sessionId, condition, now, cwd })
  hidden = false
  nudged = false
  callsWithoutPlan = 0
  pendingGoal = null
  await save($)
  $.ui.invalidate('ui.render')
}

async function stopGoal($, status) {
  if (!G || G.status !== 'running') return
  G.status = status
  G.endedAt = now
  G.active = false
  await save($)
  $.ui.invalidate('ui.render')
}

async function finishGoal($, how) {
  if (!G || G.status !== 'running') return
  G.status = 'met'
  G.endedAt = now
  G.active = false
  G.finishedBy = how
  await save($)
  const took = minutes(G.endedAt - G.startedAt)
  $.ui.toast(`${G.kind === 'plan' ? 'Plan' : 'Goal'} done in ${took}: ${clip(mask(G.title), 60)}`)
  $.ui.invalidate('ui.render')
  // the full band keeps FULL_MS, then it is one row: draw again just after
  $.clock.after(FULL_MS + 200, async () => {
    now = await $.clock.now()
    $.ui.invalidate('ui.render')
  })
}

async function serveTool($, e) {
  now = await $.clock.now()
  const action = String(e.action || 'show').toLowerCase()
  const first = normalizeTasks(e.tasks)[0]
  if (!G || (G.status !== 'running' && (action === 'plan' || action === 'add'))) {
    if (!first) return { result: `Waypoints: no plan in this chat yet. Call action "plan" with the tasks first, each { "title": "...", "size": "S" | "M" | "L" }.` }
    // a plan outside /goal: tracked the same way, named after its goal line, else its first task
    G = newGoal({ sessionId, condition: planSubject(e), now, cwd, kind: 'plan' })
    hidden = false
  }
  const by = e.by ? String(e.by) : e.agentId ? agentNames.get(e.agentId) || 'agent' : ''
  const firstPlan = action === 'plan' && !G.planAt
  const r = applyAction(G, e, { now, by })
  if (r.ok) {
    await save($)
    $.ui.invalidate('ui.render')
    if (firstPlan && G.planAt) await maybeAutoOpen($)
  }
  return { result: r.text }
}

// The goal check's verdict. Its row reaches session.append with no content (the
// payload is stored beside it, seen live 2026-10-02), so read the record from
// the end of the chat's log: a few lines, never the whole file (logs reach 200 MB).
async function lastGoalStatus($, since) {
  const path = transcriptPath
  if (!path) return null
  const windows = /^[A-Za-z]:/.test(path)
  const argv = windows
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `Get-Content -LiteralPath '${path.replace(/'/g, "''")}' -Tail 12 -Encoding UTF8`]
    : ['tail', '-n', '12', path]
  let out = ''
  try {
    const r = await $.process.run(argv, { timeoutMs: 15000 })
    out = r.stdout || ''
  } catch {
    return null
  }
  const lines = out.split(/\r?\n/).filter((l) => l.includes('"goal_status"')).reverse()
  for (const line of lines) {
    try {
      const row = JSON.parse(line)
      const a = row.attachment
      if (!a || a.type !== 'goal_status') continue
      // an older check's record is not this check's verdict
      const ts = Date.parse(row.timestamp || '') || 0
      return ts && since && ts < since - 3000 ? null : a
    } catch {
      // a line cut by the tail
    }
  }
  return null
}

// The log is written a moment after the row reaches the hook: read it now, and
// again after 1.5 and 4 seconds when the verdict isn't there yet
async function onCheck($, message, at, attempt = 0) {
  if (!G || G.kind !== 'goal' || G.status !== 'running') return
  let verdict = await lastGoalStatus($, at)
  if (!verdict) {
    // a build that renders the verdict into the row itself
    const blocks = Array.isArray(message.content) ? message.content : []
    const c = parseCheck(blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n'))
    verdict = c.met ? { met: true } : c.notMet ? { met: false, reason: c.reason } : null
  }
  if (!verdict && attempt < 2) {
    $.clock.after(attempt ? 4000 : 1500, async () => {
      now = await $.clock.now()
      await onCheck($, message, at, attempt + 1).catch(() => {})
    })
    return
  }
  if (!verdict || verdict.sentinel) return // the row written when the goal is set
  if (verdict.met) return finishGoal($, 'check')
  G.check = { met: false, reason: clip(verdict.reason || 'no reason given', 300), at: now }
  G.checks += 1
  await save($)
  $.ui.invalidate('ui.render')
}

export function register(on, opts) {
  options = { palette: 'follow', animation: 'follow', pane: 'auto', ...(opts || {}) }
  look = resolveLook(options, [])
  roles = rolesOf(look.palette)

  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
    sessionId = await $.session.id()
    cwd = await $.session.cwd()
    // where Claude Code keeps this chat's log; a settings-hook event confirms it below
    transcriptPath = `${home}/.claude/projects/${String(cwd).replace(/[^A-Za-z0-9]/g, '-')}/${sessionId}.jsonl`
    const saved = await $.store.get('settings')
    if (saved && typeof saved === 'object') settings = { ...settings, ...saved }
    await readRecording($)
    try {
      const reg = await $.tool.register(TOOL_SPEC)
      if (reg && reg.tool) toolName = reg.tool
    } catch (err) {
      toolFailed = true
      $.ui.log(`waypoints: the task tool did not register (${err && err.message ? err.message : err})`)
    }
    commandName = (await registerCommand($)) || commandName
    await restore($)
    await refreshLook($)
    await refreshPanes($)
    $.clock.every(15000, async () => {
      now = await $.clock.now()
      // the fallback for a /config change of Agent-Pulse's that never reached config.set
      await refreshLook($)
      await refreshPanes($)
      if (paneUp) await loadOthers($)
      await maybeAutoClose($)
      if (paneUp || (G && (G.status === 'running' || isRecent(G)))) $.ui.invalidate('ui.render')
    })
    $.clock.every(10000, () => readRecording($).catch(() => {}))
    return next(e)
  })

  // The standing ask for multi-step work outside a /goal, so the global CLAUDE.md
  // needs no line for it. A session section: it sits after the cache boundary and
  // reads the same every request. Left out where no one watches the bar (-p, the
  // bare prompt), for teammates (they must not replace the lead's plan), and when
  // the tool did not register or /waypoints auto off.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const traits = e.traits || []
    if (!settings.auto || toolFailed || traits.some((t) => t === 'bare' || t === 'print' || t === 'teammate')) return r
    return { sections: [...r.sections, { id: 'waypoints:plan', text: standing(toolName), scope: 'session' }] }
  })

  // /goal <condition> starts the meter and asks Claude to plan. The ask rides as
  // the command's hidden note, so the cached prefix is untouched.
  on('command.run', { command: 'goal' }, async ($, e, next) => {
    const args = String(e.args || '').trim()
    const r = await next(e)
    now = await $.clock.now()
    pendingGoal = null
    if (!args) return r
    if (isStopWord(args)) {
      await stopGoal($, 'stopped')
      return r
    }
    await startGoal($, args)
    const notes = r && Array.isArray(r.context) ? r.context : []
    return { ...(r || {}), context: [...notes, instruction(toolName)] }
  })

  // Fallback when /goal reaches the session without a command.run: remember it
  // here and start at turn.start, asking for the plan with an appended note.
  on('prompt.submit', async ($, e, next) => {
    const m = String(e.text || '').match(/^\s*\/goal\s+([\s\S]+)$/)
    if (m && !isStopWord(m[1])) pendingGoal = { args: m[1].trim(), at: await $.clock.now() }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    now = await $.clock.now()
    if (pendingGoal && (!G || G.startedAt < pendingGoal.at)) {
      const args = pendingGoal.args
      await startGoal($, args)
      try {
        await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: instruction(toolName) }] } })
      } catch {
        // the nudge after a few tool calls is the second chance
      }
    }
    pendingGoal = null
    // closed on its tasks, but the goal loop carries on without a new prompt: reopen
    if (G && G.status === 'met' && G.finishedBy === 'tasks' && G.kind === 'goal' && !String(e.text || '').trim() && now - G.endedAt < REOPEN_MS) {
      G.status = 'running'
      G.endedAt = 0
      G.finishedBy = ''
    }
    if (G && G.status === 'running') {
      G.active = true
      G.interrupted = false
    }
    return next(e)
  })

  // The settings hooks' events carry the log's real path
  on('classic.Stop', async ($, e, next) => {
    if (e && typeof e.transcript_path === 'string' && e.transcript_path) transcriptPath = e.transcript_path
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === toolName) return serveTool($, e)
    if (G && G.status === 'running' && G.kind === 'goal' && !G.planAt && !e.agentId) {
      if (settings.strict && WRITERS.has(e.tool)) return { deny: strictDeny(toolName) }
      if (e.tool !== 'ToolSearch') callsWithoutPlan += 1
      if (callsWithoutPlan >= NUDGE_AFTER && !nudged) {
        nudged = true
        try {
          await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: nudge(toolName) }] } })
        } catch {
          // the band says the plan is missing either way
        }
        $.ui.invalidate('ui.render')
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r && r.agentId) {
      agentNames.set(r.agentId, clip(e.name || e.description || e.subagentType || 'agent', 32))
      runningAgents.add(r.agentId)
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
    }
    return r
  })

  // The goal check writes its verdict as an attachment row
  on('session.append', { door: 'attachment' }, async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && e.message && e.message.name === 'goal_status') {
      now = await $.clock.now()
      try {
        await onCheck($, e.message, now)
      } catch {
        // the row is stored whatever the parser makes of it
      }
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    now = await $.clock.now()
    if (e.agentId) {
      runningAgents.delete(e.agentId)
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
      return r
    }
    if (G && G.status === 'running') {
      G.active = false
      G.lastTurnEnd = now
      if (e.isAborted) G.interrupted = true
      const p = progress(G)
      // the turn ended with every task done: finished (the goal check's own
      // verdict, read from the log, usually closed it a moment earlier)
      if (e.reason === 'answer' && !e.isAborted && p.n > 0 && p.doneN === p.n) await finishGoal($, 'tasks')
      else await save($)
      $.ui.invalidate('ui.render')
    }
    return r
  })

  on('command.run', { command: ['waypoints', 'waypoints-mod'] }, async ($, e) => {
    now = await $.clock.now()
    const [key, value] = String(e.args || '').trim().toLowerCase().split(/\s+/)
    if (key === 'strict') {
      settings.strict = value !== 'off'
      await $.store.set('settings', settings)
      $.ui.toast(`Strict planning ${settings.strict ? 'on: no file edits in a /goal before the plan' : 'off'}`)
      return {}
    }
    if (key === 'auto') {
      settings.auto = value !== 'off'
      await $.store.set('settings', settings)
      $.ui.toast(`Standing plan ask ${settings.auto ? 'on: Claude plans any multi-step work' : 'off: only a /goal asks for a plan'}`)
      return {}
    }
    if (key === 'hide' || key === 'show') {
      hidden = key === 'hide'
      $.ui.invalidate('ui.render')
      return {}
    }
    if (key === 'clear') {
      await stopGoal($, 'stopped')
      return {}
    }
    const surface = await $.session.surface()
    if (!surface) return { text: plainText() }
    await openPane($)
    return {}
  })

  // The pane closing: a close by the person is remembered for this goal, so the next plan
  // does not reopen it; the engine dropping it (unload) is not the person's doing
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      paneUp = false
      autoPane.closed(e.origin, G)
    }
    return next(e)
  })

  // Another plugin's /config change that Waypoints follows: the new value is in the rows
  // once the change has gone through
  // (literals, so the engine can read the matcher off the source; FOLLOW_KEYS names the same two)
  on('config.set', { key: ['agent-pulse.palette', 'agent-pulse.animation'] }, async ($, e, next) => {
    const r = await next(e)
    if (!r || !r.deny) await refreshLook($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    if (!G || hidden || !(G.status === 'running' || isRecent(G))) return below
    const el = $.ui.resolve(e)
    // a Client names its module as a literal here, where the engine reads it from
    const pulse = el.Client ? (key, props, width) => el.Client({ key, module: './pulse.mjs', props, width, height: 1 }) : undefined
    const view = {
      g: G,
      now,
      mask,
      roles,
      level: look.level,
      width: Math.max(40, (e.props && e.props.bodyColumns) || 100),
      maxRows: e.props && e.props.maxRows,
      nudged,
      pulse,
      svg: e.surface !== 'terminal',
      open: () => openPane($),
    }
    const mine = drawBand(el, view)
    return el.Box({ flexDirection: 'column', children: below ? [mine, below] : [mine] })
  })

  // The footer shows even when the band is hidden or collapsed
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = footerLabel()
    if (!label) return next(e)
    const modes = Array.isArray(e.props && e.props.modes) ? e.props.modes : []
    return next({ ...e, props: { ...e.props, modes: [...modes, label] } })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const el = $.ui.resolve(e)
    const width = Math.max(50, (e.props && e.props.bodyColumns) || 100)
    return drawPane(el, { g: G, now, mask, roles, level: look.level, width, others, sessionId, commandName, settings })
  })
}

async function openPane($) {
  now = await $.clock.now()
  await loadOthers($)
  autoPane.takenOver() // the person asked: it is theirs now
  paneUp = true
  await $.ui.open({ id: PANE, title: 'Waypoints', focus: true, closeOnEscape: true })
}

// ---------- words ----------

function footerLabel() {
  if (!G) return ''
  const word = G.kind === 'plan' ? 'plan' : 'goal'
  if (G.status === 'running') {
    if (!G.planAt) return `◎ ${word} · planning`
    const p = progress(G)
    const t = eta(G, now)
    return `◎ ${word} ${p.pct}%` + (t ? ` · ~${minutes(t.ms)}` : ` · ${p.doneN}/${p.n}`)
  }
  if (isRecent(G)) return G.status === 'met' ? `◎ ${word} done ✓` : `◎ ${word} stopped`
  return ''
}

const ICON = { done: '✓', active: '▶', pending: '○', dropped: '×' }

function taskTail(t) {
  if (t.status === 'done') return t.doneAt > t.startedAt ? minutes(t.doneAt - t.startedAt) : ''
  if (t.status === 'active') return (t.by ? t.by + ' · ' : '') + 'running ' + minutes(now - t.startedAt)
  if (t.status === 'dropped') return 'dropped' + (t.note ? ': ' + t.note : '')
  return ''
}

// /waypoints where no surface can draw a pane (a -p run)
function plainText() {
  if (!G) return 'No goal in this chat.'
  const p = progress(G)
  const lines = [`${label(G)}: ${mask(G.title)}`, `${statsLine(G, p, now)}  ${bar(p.fraction, 30)}`]
  for (const t of G.tasks.filter((x) => !x.replaced)) lines.push(`${ICON[t.status] || '○'} ${t.size}  ${mask(t.title)}  ${mask(taskTail(t))}`)
  return lines.filter(Boolean).join('\n')
}
