import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, Timer } from 'claude-code'

import type { CtxDetail, CtxServer, CtxSnapshot } from '../types'
import type { BarRun } from './fmt'
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

async function record($: EngineInterface, tokens: number) {
  await update($, history, list => (list[list.length - 1] === tokens ? list : [...list, tokens].slice(-HISTORY_LIMIT)))
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
    const s = byServer.get(t.serverName) ?? { name: t.serverName, tokens: 0, count: 0, deferredTokens: 0, deferredCount: 0 }
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

// "81.9k / 1M" dim, then the percent bold in green, amber or red
function Fill({ el, s }: { el: El; s: CtxSnapshot }) {
  const { Box, Text } = el
  return (
    <Box flexDirection="row" columnGap={1} flexShrink={0}>
      <Text dimColor>{`${fmtTokens(s.total)} / ${fmtTokens(s.max)}`}</Text>
      <Text bold color={fillColor(s.percent)}>{`${Math.round(s.percent)}%`}</Text>
    </Box>
  )
}

// The fill per turn: dim history, the latest reading lit in the fill's color
function Spark({ el, values, width, percent }: { el: El; values: readonly number[]; width: number; percent: number }) {
  const { Box, Text } = el
  const line = [...sparkline(values, width)]
  const last = line.pop() ?? ''
  return (
    <Box flexDirection="row" flexShrink={0}>
      <Text color="claude" dimColor>{line.join('')}</Text>
      <Text color={fillColor(percent)} bold>{last}</Text>
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
        description: 'Context window details (/ctx opens the pane; /ctx show|hide|toggle|exact|quick)',
        argumentHint: '[show|hide|toggle|exact|quick]',
        immediate: true,
      })
    } catch {
      // the 📊 button still works without the command
    }
    await refresh($)
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
    if (e.changed.includes('context')) {
      // the API's own figure, so switching between exact and quick adds no jumps
      if (e.context.tokens !== undefined) await record($, e.context.tokens)
      void refresh($)
    }
    return r
  })

  on('command.run', { command: 'ctx' }, async ($, e) => {
    const arg = String(e.args || '').trim().toLowerCase()
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
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
          {s ? (
            <Box flexDirection="row" columnGap={1} flexShrink={1}>
              <Text dimColor>ctx</Text>
              {Bar({ el, runs: barRuns(s, barWidth) })}
              {Fill({ el, s })}
              {wide && past.length >= 2 && Spark({ el, values: past, width: 10, percent: s.percent })}
              {wide && step !== undefined && step !== 0 && <Text dimColor>{fmtDelta(step)}</Text>}
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
    const status = want !== s.detail ? 'counting…' : s.detail === 'full' ? 'exact count' : 'estimated'

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
          <Box flexShrink={1}>
            <Text bold wrap="truncate-end">{s.model || 'Context window'}</Text>
          </Box>
          {Fill({ el, s })}
        </Box>
        {Bar({ el, runs: barRuns(s, width) })}
        {marker && <Text color="inactive" dimColor>{marker}</Text>}
        {past.length >= 2 && (
          <Box flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              <Text color="inactive" dimColor>trend</Text>
              {Spark({ el, values: past, width: Math.max(8, Math.min(HISTORY_LIMIT, width - 6)), percent: s.percent })}
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
        <Text> </Text>
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Button key="ctx-refresh" label="↻ refresh" hotkey="r" plain onPress={() => refresh($)} />
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
      </Box>
    )
  })
}
