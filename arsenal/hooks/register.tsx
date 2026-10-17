import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ArsenalTools } from '../types'
import {
  commandLine,
  failedNote,
  hasRows,
  hasSettings,
  headerNote,
  launchColumns,
  ranNote,
  reconcile,
  runningFrom,
  sameRunning,
  sectionTitle,
  sentNote,
  toolsFrom,
} from './menu'
import type { LaunchItem } from './menu'

// What the drawings read lives in $.state. None of it is kept in $.store, and
// session.start (which also runs on a hot reload) reads isOpen from the panes
const isOpenAtom = atom({ plugin: 'arsenal', key: 'isOpen' } as const, false)
const runningAtom = atom({ plugin: 'arsenal', key: 'running' } as const, null)
const NO_TOOLS: ArsenalTools = { better: false, report: false }
const toolsAtom = atom({ plugin: 'arsenal', key: 'tools' } as const, NO_TOOLS)
const noteAtom = atom({ plugin: 'arsenal', key: 'note' } as const, '')

// The menu is a pane, docked at the right in fullscreen like the tools' own
const PANE = 'arsenal'
const PANE_ARGS = { id: PANE, title: 'Arsenal', closeOnEscape: true, columns: 48, rows: 14 } as const

const COLORS = {
  accent: '#F2A65A',
  teal: '#2EC4B6',
  off: '#3A404A',
  dark: '#0D1117',
  light: '#E6EDF3',
}

const plain = (err: unknown) => (err instanceof Error && err.message ? err.message : 'something went wrong')

// ── State helpers ────────────────────────────────────────────────────────

const say = ($: EngineInterface, text: string) => update($, noteAtom, () => text)

async function refreshTools($: EngineInterface) {
  try {
    const names = (await $.command.list()).map(c => c.name)
    await update($, toolsAtom, () => toolsFrom(names))
  } catch {
    // no rows is the quiet answer: the launcher is not drawn
  }
}

/** The model `/model` names, since the last request. Read as the menu opens. */
async function refreshModel($: EngineInterface) {
  try {
    const model = await $.session.model()
    await update($, runningAtom, r => {
      const next = reconcile(r ?? null, model)
      return sameRunning(r ?? null, next) ? (r ?? null) : next
    })
  } catch {
    // the header keeps what it had
  }
}

async function openMenu($: EngineInterface) {
  await refreshModel($)
  await update($, isOpenAtom, () => true)
  const { isPlaced } = await $.ui.open(PANE_ARGS)
  if (!isPlaced) {
    await update($, isOpenAtom, () => false)
    $.ui.toast('Arsenal needs a wider window to open.')
  }
}

async function closeMenu($: EngineInterface) {
  await update($, isOpenAtom, () => false)
  await $.ui.close({ id: PANE })
}

async function toggleMenu($: EngineInterface) {
  if (!hasRows(await read($, toolsAtom))) return
  if ((await read($, isOpenAtom)) === true) await closeMenu($)
  else await openMenu($)
}

/**
 * prompt-upgrade's `auto`, which is not in this plugin's contract. Anything
 * but `true` is off, which includes prompt-upgrade not being installed. The
 * read made while drawing subscribes the drawing, so the pill follows the
 * value once prompt-upgrade writes it.
 */
async function readAuto($: EngineInterface): Promise<boolean> {
  try {
    const held = await ($.state as any).get({ plugin: 'prompt-upgrade', key: 'auto' })
    return held?.value === true
  } catch {
    return false
  }
}

// ── Presses ──────────────────────────────────────────────────────────────

/**
 * Runs a tool's own slash command, as if typed. A Launch row closes the menu
 * first, so the tool's own pane takes the dock; a failure is then a toast,
 * since the note is out of view. The switch keeps the menu open and says what
 * it sent and how that went in the note line.
 */
async function press($: EngineInterface, command: string, args: string, closes: boolean) {
  const line = commandLine(command, args)
  if (closes) await closeMenu($)
  else await say($, sentNote(line))
  try {
    await $.command.run({ command, args })
    if (!closes) await say($, ranNote(line))
  } catch (err) {
    const failed = failedNote(line, plain(err))
    if (closes) $.ui.toast(failed)
    else await say($, failed)
  }
}

// ── Drawings ─────────────────────────────────────────────────────────────

function drawMenu($: EngineInterface, e: Parameters<typeof $.ui.resolve>[0], bodyColumns: number, view: { tools: ArsenalTools; auto: boolean; header: string; note: string }) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const { tools, auto } = view
  const inner = Math.max(20, bodyColumns)
  const columns = launchColumns(tools, bodyColumns)
  const columnWidth = columns.length > 1 ? Math.floor(inner / columns.length) : inner

  const launchRow = (item: LaunchItem) => (
    <Button
      key={`arsenal-${item.key}`}
      plain
      hotkey={item.hotkey}
      label={`${item.glyph} ${item.label}`}
      onPress={() => press($, item.command, item.args, true)}
    />
  )

  return (
    <Box key="arsenal-menu" flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={COLORS.accent}>
          ◆  A R S E N A L
        </Text>
        <Text dimColor>{view.header}</Text>
      </Box>
      <Text dimColor>{'─'.repeat(inner)}</Text>
      {hasSettings(tools) ? (
        <Box key="arsenal-settings-section" flexDirection="column">
          <Text dimColor>{sectionTitle('SETTINGS')}</Text>
          <Box justifyContent="space-between">
            <Box>
              <Text color={auto ? COLORS.teal : undefined} dimColor={!auto}>
                {auto ? '● ' : '○ '}
              </Text>
              <Text bold>Prompt Upgrade</Text>
            </Box>
            <Button key="arsenal-auto" plain hotkey="p" onPress={() => press($, 'better', auto ? 'off' : 'on', false)}>
              <Text backgroundColor={auto ? COLORS.teal : COLORS.off} color={auto ? COLORS.dark : COLORS.light}>
                {auto ? ' ● On ' : ' ○ Off '}
              </Text>
            </Button>
          </Box>
          <Text dimColor>{'  upgrade every prompt first'}</Text>
        </Box>
      ) : null}
      <Text dimColor>{sectionTitle('LAUNCH')}</Text>
      <Box>
        {columns.map((items, i) => (
          <Box key={`arsenal-column-${i}`} flexDirection="column" width={columnWidth}>
            {items.map(launchRow)}
          </Box>
        ))}
      </Box>
      <Text dimColor>{view.note || ' '}</Text>
    </Box>
  )
}

// ── The module ───────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'arsenal',
        description: 'Open or close the Arsenal menu: the tool mods, one press away',
        immediate: true,
      })
    } catch {
      // the launcher still works without the command
    }
    try {
      // a hot reload leaves an open pane open
      const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
      await update($, isOpenAtom, () => isOpen)
      await say($, '')
    } catch {
      // a menu that stays as it was is still a menu
    }
    await refreshTools($)
    try {
      const model = await $.session.model()
      await update($, runningAtom, r => reconcile(r ?? null, model))
    } catch {
      // the header shows nothing until the first request
    }
    return next(e)
  })

  // A tool that registers its command after this plugin started still gets its
  // rows: the engine's own list is read once, and this keeps it current
  on('command.register', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.name === 'better' || e.name === 'report') await update($, toolsAtom, t => ({ ...(t ?? NO_TOOLS), [e.name]: true }))
    } catch {
      // the list read at session start stands
    }
    return r
  }).catch(($, e, next) => next(e))

  // Every model request, main loop and subagents. Only the main loop's say what
  // the header shows, and the request goes down as it came
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      try {
        const now = runningFrom(e.model, e.effort)
        await update($, runningAtom, r => (sameRunning(r ?? null, now) ? (r ?? null) : now))
      } catch {
        // the header is only a label
      }
    }
    return yield* next(e)
  })

  on('command.run', { command: 'arsenal' }, async $ => {
    await toggleMenu($)
    return {}
  }).catch(() => ({ text: 'Arsenal could not do that right now.' }))

  // A close by the person (Esc, the pane's mark) turns the launcher's arrow
  // back; an unload (hot reload, exit) is not a close they asked for
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE && e.origin.kind !== 'unload') {
      try {
        await update($, isOpenAtom, () => false)
      } catch {
        // the arrow is only a label
      }
    }
    return r
  })

  // The launcher is the band's last row, against the prompt box: no mod draws
  // between the box and the status line, and the hint line under that sits
  // below a tall status line. Every band mod installed here draws its own rows
  // first and the mods beneath it after, so the last row stays the launcher
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const tools = await read($, toolsAtom)
    if (!hasRows(tools)) return next(e)
    const open = (await read($, isOpenAtom)) === true
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Box key="arsenal-launcher" justifyContent="flex-end">
          <Button key="arsenal-toggle" variant="primary" label={open ? '◆ Arsenal ▴' : '◆ Arsenal ▾'} onPress={() => toggleMenu($)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const tools = await read($, toolsAtom)
    const view = {
      tools,
      auto: await readAuto($),
      header: headerNote((await read($, runningAtom)) ?? null),
      note: (await read($, noteAtom)) ?? '',
    }
    return drawMenu($, e, Math.max(20, e.props.bodyColumns || PANE_ARGS.columns), view)
  })
}
