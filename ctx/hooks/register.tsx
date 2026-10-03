import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { CtxSnapshot } from '../types'
import { barCells, fmtShare, fmtTokens, headline, shortPath } from './fmt'

const PANE = 'ctx'
const REFRESH_MS = 30000

// What the drawings read lives in $.state, so a hot reload keeps it
const snap = atom({ plugin: 'ctx', key: 'snap' } as const, null)
const isVisible = atom({ plugin: 'ctx', key: 'isVisible' } as const, false)
const opened = atom({ plugin: 'ctx', key: 'opened' } as const, [])

let paneOpen = false

async function refresh($: any, detail: 'summary' | 'full' = 'summary') {
  try {
    const { context } = await $.session.usage({ breakdown: detail })
    const b = context.breakdown
    if (!b) return
    const at = await $.clock.now()
    const byServer = new Map<string, { name: string; tokens: number; count: number }>()
    for (const t of b.mcpTools) {
      const s = byServer.get(t.serverName) ?? { name: t.serverName, tokens: 0, count: 0 }
      s.tokens += t.tokens
      s.count += 1
      byServer.set(t.serverName, s)
    }
    const next: CtxSnapshot = {
      rows: b.categories.map((c: any) => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
      total: b.totalTokens,
      max: b.rawMaxTokens,
      percent: b.percentage,
      detail,
      at,
      mcpTokens: b.mcpTools.reduce((a: number, t: any) => a + t.tokens, 0),
      mcpCount: b.mcpTools.length,
      servers: [...byServer.values()].sort((x, y) => y.tokens - x.tokens),
      memory: b.memoryFiles.map((f: any) => ({ path: f.path, type: f.type, tokens: f.tokens })),
      skillCount: b.skills?.totalSkills ?? 0,
      skillTokens: b.skills?.tokens ?? 0,
      skills: (b.skills?.skillFrontmatter ?? [])
        .map((s: any) => ({ name: s.name, tokens: s.tokens }))
        .sort((x: any, y: any) => y.tokens - x.tokens)
        .slice(0, 12),
    }
    await update($, snap, () => next)
  } catch {
    // no session bound yet, or the count failed: the last snapshot stays
  }
}

// The pane docks beside the transcript in the fullscreen layout (from 110
// columns), like /diff; on the main screen it sits above the prompt instead
const PANE_ARGS = { id: PANE, title: 'Context window', closeOnEscape: true, columns: 48, rows: 22 } as const

async function setVisible($: any, value: boolean, focus = false) {
  await update($, isVisible, () => value)
  try {
    await $.store.set('visible', value)
  } catch {
    // the toggle still works for this session
  }
  if (value) {
    await refresh($)
    paneOpen = true
    await $.ui.open(focus ? { ...PANE_ARGS, focus: true } : PANE_ARGS)
  } else {
    paneOpen = false
    await $.ui.close({ id: PANE })
  }
  $.ui.invalidate('ui.render')
}

async function toggleVisible($: any) {
  await setVisible($, !(await read($, isVisible)))
}

async function toggleOpen($: any, key: string) {
  await update($, opened, (list: string[]) => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
}

function footerLabel(s: CtxSnapshot | null): string {
  return s ? `ctx ${Math.round(s.percent)}%` : ''
}

// The segmented bar and the category rows, shared by the band and the pane
function Breakdown({ el, s, width }: { el: any; s: CtxSnapshot; width: number }) {
  const { Box, Text } = el
  const cells = barCells(s, Math.max(10, Math.min(width - 2, 100)))
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {cells.map(c => (
          <Text color={c.color} dimColor={c.dim}>
            {(c.dim ? '░' : '█').repeat(c.n)}
          </Text>
        ))}
      </Box>
      {s.rows
        .filter(r => r.tokens > 0 || r.kind === 'free')
        .map(r => (
          <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
            <Text wrap="truncate-end">
              <Text color={r.color} dimColor={r.kind === 'deferred' || r.kind === 'buffer'}>
                ■{' '}
              </Text>
              <Text dimColor={r.kind === 'deferred'}>{r.name}</Text>
            </Text>
            <Box flexDirection="row" columnGap={2} flexShrink={0}>
              <Text dimColor>{fmtTokens(r.tokens)}</Text>
              <Text bold>{fmtShare(r, s.max).padStart(6)}</Text>
            </Box>
          </Box>
        ))}
    </Box>
  )
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'ctx',
        description: 'Context window details (/ctx opens the pane; /ctx show|hide|toggle|full)',
        argumentHint: '[show|hide|toggle|full]',
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
        paneOpen = true
        void $.ui.open(PANE_ARGS)
      }
    } catch {
      // start closed
    }
    $.clock.every(REFRESH_MS, async () => {
      if (paneOpen || (await read($, isVisible))) await refresh($)
    })
    return next(e)
  })

  // the window changes as a turn ends: refresh once there
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await refresh($)
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
    if (arg === 'full') await refresh($, 'full')
    await setVisible($, true, true)
    return {}
  })

  // a close by the person (Esc, the pane's mark) turns the toggle off too
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    // an unload (hot reload, exit) must not forget that the pane was wanted
    if (e.id === PANE && e.origin.kind !== 'unload') {
      paneOpen = false
      await update($, isVisible, () => false)
      try {
        await $.store.set('visible', false)
      } catch {
        // nothing to keep
      }
    }
    return r
  })

  // The band: one dim line with the 📊 toggle at its right edge. The toggle
  // opens or closes the pane, which docks to the right like /diff
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    const show = await read($, isVisible)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
          <Text dimColor wrap="truncate-end">
            {s ? `Context window  ${headline(s)}` : 'Context window'}
          </Text>
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

  // The footer also draws in the Desktop app, where the band does not
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = footerLabel(await read($, snap))
    if (!label) return next(e)
    const modes = Array.isArray(e.props && e.props.modes) ? e.props.modes : []
    return next({ ...e, props: { ...e.props, modes: [...modes, label] } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    const open: string[] = await read($, opened)
    const width = Math.max(50, (e.props && e.props.bodyColumns) || 100)
    if (!s) return <Text dimColor>No context data yet. It fills in after the first response.</Text>

    const section = (key: string, hotkey: string, title: string, tokens: number, count: number) => (
      <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
        <Button key={'sec-' + key} label={`${open.includes(key) ? '▾' : '▸'} ${title}`} hotkey={hotkey} plain onPress={() => toggleOpen($, key)} />
        <Box flexDirection="row" columnGap={2} flexShrink={0}>
          <Text dimColor>{fmtTokens(tokens)}</Text>
          <Text bold>{String(count).padStart(6)}</Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
          <Text bold>Context window</Text>
          <Text bold>{headline(s)}</Text>
        </Box>
        {Breakdown({ el: { Box, Text }, s, width })}
        <Text> </Text>
        {section('mcp', 'm', 'MCP tools', s.mcpTokens, s.mcpCount)}
        {open.includes('mcp') &&
          s.servers.map(v => (
            <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
              <Text dimColor wrap="truncate-end">{'    ' + v.name}</Text>
              <Text dimColor>{`${fmtTokens(v.tokens)}  ${String(v.count).padStart(4)}`}</Text>
            </Box>
          ))}
        {section('memory', 'f', 'Memory files', s.memory.reduce((a, f) => a + f.tokens, 0), s.memory.length)}
        {open.includes('memory') &&
          s.memory.map(f => (
            <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
              <Text dimColor wrap="truncate-start">{`    ${f.type}  ${shortPath(f.path)}`}</Text>
              <Text dimColor>{fmtTokens(f.tokens)}</Text>
            </Box>
          ))}
        {section('skills', 's', 'Skills', s.skillTokens, s.skillCount)}
        {open.includes('skills') &&
          s.skills.map(k => (
            <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
              <Text dimColor wrap="truncate-end">{'    ' + k.name}</Text>
              <Text dimColor>{fmtTokens(k.tokens)}</Text>
            </Box>
          ))}
        <Text> </Text>
        <Box flexDirection="row" columnGap={2}>
          <Button key="ctx-full" label="recount (exact)" hotkey="r" plain onPress={() => refresh($, 'full').then(() => $.ui.invalidate('ui.render'))} />
          <Text dimColor>{s.detail === 'full' ? 'counted with the token API' : 'estimated locally'}</Text>
        </Box>
        {e.props?.placement === 'inline' && (
          <Text dimColor wrap="wrap">
            Shown above the prompt. In the fullscreen layout (110+ columns) this docks beside the transcript.
          </Text>
        )}
      </Box>
    )
  })
}
