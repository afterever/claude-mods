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
  queuedNote,
  ranNote,
  reconcile,
  runningFrom,
  sameRunning,
  sectionTitle,
  toolsFrom,
} from './menu'
import type { LaunchItem } from './menu'

// What the drawings read lives in $.state, so a hot reload keeps the menu as
// it was. None of it is kept in $.store: a new session starts with the menu closed
const isOpenAtom = atom({ plugin: 'arsenal', key: 'isOpen' } as const, false)
const runningAtom = atom({ plugin: 'arsenal', key: 'running' } as const, null)
const NO_TOOLS: ArsenalTools = { better: false, report: false }
const toolsAtom = atom({ plugin: 'arsenal', key: 'tools' } as const, NO_TOOLS)
const noteAtom = atom({ plugin: 'arsenal', key: 'note' } as const, '')

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
    // no rows is the quiet answer: the button is not drawn
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

async function setOpen($: EngineInterface, value: boolean) {
  await update($, isOpenAtom, () => value)
}

async function toggleMenu($: EngineInterface) {
  const open = (await read($, isOpenAtom)) === true
  if (!open) await refreshModel($)
  await setOpen($, !open)
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
 * Runs a tool's own slash command, as if typed. The engine queues it until the
 * session is idle, so a press during a turn leaves a "queued" note, and a
 * Launch row keeps the menu open until the command has run so that the note
 * is on screen. With the session idle the menu closes first and a failure is
 * a toast, since the note is no longer in view.
 */
async function press($: EngineInterface, command: string, args: string, o: { isWorking: boolean; closes: boolean }) {
  const line = commandLine(command, args)
  if (o.closes && !o.isWorking) await setOpen($, false)
  if (o.isWorking) await say($, queuedNote(line))
  try {
    await $.command.run({ command, args })
    await say($, ranNote(line))
    if (o.closes && o.isWorking) await setOpen($, false)
  } catch (err) {
    const failed = failedNote(line, plain(err))
    await say($, failed)
    if (o.closes && !o.isWorking) $.ui.toast(failed)
  }
}

// ── Drawings ─────────────────────────────────────────────────────────────

type Surface = { isWorking: boolean; bodyColumns: number }

function drawMenu($: EngineInterface, e: Parameters<typeof $.ui.resolve>[0], s: Surface, view: { tools: ArsenalTools; auto: boolean; header: string; note: string }) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const { tools, auto } = view
  // the frame takes two cells and its padding two
  const inner = Math.max(20, s.bodyColumns - 4)
  const columns = launchColumns(tools, s.bodyColumns)
  const columnWidth = columns.length > 1 ? Math.floor(inner / columns.length) : inner

  const launchRow = (item: LaunchItem) => (
    <Button
      key={`arsenal-${item.key}`}
      plain
      hotkey={item.hotkey}
      label={`${item.glyph} ${item.label}`}
      onPress={() => press($, item.command, item.args, { isWorking: s.isWorking, closes: true })}
    />
  )

  return (
    <Box key="arsenal-menu" flexDirection="column" borderStyle="round" borderColor={COLORS.accent} paddingX={1}>
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
              <Text dimColor>{'  upgrade every prompt first'}</Text>
            </Box>
            <Button
              key="arsenal-auto"
              plain
              hotkey="p"
              onPress={() => press($, 'better', auto ? 'off' : 'on', { isWorking: s.isWorking, closes: false })}
            >
              <Text backgroundColor={auto ? COLORS.teal : COLORS.off} color={auto ? COLORS.dark : COLORS.light}>
                {auto ? ' ● On ' : ' ○ Off '}
              </Text>
            </Button>
          </Box>
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
      <Box justifyContent="space-between">
        <Text dimColor>{view.note || ' '}</Text>
        <Button key="arsenal-close" plain role="dismiss" label="✕" onPress={() => setOpen($, false)} />
      </Box>
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
      // the footer button still works without the command
    }
    try {
      await update($, isOpenAtom, () => false)
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

  // The engine's own line, its pills live, and the button at the right end
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const line = await next(e)
    const tools = await read($, toolsAtom)
    if (!hasRows(tools)) return line
    const open = (await read($, isOpenAtom)) === true
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" justifyContent="space-between">
        {line}
        <Button key="arsenal-toggle" variant="primary" label={open ? '◆ Arsenal ▴' : '◆ Arsenal ▾'} onPress={() => toggleMenu($)} />
      </Box>
    )
  })

  // Closed, or a survey is up: the band is whatever the mods beneath draw.
  // Open: the menu above their bands, which stay in view
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const tools = await read($, toolsAtom)
    if (!hasRows(tools) || (await read($, isOpenAtom)) !== true) return next(e)
    const below = await next(e)
    const { Box } = $.ui.resolve(e)
    const view = {
      tools,
      auto: await readAuto($),
      header: headerNote((await read($, runningAtom)) ?? null),
      note: (await read($, noteAtom)) ?? '',
    }
    return (
      <Box flexDirection="column">
        {drawMenu($, e, { isWorking: e.props.isWorking, bodyColumns: e.props.bodyColumns }, view)}
        {below}
      </Box>
    )
  })
}
