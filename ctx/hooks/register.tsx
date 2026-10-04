import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, Timer } from 'claude-code'

import type { CtxDetail, CtxProjectLog, CtxSample, CtxServer, CtxSnapshot, CtxSpend, CtxWarn } from '../types'
import type { BarRun } from './fmt'
import type { ApiUsage, Piece, Rates } from './cost'
import { addRecent, clipAsk, keepInstructions, mergeInstructions, shouldWarn, warnBadge, warnLevel, warnText } from './compact'
import { addEater, addUsage, calibrate, DEFAULT_CPT, EMPTY_USAGE, estimateTokens, idleSessions, logSession, toolLabel, usageOf } from './usage'
import { VERSION } from './version'
import {
  bandSuffix,
  carry,
  carryLine,
  compacted as noteCompacted,
  compactPlan,
  EMPTY_SPEND,
  fitRates,
  fmtIdle,
  fmtUsd,
  idleCost,
  ledgerAt,
  median,
  missLine,
  rewrite,
  sessionParts,
  shownTurn,
  startTurn,
  stepDone,
  subUsd,
  ttlMs,
  turnDone,
  turnLine,
} from './cost'
import {
  ago,
  barRuns,
  BUFFER_GLYPH,
  compactMarker,
  fillColor,
  FREE_GLYPH,
  fmtCount,
  fmtDelta,
  fmtShare,
  fmtTokens,
  openerFor,
  shareBar,
  shortPath,
  sparkline,
  trend,
  trendLabel,
} from './fmt'

const PANE = 'ctx'
// How often an open pane redraws its "updated 12s ago"; no count runs on it
const TICK_MS = 15000
const SKILL_LIMIT = 12
const GAUGE = 6
// Bar runs and category rows share a hover group per category
const SCOPE = 'ctx:'

// What the drawings read lives in $.state, so a hot reload keeps it
const snap = atom({ plugin: 'ctx', key: 'snap' } as const, null)
const isVisible = atom({ plugin: 'ctx', key: 'isVisible' } as const, false)
const opened = atom({ plugin: 'ctx', key: 'opened' } as const, [])
const mode = atom({ plugin: 'ctx', key: 'mode' } as const, 'summary')
const stale = atom({ plugin: 'ctx', key: 'stale' } as const, false)
const tick = atom({ plugin: 'ctx', key: 'tick' } as const, 0)
// The window's fill after each turn, oldest first, as the API reported it
const history = atom({ plugin: 'ctx', key: 'history' } as const, [])
const HISTORY_LIMIT = 48
const eaters = atom({ plugin: 'ctx', key: 'eaters' } as const, [])
const cptAtom = atom({ plugin: 'ctx', key: 'cpt' } as const, DEFAULT_CPT)
const usage = atom({ plugin: 'ctx', key: 'usage' } as const, EMPTY_USAGE)
const project = atom({ plugin: 'ctx', key: 'project' } as const, null)
// A single result past this many tokens gets a toast as it lands
const TOAST_TOKENS = 15000
// Results smaller than this never make the heaviest list
const EATER_MIN_CHARS = 2000
// A fall this steep between turns is a compaction or a /clear: what was eaten is gone
const DROP_RATIO = 0.7

// Characters of tool results the main conversation took in since the last measurement
let turnChars = 0

const projectKey = async ($: EngineInterface) => 'project:' + (await $.session.cwd())

// Writes this session's line in the project's log: the servers it has loaded, the ones it called
async function logProject($: EngineInterface) {
  try {
    const s = await read($, snap)
    if (!s) return
    const loaded: Record<string, number> = {}
    for (const v of s.servers) if (v.tokens > 0) loaded[v.key] = v.tokens
    const used = Object.keys((await read($, usage)).mcp)
    const { requests, misses } = await read($, spend)
    const key = await projectKey($)
    const log = (await $.store.get(key)) as CtxProjectLog | undefined
    await $.store.set(key, logSession(log, await $.session.id(), loaded, used, { requests, misses }))
  } catch {
    // the log is a convenience: the pane still counts this session
  }
}

const compacted = atom({ plugin: 'ctx', key: 'compacted' } as const, [])
const edited = atom({ plugin: 'ctx', key: 'edited' } as const, [])
const asks = atom({ plugin: 'ctx', key: 'asks' } as const, [])
const autokeep = atom({ plugin: 'ctx', key: 'autokeep' } as const, false)
const warned = atom({ plugin: 'ctx', key: 'warned' } as const, 'none')
const EDIT_LIMIT = 12
const ASK_LIMIT = 3
// What the session spent, per turn, from the engine's cost ledger
const spend = atom({ plugin: 'ctx', key: 'spend' } as const, EMPTY_SPEND)
const costOn = atom({ plugin: 'ctx', key: 'costOn' } as const, true)
// A compaction's summary when none has been seen yet, in tokens
const SUMMARY_TOKENS = 8000

// The prices of the model the main loop answers with, once the ledger has taught them
function ratesOf(s: CtxSpend): Rates | undefined {
  const model = shownTurn(s)?.model || s.cur?.model
  return model ? fitRates(s.samples, model) : undefined
}

// What the window will be after a compaction: what the last one left, else
// everything but the messages plus a summary
function afterCompact(s: CtxSpend, snapshot: CtxSnapshot | null): number | undefined {
  if (s.compact?.after) return s.compact.after
  const messages = snapshot?.rows.find(r => r.name === 'Messages')
  if (!snapshot || !messages) return undefined
  const fixed = snapshot.rows.filter(r => r.kind === 'used' && r !== messages).reduce((a, r) => a + r.tokens, 0)
  return fixed + (s.compact?.summary ?? SUMMARY_TOKENS)
}

// Main-loop requests per finished turn
function perTurn(s: CtxSpend): number | undefined {
  return s.turns > 0 ? s.requests / s.turns : undefined
}

// After a compaction the ledger says what it cost, and the result how big the window is now
async function priceCompaction($: EngineInterface, r: { tokensAfter?: number; usage?: ApiUsage }, ledger: number | undefined) {
  try {
    const now = (await $.session.usage()).cost?.usd
    const usd = now !== undefined && ledger !== undefined && now > ledger ? now - ledger : undefined
    await update($, spend, s => noteCompacted(now !== undefined ? ledgerAt(s, now) : s, { after: r.tokensAfter, usd, summary: r.usage?.output_tokens }))
  } catch {
    // the toast goes out without the price
  }
}

// A compaction happened since the last reading: the next one carries the mark
let pendingMark = false
// The mod's own compaction is under way: compactNow follows it up, so the
// session.compact hook must not do it a second time should it hear it
let selfCompact = false

// The last `n` flags, padded in front: readings from before marks existed read as unmarked
function alignFlags(flags: readonly boolean[], n: number): boolean[] {
  return [...Array<boolean>(Math.max(0, n - flags.length)).fill(false), ...flags.slice(-n)]
}

async function record($: EngineInterface, tokens: number) {
  const past = await read($, history)
  if (past[past.length - 1] === tokens) return
  const mark = pendingMark
  pendingMark = false
  await update($, compacted, flags => [...alignFlags(flags, past.length), mark].slice(-HISTORY_LIMIT))
  await update($, history, list => [...list, tokens].slice(-HISTORY_LIMIT))
}

// The newest reading of the window, the API's when there is one
async function latestTokens($: EngineInterface): Promise<number | undefined> {
  const past = await read($, history)
  return past[past.length - 1] ?? (await read($, snap))?.total
}

// How close auto-compaction is right now, with the turns left at this pace
async function warning($: EngineInterface): Promise<{ level: CtxWarn; tokens: number; compactAt?: number; turnsLeft?: number }> {
  const s = await read($, snap)
  const tokens = (await latestTokens($)) ?? 0
  const compactAt = s?.compactAt
  const turnsLeft = trend(await read($, history), compactAt).turnsLeft
  return { level: warnLevel(tokens, compactAt, turnsLeft), tokens, compactAt, turnsLeft }
}

async function keepText($: EngineInterface, focus?: string): Promise<string> {
  return keepInstructions({ focus, edited: await read($, edited), asks: await read($, asks) })
}

// Once a compaction stands: the next reading is marked, what was eaten and
// warned of starts over, and the drop is toasted when the new count lands
async function afterCompaction($: EngineInterface, before: number | undefined) {
  pendingMark = true
  await update($, eaters, () => [])
  await update($, warned, () => 'none')
  await refresh($)
  const s = await read($, snap)
  if (before === undefined || !s) return
  let text = `Compacted ${fmtTokens(before)} → ~${fmtTokens(s.total)} (${fmtDelta(s.total - before)})`
  if (await read($, costOn)) {
    const sp = await read($, spend)
    const r = ratesOf(sp)
    if (sp.compact?.usd) text += ` · summary ${fmtUsd(sp.compact.usd)}`
    if (r) text += ` · now ~${fmtUsd(carry(s.total, r))}/request (was ~${fmtUsd(carry(before, r))})`
  }
  $.ui.toast(text)
}

// Compacts now, the summary told what this session is in the middle of. The
// mod's own session.compact hook does not hear its own call, so this follows up itself
async function compactNow($: EngineInterface, focus?: string) {
  $.ui.toast('Compacting…')
  try {
    const before = await latestTokens($)
    const ledger = (await read($, spend)).ledger
    selfCompact = true
    const r = await $.session.compact({ instructions: await keepText($, focus) }).finally(() => {
      selfCompact = false
    })
    if ('skip' in r && r.skip) $.ui.toast(`Compaction skipped: ${r.skip}`)
    else if (r.messages) {
      await priceCompaction($, r, ledger)
      await afterCompaction($, before)
    }
  } catch {
    $.ui.toast('Could not compact right now')
  }
}

async function setAutokeep($: EngineInterface, value: boolean) {
  await update($, autokeep, () => value)
  try {
    await $.store.set('autokeep', value)
  } catch {
    // on for this session still
  }
  $.ui.toast(value ? 'Autokeep on: every compaction keeps your files and latest requests' : 'Autokeep off')
}

async function setCost($: EngineInterface, value: boolean) {
  await update($, costOn, () => value)
  try {
    await $.store.set('cost', value)
  } catch {
    // for this session still
  }
  $.ui.toast(value ? 'Cost on: dollar figures beside the tokens' : 'Cost off: tokens only')
}

// Opens a memory file with the host's default app for it
async function openFile($: EngineInterface, path: string) {
  const name = shortPath(path)
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const os =
      (await $.env.get('OS')) === 'Windows_NT' || /^[A-Za-z]:[\\/]/.test(path)
        ? 'windows'
        : path.startsWith('/Users/') || home.startsWith('/Users/')
          ? 'mac'
          : 'linux'
    const { exitCode, stderr } = await $.process.run(openerFor(path, os), { timeoutMs: 15000 })
    await $.ui.toast(exitCode === 0 ? `Opened ${name}` : `Couldn't open ${name}: ${stderr.trim().split('\n')[0] || `exit ${exitCode}`}`)
  } catch {
    // no host to run on (the Desktop app), or the opener is missing
    await $.ui.toast(`Couldn't open ${name}`)
  }
}

function toSnapshot(b: SessionContextBreakdown, detail: CtxDetail, at: number): CtxSnapshot {
  const byServer = new Map<string, CtxServer>()
  for (const t of b.mcpTools) {
    const key = /^mcp__(.+?)__/.exec(t.name)?.[1] ?? t.serverName
    const s = byServer.get(t.serverName) ?? { name: t.serverName, key, tokens: 0, count: 0, deferredTokens: 0, deferredCount: 0 }
    if (t.isLoaded) {
      s.tokens += t.tokens
      s.count += 1
    } else {
      s.deferredTokens += t.tokens
      s.deferredCount += 1
    }
    byServer.set(t.serverName, s)
  }
  const servers = [...byServer.values()].sort((x, y) => y.tokens - x.tokens || y.deferredTokens - x.deferredTokens)
  const sum = (xs: { tokens: number }[]) => xs.reduce((a, x) => a + x.tokens, 0)
  return {
    rows: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    total: b.totalTokens,
    max: b.rawMaxTokens,
    percent: b.percentage,
    detail,
    at,
    model: b.model,
    compactAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
    mcpTokens: sum(servers),
    mcpCount: servers.reduce((a, s) => a + s.count, 0),
    mcpDeferredTokens: servers.reduce((a, s) => a + s.deferredTokens, 0),
    mcpDeferredCount: servers.reduce((a, s) => a + s.deferredCount, 0),
    servers,
    memory: b.memoryFiles.map(f => ({ path: f.path, type: f.type, tokens: f.tokens })),
    skillCount: b.skills?.totalSkills ?? 0,
    skillIncluded: b.skills?.includedSkills ?? 0,
    skillTokens: b.skills?.tokens ?? 0,
    skills: (b.skills?.skillFrontmatter ?? []).map(s => ({ name: s.name, tokens: s.tokens })).sort((x, y) => y.tokens - x.tokens),
    agentTokens: sum(b.agents),
    agents: b.agents.map(a => ({ name: a.agentType, tokens: a.tokens })).sort((x, y) => y.tokens - x.tokens),
    commandCount: b.slashCommands?.totalCommands ?? 0,
    commandIncluded: b.slashCommands?.includedCommands ?? 0,
    commandTokens: b.slashCommands?.tokens ?? 0,
  }
}

// Counts can overlap (a turn ends while an exact count is out): the one
// started last wins, so a slow older count never overwrites a newer one
let started = 0
let landed = 0

// Counts at the mode the person chose, so an exact count stays exact
async function refresh($: EngineInterface) {
  const detail = await read($, mode)
  const id = ++started
  try {
    const { context } = await $.session.usage({ breakdown: detail })
    const b = context.breakdown
    if (!b || id < landed) return
    landed = id
    const at = await $.clock.now()
    await update($, snap, () => toSnapshot(b, detail, at))
    await update($, stale, () => false)
  } catch {
    // no session bound yet, or the count failed: the last snapshot stays, marked
    if (await read($, snap)) await update($, stale, () => true)
  }
}

// The pane docks beside the transcript in the fullscreen layout (from 110
// columns), like /diff; on the main screen it sits above the prompt instead
const PANE_ARGS = { id: PANE, title: 'Context window', closeOnEscape: true, columns: 48, rows: 26 } as const

// Redraws "updated 12s ago" while the pane is open
let ticker: Timer | undefined

function startTicker($: EngineInterface) {
  ticker ??= $.clock.every(TICK_MS, () => void update($, tick, n => n + 1))
}

function stopTicker() {
  ticker?.cancel()
  ticker = undefined
}

async function setVisible($: EngineInterface, value: boolean, focus = false) {
  await update($, isVisible, () => value)
  try {
    await $.store.set('visible', value)
  } catch {
    // the toggle still works for this session
  }
  if (value) {
    // open first: the count fills the pane in as it lands
    await $.ui.open(focus ? { ...PANE_ARGS, focus: true } : PANE_ARGS)
    startTicker($)
    void refresh($)
  } else {
    stopTicker()
    await $.ui.close({ id: PANE })
  }
}

async function toggleVisible($: EngineInterface) {
  await setVisible($, !(await read($, isVisible)))
}

async function setMode($: EngineInterface, value: CtxDetail) {
  await update($, mode, () => value)
  await refresh($)
}

async function toggleOpen($: EngineInterface, key: string) {
  await update($, opened, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
}

type El = ReturnType<EngineInterface['ui']['resolve']>

// The segmented bar: one Text per run, each in its category's hover group
function Bar({ el, runs }: { el: El; runs: BarRun[] }) {
  const { Box, Text } = el
  return (
    <Box flexDirection="row" flexShrink={0}>
      {runs.map(r => (
        <Text
          color={r.color}
          {...(r.bg ? { backgroundColor: r.bg } : {})}
          {...(r.dim ? { dimColor: true } : {})}
          hover={{ scope: SCOPE + r.scope, inverse: true }}
        >
          {r.text}
        </Text>
      ))}
    </Box>
  )
}

// "81.9k/1M·" dim, then the percent bold in green, amber or red
function Fill({ el, s }: { el: El; s: CtxSnapshot }) {
  const { Box, Text } = el
  return (
    <Box flexDirection="row" flexShrink={0}>
      <Text dimColor>{`${fmtTokens(s.total)}/${fmtTokens(s.max)}·`}</Text>
      <Text bold color={fillColor(s.percent)}>{`${Math.round(s.percent)}%`}</Text>
    </Box>
  )
}

// The fill per turn: dim history, the latest reading lit in the fill's color
// The fill per turn: dim history, compactions lit in blue, the latest
// reading in the fill's color
function Spark({ el, values, marks, width, percent }: { el: El; values: readonly number[]; marks: readonly boolean[]; width: number; percent: number }) {
  const { Box, Text } = el
  const glyphs = [...sparkline(values, width)]
  const flags = alignFlags(marks, values.length).slice(-glyphs.length)
  const runs: { text: string; kind: 'past' | 'mark' | 'last' }[] = []
  glyphs.forEach((g, i) => {
    const kind = i === glyphs.length - 1 ? 'last' : flags[i] ? 'mark' : 'past'
    const run = runs[runs.length - 1]
    if (run && run.kind === kind) run.text += g
    else runs.push({ text: g, kind })
  })
  return (
    <Box flexDirection="row" flexShrink={0}>
      {runs.map(r =>
        r.kind === 'past' ? (
          <Text color="claude" dimColor>{r.text}</Text>
        ) : r.kind === 'mark' ? (
          <Text color="permission" bold>{r.text}</Text>
        ) : (
          <Text color={fillColor(percent)} bold>{r.text}</Text>
        ),
      )}
    </Box>
  )
}

// Pieces of text, each in its tone: the band's last-turn suffix
function Pieces({ el, pieces }: { el: El; pieces: Piece[] }) {
  const { Box, Text } = el
  return (
    <Box flexDirection="row" flexShrink={0}>
      {pieces.map(p =>
        p.tone === 'plain' ? (
          <Text>{p.text}</Text>
        ) : p.tone === 'dim' ? (
          <Text dimColor>{p.text}</Text>
        ) : p.tone === 'sub' ? (
          <Text color="permission">{p.text}</Text>
        ) : (
          <Text color={p.tone} bold>{p.text}</Text>
        ),
      )}
    </Box>
  )
}

function Swatch({ el, kind, color, scope }: { el: El; kind: string; color: string; scope: string }) {
  const { Text } = el
  const hover = { scope: SCOPE + scope, inverse: true }
  if (kind === 'free') return <Text color="inactive" dimColor hover={hover}>{FREE_GLYPH}</Text>
  if (kind === 'buffer') return <Text color={color} dimColor hover={hover}>{BUFFER_GLYPH}</Text>
  return <Text color={color} dimColor={kind === 'deferred'} hover={hover}>■</Text>
}

// A detail row under an open section: name on the left, figures on the right
function Item({ el, name, right, truncate = 'truncate-end' }: { el: El; name: string; right: string; truncate?: 'truncate-end' | 'truncate-start' }) {
  const { Box, Text } = el
  return (
    <Box flexDirection="row" width="100%" columnGap={2}>
      <Box flexGrow={1} flexShrink={1}>
        <Text dimColor wrap={truncate}>{'    ' + name}</Text>
      </Box>
      <Text dimColor>{right}</Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'ctx',
        description: 'Context window details (/ctx opens the pane; /ctx show|hide|toggle|exact|quick|compact [focus]|autokeep [on|off]|cost [on|off])',
        argumentHint: '[show|hide|toggle|exact|quick|compact [focus]|autokeep [on|off]|cost [on|off]]',
        immediate: true,
      })
    } catch {
      // the 📊 button still works without the command
    }
    await refresh($)
    try {
      // the project's log as it stood before this session (a hot reload
      // runs this again: this session's own line is left out either way)
      const log = (await $.store.get(await projectKey($))) as CtxProjectLog | undefined
      const id = await $.session.id()
      await update($, project, () => (log ? { sessions: log.sessions.filter(x => x.id !== id) } : null))
    } catch {
      // no history: every streak starts at this session
    }
    try {
      await update($, autokeep, () => false)
      if ((await $.store.get('autokeep')) === true) await update($, autokeep, () => true)
    } catch {
      // autokeep stays off
    }
    try {
      // the ledger as it stands, and the prices earlier sessions taught
      await update($, costOn, () => true)
      if ((await $.store.get('cost')) === false) await update($, costOn, () => false)
      const saved = (await $.store.get('costSamples')) as CtxSample[] | undefined
      if (Array.isArray(saved)) await update($, spend, s => (s.samples.length ? s : { ...s, samples: saved }))
      const usd = (await $.session.usage()).cost?.usd
      if (usd !== undefined) await update($, spend, s => ledgerAt(s, usd))
    } catch {
      // no ledger: the dollar figures stay out
    }
    try {
      // reopen where the person left it; unasked, it waits below 144 columns
      const saved = await $.store.get('visible')
      await update($, isVisible, () => saved === true)
      if (saved === true) {
        void $.ui.open(PANE_ARGS)
        startTicker($)
      }
    } catch {
      // start closed
    }
    return next(e)
  })

  // The engine pushes a measurement when the window's fill moves (after each
  // main-thread turn, a compaction, a /clear): count again then, never on a timer
  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    // the cost ledger, real dollars: the running turn has spent what it grew by
    const usd = e.cost?.usd
    if (usd !== undefined) await update($, spend, s => ledgerAt(s, usd))
    if (e.changed.includes('context')) {
      // the API's own figure, so switching between exact and quick adds no jumps
      const tokens = e.context.tokens
      if (tokens !== undefined) {
        const past = await read($, history)
        const prev = past[past.length - 1]
        if (prev !== undefined && tokens < prev * DROP_RATIO) {
          await update($, eaters, () => [])
          await update($, warned, () => 'none')
        } else if (prev !== undefined) {
          const chars = turnChars
          await update($, cptAtom, cpt => calibrate(cpt, chars, tokens - prev))
        }
        turnChars = 0
        await record($, tokens)
        // warn once per step as auto-compaction nears
        const w = await warning($)
        const was = await read($, warned)
        if (shouldWarn(was, w.level) && w.compactAt) {
          await update($, warned, () => w.level)
          $.ui.toast(warnText(w.level, w.tokens, w.compactAt, w.turnsLeft))
        }
      }
      void refresh($).then(() => logProject($))
    }
    return r
  })

  // Every tool call: which server, skill or agent it used, and, in the main
  // conversation, how much its result added to the window
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    try {
      const args = e as unknown as Record<string, unknown>
      const hit = usageOf(e.tool, args)
      if (hit) await update($, usage, u => addUsage(u, hit))
      // the files the session changed, for what a compaction must keep
      const path = typeof args.file_path === 'string' ? args.file_path : typeof args.notebook_path === 'string' ? args.notebook_path : ''
      const ok = !('isError' in r && r.isError) && !('deny' in r && r.deny)
      if (path && ok && (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit')) {
        await update($, edited, list => addRecent(list, path, EDIT_LIMIT))
      }
      // a subagent's results stay in its own window
      const text = 'text' in r && typeof r.text === 'string' ? r.text : ''
      if (!e.agentId && text.length > 0) {
        turnChars += text.length
        if (text.length >= EATER_MIN_CHARS) {
          const label = toolLabel(e.tool, args)
          const turn = (await $.session.turns()) + 1
          await update($, eaters, list => addEater(list, { tool: e.tool, label, chars: text.length, turn }))
          const tokens = estimateTokens(text.length, await read($, cptAtom))
          if (tokens >= TOAST_TOKENS) $.ui.toast(`${label} added ~${fmtTokens(tokens)} tokens`)
        }
      }
    } catch {
      // counting never gets in the way of the call
    }
    return r
  })

  // A main-loop turn begins (subagents raise none): the one before is frozen,
  // and a clean one is kept, here and for later sessions, to learn prices from
  on('turn.start', async ($, e, next) => {
    try {
      const was = (await read($, spend)).samples
      const s = await update($, spend, startTurn)
      // state hands back copies: a new sample shows in the length or the newest one
      if (s.samples.length !== was.length || s.samples[s.samples.length - 1]?.usd !== was[was.length - 1]?.usd) {
        await $.store.set('costSamples', s.samples)
      }
    } catch {
      // the turn runs whatever the count does
    }
    return next(e)
  })

  // Every model request, main loop and subagents: its token counts as the API
  // reported them. Observe only: the response streams through untouched
  on('turn.step', async function* ($, e, next) {
    let startedAt = 0
    try {
      startedAt = await $.clock.now()
    } catch {
      // timing is only evidence about the cache
    }
    const r = yield* next(e)
    try {
      const u = r.usage
      if (u) {
        const endedAt = await $.clock.now()
        await update($, spend, s => stepDone(s, u, { ...(e.agentId ? { agentId: e.agentId } : {}), startedAt, endedAt }))
      }
    } catch {
      // counting never gets in the way of the response
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    try {
      await update($, spend, s => turnDone(s, e.agentId))
    } catch {
      // the answer stands either way
    }
    return r
  })

  // The person's latest requests, for what a compaction must keep
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (text && !text.startsWith('/')) await update($, asks, list => addRecent(list, clipAsk(text), ASK_LIMIT))
    return next(e)
  })

  // Every compaction of the main conversation: with autokeep on, the summary is
  // told what to keep; once it stands, the drop is marked and toasted
  on('session.compact', async ($, e, next) => {
    if (e.agentId) return next(e)
    // only a compaction that carries its messages is rewritten (the engine's always do)
    const keep =
      (await read($, autokeep)) && Array.isArray(e.messages) ? { ...e, instructions: mergeInstructions(e.instructions, await keepText($)) } : e
    const before = await latestTokens($)
    const ledger = (await read($, spend)).ledger
    const r = await next(keep)
    if (e.trigger !== 'precompute' && r.messages && !selfCompact) void priceCompaction($, r, ledger).then(() => afterCompaction($, before))
    return r
  })

  on('command.run', { command: 'ctx' }, async ($, e) => {
    const [word = '', ...rest] = String(e.args || '').trim().split(/\s+/)
    const arg = word.toLowerCase()
    if (arg === 'compact') {
      await compactNow($, rest.join(' '))
      return {}
    }
    if (arg === 'autokeep') {
      const v = rest[0]?.toLowerCase()
      await setAutokeep($, v === 'on' ? true : v === 'off' ? false : !(await read($, autokeep)))
      return {}
    }
    if (arg === 'cost') {
      const v = rest[0]?.toLowerCase()
      await setCost($, v === 'on' ? true : v === 'off' ? false : !(await read($, costOn)))
      return {}
    }
    if (arg === 'hide') {
      await setVisible($, false)
      return {}
    }
    if (arg === 'toggle') {
      await toggleVisible($)
      return {}
    }
    if (arg === 'exact' || arg === 'full') await update($, mode, () => 'full')
    if (arg === 'quick' || arg === 'summary') await update($, mode, () => 'summary')
    await setVisible($, true, true)
    return {}
  })

  // a close by the person (Esc, the pane's mark) turns the toggle off too
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    // an unload (hot reload, exit) must not forget that the pane was wanted
    if (e.id === PANE && e.origin.kind !== 'unload') {
      stopTicker()
      await update($, isVisible, () => false)
      try {
        await $.store.set('visible', false)
      } catch {
        // nothing to keep
      }
    }
    return r
  })

  // The band: a small bar and the fill on one line, the 📊 toggle at its right
  // edge. The toggle opens or closes the pane, which docks to the right like /diff
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const el = $.ui.resolve(e)
    const { Box, Button, Text } = el
    const s = await read($, snap)
    const show = await read($, isVisible)
    const old = await read($, stale)
    const past = await read($, history)
    const wide = (e.props.bodyColumns ?? 80) >= 70
    const barWidth = wide ? 16 : 8
    const step = trend(past).delta
    const marks = await read($, compacted)
    const w = await warning($)
    const hot = w.level === 'imminent' ? 'error' : 'warning'
    // the warning badge takes the sparkline's place on a band under 100 columns
    const cols = e.props.bodyColumns ?? 80
    const roomy = wide && (w.level === 'none' || cols >= 100)
    // the last turn's dollars, from the ledger; nothing where there is none
    const sp = await read($, spend)
    const money = (await read($, costOn)) && sp.ledger !== undefined
    const lastTurn = money ? shownTurn(sp) : undefined
    const rates = money ? ratesOf(sp) : undefined
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
          {s ? (
            <Box flexDirection="row" columnGap={1} flexShrink={1}>
              {w.level === 'none' ? <Text dimColor>ctx</Text> : <Text color={hot} bold>ctx</Text>}
              {Bar({ el, runs: barRuns(s, barWidth) })}
              {Fill({ el, s })}
              {roomy && past.length >= 2 && Spark({ el, values: past, marks, width: 10, percent: s.percent })}
              {roomy && step !== undefined && step !== 0 && <Text dimColor>{fmtDelta(step)}</Text>}
              {wide &&
                lastTurn &&
                Pieces({ el, pieces: bandSuffix(lastTurn, cols, { median: sp.usds.length >= 3 ? median(sp.usds) : undefined, subUsd: subUsd(lastTurn, rates) }) })}
              {w.level !== 'none' && w.compactAt && (
                <Text color={hot} bold>
                  {warnBadge(w.tokens, w.compactAt, w.turnsLeft)}
                </Text>
              )}
              {w.level !== 'none' && rates && cols >= 100 && <Text dimColor>{`· ~${fmtUsd(carry(w.tokens, rates))}/request`}</Text>}
              {old && <Text color="warning">⚠ stale</Text>}
            </Box>
          ) : (
            <Text dimColor>Context window</Text>
          )}
          <Button
            key="ctx-toggle"
            label={show ? '📊▾' : '📊'}
            hotkey="x"
            plain
            dimColor={!show}
            onPress={() => toggleVisible($)}
          />
        </Box>
        {below}
      </Box>
    )
  })

  // The footer, for the Desktop app, where the band does not draw; on the
  // terminal the band already shows the fill
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const s = await read($, snap)
    if (!s) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, `ctx ${Math.round(s.percent)}%`] } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const { Box, Button, Text } = el
    const s = await read($, snap)
    const open = await read($, opened)
    const want = await read($, mode)
    const old = await read($, stale)
    const past = await read($, history)
    const eaten = await read($, eaters)
    const cpt = await read($, cptAtom)
    const calls = await read($, usage)
    const log = await read($, project)
    const marks = await read($, compacted)
    const keepOn = await read($, autokeep)
    const w = await warning($)
    await read($, tick)
    const now = await $.clock.now()
    // the body as the surface measured it: the person may drag the dock narrower
    const width = Math.max(20, e.props.bodyColumns || PANE_ARGS.columns)
    if (!s) return <Text dimColor>No context data yet. It fills in after the first response.</Text>

    const used = Math.max(1, s.total)
    const section = (key: string, hotkey: string, title: string, tokens: number, count: string) => {
      const g = shareBar(tokens, used, GAUGE)
      return (
        <Box flexDirection="row" width="100%" columnGap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Button key={'sec-' + key} label={`${open.includes(key) ? '▾' : '▸'} ${title}`} hotkey={hotkey} plain onPress={() => toggleOpen($, key)} />
          </Box>
          <Box flexDirection="row" flexShrink={0}>
            <Text color="claude">{g.fill}</Text>
            <Text color="inactive" dimColor>{g.rest}</Text>
          </Box>
          <Text dimColor>{fmtTokens(tokens).padStart(6)}</Text>
          <Text bold>{count.padStart(6)}</Text>
        </Box>
      )
    }
    const marker = compactMarker(s, width)
    const pace = trend(past, s.compactAt)
    // the engine's own count of finished turns; the sparkline can't be counted
    // by eye (it is capped and skips repeats). A failed call just hides it.
    let turnsDone: number | undefined
    try {
      turnsDone = await $.session.turns()
    } catch {
      turnsDone = undefined
    }
    const turnCount = turnsDone && turnsDone > 0 ? `· ${turnsDone} ${turnsDone === 1 ? 'turn' : 'turns'}` : undefined

    // What this session has paid for and not used: loaded MCP servers it never
    // called, skills and agent types listed for the model and never invoked
    // Dollar figures: what the last turn spent (real, from the ledger), and what
    // the window costs to keep, rewrite and compact (at the learned prices)
    const sp = await read($, spend)
    const costShown = await read($, costOn)
    const money = costShown && sp.ledger !== undefined
    const rates = money ? ratesOf(sp) : undefined
    const lastTurn = money ? shownTurn(sp) : undefined
    // the ledger's total is the denominator for the turn's dollars below it
    const session = money && sp.ledger !== undefined ? sessionParts(sp.ledger, lastTurn?.usd) : undefined
    const winTokens = past[past.length - 1] ?? s.total
    const rpt = perTurn(sp)
    const after = afterCompact(sp, s)
    const plan = rates && after !== undefined && winTokens > 2 * after ? compactPlan(winTokens, after, rates, sp.compact?.summary ?? SUMMARY_TOKENS) : undefined
    const ttl = ttlMs(sp)
    const idleMs = sp.lastStepAt !== undefined ? now - sp.lastStepAt : 0
    const cold = money && ttl !== undefined && sp.lastStepAt !== undefined && idleMs >= ttl
    const muted = (text: string) => <Text color="inactive" dimColor wrap="wrap">{text}</Text>

    const idleServers = s.servers
      .filter(v => v.tokens > 0 && !calls.mcp[v.key])
      .map(v => {
        const run = idleSessions(log ?? undefined, v.key)
        // this session counts too, with what it has spent so far
        const cost = rates ? idleCost(v.tokens, [...run, { requests: sp.requests, misses: sp.misses }], rates) : undefined
        return { ...v, streak: run.length + 1, cost }
      })
    const idleSkills = s.skills.filter(k => !calls.skills[k.name])
    const idleAgents = s.agents.filter(a => !calls.agents[a.name])
    const sumOf = (xs: { tokens: number }[]) => xs.reduce((a, x) => a + x.tokens, 0)
    const deadTokens = sumOf(idleServers) + sumOf(idleSkills) + sumOf(idleAgents)
    const eatenTokens = eaten.reduce((a, x) => a + estimateTokens(x.chars, cpt), 0)
    const heat = (t: number) => (t >= TOAST_TOKENS ? 'error' : t >= 5000 ? 'warning' : 'inactive')
    const status = want !== s.detail ? 'counting…' : s.detail === 'full' ? 'exact count' : 'estimated'

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
          <Box flexShrink={1}>
            <Text bold wrap="truncate-end">{s.model || 'Context window'}</Text>
          </Box>
          {Fill({ el, s })}
        </Box>
        {w.level !== 'none' && (
          <Text color={w.level === 'imminent' ? 'error' : 'warning'} bold wrap="wrap">
            {(w.level === 'imminent' ? '⚠ Auto-compact is close' : '⚠ Auto-compact is coming') + ' · c compacts on your terms'}
          </Text>
        )}
        {cold && (
          <Box flexDirection="column">
            <Text color="warning" bold wrap="wrap">{`⚠ cache likely expired · idle ${fmtIdle(idleMs)}`}</Text>
            {muted(
              `  next request re-writes ${fmtTokens(winTokens)}` +
                (rates ? ` ≈ ~${fmtUsd(rewrite(winTokens, rates))} (warm ~${fmtUsd(carry(winTokens, rates))})` : ''),
            )}
            {rates && after !== undefined && after < winTokens && muted(`  c compact first: re-writes ~${fmtTokens(after)} ≈ ~${fmtUsd(rewrite(after, rates))}`)}
          </Box>
        )}
        {Bar({ el, runs: barRuns(s, width) })}
        {marker && <Text color="inactive" dimColor>{marker}</Text>}
        {past.length >= 2 && (
          <Box flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              <Text color="inactive" dimColor>trend</Text>
              {Spark({ el, values: past, marks, width: Math.max(8, Math.min(HISTORY_LIMIT, width - 6 - (turnCount ? turnCount.length + 1 : 0))), percent: s.percent })}
              {turnCount && <Text color="inactive" dimColor>{turnCount}</Text>}
            </Box>
            <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
              <Text color="inactive" dimColor>{trendLabel({ delta: pace.delta, perTurn: pace.perTurn })}</Text>
              {pace.turnsLeft !== undefined && (
                <Text color={pace.turnsLeft <= 3 ? 'error' : pace.turnsLeft <= 10 ? 'warning' : 'inactive'} dimColor={pace.turnsLeft > 10} bold={pace.turnsLeft <= 10}>
                  {`· ~${pace.turnsLeft} ${pace.turnsLeft === 1 ? 'turn' : 'turns'} to auto-compact`}
                </Text>
              )}
            </Box>
          </Box>
        )}
        {(session || rates || lastTurn) && (
          <Box flexDirection="column">
            {session && (
              // the total is the one figure picked out; siblings, not nesting, because a child can't undo its parent's dim
              <Text wrap="wrap">
                <Text color="inactive" dimColor>session </Text>
                <Text color="success">{session.amount}</Text>
                <Text color="inactive" dimColor>{session.tail}</Text>
              </Text>
            )}
            {rates && muted(carryLine(winTokens, rates, rpt, pace))}
            {lastTurn && (
              <Text dimColor wrap="wrap">
                {turnLine(lastTurn, lastTurn.subRuns > 0 ? subUsd(lastTurn, rates) : undefined)}
              </Text>
            )}
            {lastTurn && lastTurn.missTokens > 0 && (
              <Text color="error" wrap="wrap">
                {missLine(lastTurn, rates)}
              </Text>
            )}
            {plan &&
              muted(
                `compact now saves ~${fmtUsd(plan.saving)}/request · ~${fmtUsd(plan.once)} once · pays back in ~${plan.payback} ${plan.payback === 1 ? 'request' : 'requests'}`,
              )}
            {plan &&
              rates &&
              rpt &&
              after !== undefined &&
              pace.turnsLeft !== undefined &&
              muted(`at auto in ~${pace.turnsLeft} turns · waiting costs ~${fmtUsd(carry(winTokens - after, rates) * rpt * pace.turnsLeft)} more`)}
          </Box>
        )}
        <Text> </Text>
        {s.rows
          .filter(r => r.tokens > 0 || r.kind === 'free')
          .map(r => (
            <Box flexDirection="row" width="100%" columnGap={1}>
              {Swatch({ el, kind: r.kind, color: r.color, scope: r.name })}
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end" dimColor={r.kind === 'deferred'} hover={{ scope: SCOPE + r.name, bold: true }}>
                  {r.name}
                </Text>
              </Box>
              <Text dimColor>{fmtTokens(r.tokens).padStart(6)}</Text>
              <Text bold>{fmtShare(r, s.max).padStart(6)}</Text>
            </Box>
          ))}
        <Text> </Text>
        {section('mcp', 'm', 'MCP tools', s.mcpTokens, String(s.mcpCount))}
        {s.mcpDeferredCount > 0 && (
          <Text color="inactive" dimColor wrap="truncate-end">
            {`    + ${fmtTokens(s.mcpDeferredTokens)} in ${s.mcpDeferredCount} deferred, loaded on demand`}
          </Text>
        )}
        {open.includes('mcp') &&
          s.servers.map(v =>
            Item({
              el,
              name: v.name,
              right: `${fmtTokens(v.tokens)} ${String(v.count).padStart(3)}` + (v.deferredCount ? `  +${v.deferredCount} deferred` : ''),
            }),
          )}
        {section('memory', 'f', 'Memory files', s.memory.reduce((a, f) => a + f.tokens, 0), String(s.memory.length))}
        {open.includes('memory') &&
          s.memory.map((f, i) => (
            <Box flexDirection="row" width="100%" columnGap={2}>
              <Box flexGrow={1} flexShrink={1}>
                <Text>{'    '}</Text>
                <Button key={'mem-' + i} label={`${f.type}  ${shortPath(f.path)} ↗`} plain dimColor onPress={() => openFile($, f.path)} />
              </Box>
              <Text dimColor>{fmtTokens(f.tokens)}</Text>
            </Box>
          ))}
        {section('skills', 's', 'Skills', s.skillTokens, fmtCount(s.skillIncluded, s.skillCount))}
        {open.includes('skills') && s.skills.slice(0, SKILL_LIMIT).map(k => Item({ el, name: k.name, right: fmtTokens(k.tokens) }))}
        {open.includes('skills') && s.skills.length > SKILL_LIMIT && (
          <Text color="inactive" dimColor>
            {`    +${s.skills.length - SKILL_LIMIT} more, ${fmtTokens(s.skills.slice(SKILL_LIMIT).reduce((a, k) => a + k.tokens, 0))}`}
          </Text>
        )}
        {s.agents.length > 0 && section('agents', 'a', 'Agents', s.agentTokens, String(s.agents.length))}
        {open.includes('agents') && s.agents.map(a => Item({ el, name: a.name, right: fmtTokens(a.tokens) }))}
        {s.commandCount > 0 && (
          <Box flexDirection="row" width="100%" columnGap={1}>
            <Box flexGrow={1} flexShrink={1}>
              <Text>{'  Slash commands'}</Text>
            </Box>
            <Box flexDirection="row" flexShrink={0}>
              <Text color="claude">{shareBar(s.commandTokens, used, GAUGE).fill}</Text>
              <Text color="inactive" dimColor>{shareBar(s.commandTokens, used, GAUGE).rest}</Text>
            </Box>
            <Text dimColor>{fmtTokens(s.commandTokens).padStart(6)}</Text>
            <Text bold>{fmtCount(s.commandIncluded, s.commandCount).padStart(6)}</Text>
          </Box>
        )}
        <Text color="inactive" dimColor>{'╌'.repeat(width)}</Text>
        {section('eaters', 'h', 'Heaviest results', eatenTokens, String(eaten.length))}
        {open.includes('eaters') && eaten.length === 0 && (
          <Text color="inactive" dimColor>
            {'    nothing over ' + fmtTokens(estimateTokens(EATER_MIN_CHARS, cpt)) + ' yet'}
          </Text>
        )}
        {open.includes('eaters') &&
          eaten.map(x => {
            const t = estimateTokens(x.chars, cpt)
            return (
              <Box flexDirection="row" width="100%" columnGap={2}>
                <Box flexGrow={1} flexShrink={1}>
                  <Text dimColor wrap="truncate-end">{'    ' + x.label}</Text>
                </Box>
                <Text color="inactive" dimColor>{'t' + x.turn}</Text>
                <Text color={heat(t)} dimColor={t < 5000} bold={t >= 5000}>{('~' + fmtTokens(t)).padStart(6)}</Text>
              </Box>
            )
          })}
        {section('dead', 'd', 'Unused so far', deadTokens, String(idleServers.length + idleSkills.length + idleAgents.length))}
        {open.includes('dead') &&
          idleServers.map(v => (
            <Box flexDirection="column" width="100%">
              <Box flexDirection="row" width="100%" columnGap={2}>
                <Box flexGrow={1} flexShrink={1}>
                  <Text dimColor wrap="truncate-end">{'    ' + v.name}</Text>
                </Box>
                {v.streak >= 2 ? (
                  <Text color={v.streak >= 5 ? 'warning' : 'inactive'} dimColor={v.streak < 5}>{`idle ${v.streak} sessions`}</Text>
                ) : (
                  <Text color="inactive" dimColor>no calls</Text>
                )}
                <Text dimColor>{fmtTokens(v.tokens).padStart(6)}</Text>
              </Box>
              {v.cost && (
                <Text color="inactive" dimColor wrap="truncate-end">
                  {`      ~${fmtUsd(v.cost.total)} so far` + (v.cost.n > 1 ? ` · ~${fmtUsd(v.cost.perSession)}/session` : '')}
                </Text>
              )}
            </Box>
          ))}
        {open.includes('dead') && s.skills.length > 0 &&
          Item({ el, name: `skills  ${s.skills.length - idleSkills.length} of ${s.skills.length} used`, right: fmtTokens(sumOf(idleSkills)) })}
        {open.includes('dead') && s.agents.length > 0 &&
          Item({ el, name: `agents  ${s.agents.length - idleAgents.length} of ${s.agents.length} used`, right: fmtTokens(sumOf(idleAgents)) })}
        {open.includes('dead') && idleServers.some(v => v.streak >= 5) && (
          <Text color="inactive" dimColor wrap="wrap">
            {'    servers idle 5+ sessions here: consider turning them off for this project in /mcp'}
          </Text>
        )}
        <Text> </Text>
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Button key="ctx-refresh" label="↻ refresh" hotkey="r" plain onPress={() => refresh($)} />
          <Button key="ctx-compact" label="⇣ compact" hotkey="c" plain onPress={() => compactNow($)} />
          <Button key="ctx-autokeep" label={keepOn ? '◉ autokeep' : '○ autokeep'} hotkey="k" plain onPress={() => setAutokeep($, !keepOn)} />
          <Button key="ctx-cost" label={costShown ? '◉ cost' : '○ cost'} hotkey="p" plain onPress={() => setCost($, !costShown)} />
          <Button
            key="ctx-exact"
            label={want === 'full' ? '◉ exact' : '○ exact'}
            hotkey="e"
            plain
            onPress={() => setMode($, want === 'full' ? 'summary' : 'full')}
          />
          <Text color="inactive" dimColor>{`${status} · ${ago(now - s.at)}`}</Text>
          {old && <Text color="warning">⚠ stale</Text>}
        </Box>
        {e.props.placement === 'inline' && (
          <Text color="inactive" dimColor wrap="wrap">
            Shown above the prompt. In the fullscreen layout (110+ columns) this docks beside the transcript.
          </Text>
        )}
        <Text color="inactive" dimColor>{`ctx v${VERSION}`}</Text>
      </Box>
    )
  })
}
