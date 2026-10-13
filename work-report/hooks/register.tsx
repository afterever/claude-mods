import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { DayRecord, Kind, Settings, Tab } from '../types'
import { keyOf, noonOf } from './dates'
import { classifyTask, KIND_LABEL } from './kinds'
import type { ToolUse } from './kinds'
import { COLORS, fit } from './layout'
import { arm, claim, disarm, isTypedPrompt } from './record'
import { addTask, DEFAULT_SETTINGS, modelName, normalizeDay, normalizeSettings, tasksOf } from './report'
import { drawPane } from './view'

const PANE = 'work-report'
// Asked for by a command or a button, so it is placed at any width that holds it
const PANE_ARGS = { id: PANE, title: 'Work Report', focus: true, closeOnEscape: true, rows: 38, columns: 72 } as const

// What the drawings read lives in $.state, so a hot reload keeps it; the days
// and the settings are also kept in $.store across sessions
const daysAtom = atom({ plugin: 'work-report', key: 'days' } as const, {})
const settingsAtom = atom({ plugin: 'work-report', key: 'settings' } as const, DEFAULT_SETTINGS)
const tabAtom = atom({ plugin: 'work-report', key: 'tab' } as const, 'today')

const DAY_PREFIX = 'day:'
const TAB_WORDS: readonly Tab[] = ['today', 'week', 'month', 'year']

// Typed prompts waiting for their turn to start, and the turn being counted.
// A reload drops these: at worst the one task in flight is not counted.
let armed: string[] = []
let active: { turnId: string; uses: ToolUse[] } | null = null
const MAX_USES = 500

const plain = (err: unknown) => (err instanceof Error && err.message ? err.message : 'something went wrong')

// ── Reading and writing the store ────────────────────────────────────────

async function loadAll($: EngineInterface) {
  const keys = (await $.store.keys()).filter(k => k.startsWith(DAY_PREFIX))
  const entries = await Promise.all(keys.map(async k => [k.slice(DAY_PREFIX.length), normalizeDay(await $.store.get(k))] as const))
  const days: Record<string, DayRecord> = {}
  for (const [key, rec] of entries) days[key] = rec
  await update($, daysAtom, () => days)
  const settings = normalizeSettings(await $.store.get('settings'))
  await update($, settingsAtom, () => settings)
}

/** One more finished task, added to today's record. Read back first, so a second session's counts are not lost. */
async function recordTask($: EngineInterface, kind: Kind, model: string) {
  const key = keyOf(noonOf(await $.clock.now()))
  const now = addTask(normalizeDay(await $.store.get(`${DAY_PREFIX}${key}`)), kind, model)
  await $.store.set(`${DAY_PREFIX}${key}`, now)
  await update($, daysAtom, days => ({ ...days, [key]: now }))
}

// ── The pane ─────────────────────────────────────────────────────────────

/** Opens the pane. A window too narrow for it is the one thing worth a line: the person asked and nothing came. */
async function openPane($: EngineInterface): Promise<void> {
  try {
    const r = await $.ui.open(PANE_ARGS)
    if (!r.isPlaced) $.ui.toast('Work Report needs a wider window to open. Widen the terminal and try /report again.')
  } catch {
    // no surface to ask: nothing to show
  }
}

async function openOn($: EngineInterface, tab: Tab | null): Promise<void> {
  if (tab) await update($, tabAtom, () => tab)
  await openPane($)
}

// ── /report settings ─────────────────────────────────────────────────────

const SETTING_ORDER: readonly Kind[] = ['emails', 'documents', 'images', 'research', 'other']

const SETTING_NAMES: Record<string, Kind | 'rate'> = {
  rate: 'rate',
  emails: 'emails',
  email: 'emails',
  documents: 'documents',
  document: 'documents',
  docs: 'documents',
  images: 'images',
  image: 'images',
  video: 'images',
  research: 'research',
  other: 'other',
}

const num = (n: number) => String(Math.round(n * 100) / 100)

function settingsText(s: Settings): string {
  const minutes = SETTING_ORDER.map(k => `${KIND_LABEL[k]} ${num(s.minutes[k])}`).join(', ')
  return (
    `Minutes saved per task: ${minutes}. Hourly rate: $${num(s.rate)}. ` +
    'Hours and dollars are estimates. Change one with /report settings rate 75 or /report settings emails 15.'
  )
}

async function settingsCommand($: EngineInterface, args: string[]): Promise<string> {
  const current = normalizeSettings(await read($, settingsAtom))
  if (args.length === 0) return settingsText(current)

  const name = SETTING_NAMES[(args[0] ?? '').toLowerCase()]
  if (!name) {
    return `I do not know the setting "${args[0]}". The ones you can change are rate, emails, documents, images, research and other. For example: /report settings rate 75.`
  }
  const raw = args[1]
  const value = raw === undefined ? NaN : Number(raw.replace(/^\$/, ''))
  if (!Number.isFinite(value) || value < 0) {
    return name === 'rate' ? 'The rate must be a number, for example /report settings rate 75.' : `The minutes must be a number, for example /report settings ${name} 15.`
  }
  const limit = name === 'rate' ? 100_000 : 1440
  if (value > limit) {
    return name === 'rate' ? `That rate is too high. Use a number up to ${limit}.` : `That is more than a day. Use a number of minutes up to ${limit}.`
  }
  const next: Settings = name === 'rate' ? { ...current, rate: value } : { ...current, minutes: { ...current.minutes, [name]: value } }
  await update($, settingsAtom, () => next)
  try {
    await $.store.set('settings', next)
  } catch {
    // changed for this session still
  }
  return name === 'rate'
    ? `Hourly rate is now $${num(value)}. Hours and dollars stay estimates.`
    : `${KIND_LABEL[name]} now save ${num(value)} minutes each. Hours and dollars stay estimates.`
}

const USAGE =
  'Work Report: /report opens the pane, /report today, week, month or year opens it on that tab, /report settings lists the estimate settings, and /report settings rate 75 or /report settings emails 15 changes one.'

// ── The module ───────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    armed = []
    active = null
    try {
      await $.command.register({
        name: 'report',
        description: 'Show what Claude has done for you: tasks finished, hours saved and what that is worth',
        argumentHint: '[today | week | month | year | settings]',
        immediate: true,
      })
    } catch {
      // the recording still works without the command
    }
    try {
      await loadAll($)
    } catch {
      // start empty: the next finished task is still recorded
    }
    return next(e)
  })

  // A typed prompt is armed here and claimed when its turn starts. Anything
  // that fails in this hook lets the prompt through untouched.
  on('prompt.submit', async ($, e, next) => {
    const origin = e.origin as { kind: string; asUser?: boolean }
    const typed = isTypedPrompt(e.text, { kind: origin.kind, asUser: origin.asUser })
    if (typed) armed = arm(armed, e.text)
    const r = await next(e)
    if (typed) {
      if ('drop' in r && r.drop !== undefined) armed = disarm(armed, e.text)
      else if (typeof r.text === 'string' && r.text !== e.text) armed = arm(armed, r.text)
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const hit = claim(armed, e.text)
    armed = hit.queue
    active = hit.found ? { turnId: e.turnId, uses: [] } : null
    return next(e)
  }).catch(($, e, next) => next(e))

  // The tools the counted turn used, helper agents' too: they are part of the work
  on('tool.call', async ($, e, next) => {
    if (active && active.uses.length < MAX_USES) {
      const input = e as unknown as Record<string, unknown>
      const path = [input.file_path, input.path, input.notebook_path].find(v => typeof v === 'string')
      active.uses.push({ tool: String(e.tool), ...(typeof path === 'string' ? { path } : {}) })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A finished task: the turn answered, was not cancelled, and is the main loop's
  on('turn.complete', async ($, e, next) => {
    const turn = active
    if (turn && turn.turnId === e.turnId && !e.agentId) {
      active = null
      if (e.reason === 'answer' && !e.isAborted) {
        try {
          await recordTask($, classifyTask(turn.uses), modelName(e.usage?.model))
        } catch {
          // a task that cannot be saved is not worth interrupting the answer for
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Answers at once; the pane opens in the background
  on('command.run', { command: 'report' }, async ($, e) => {
    try {
      const raw = String(e.args ?? '').trim()
      const parts = raw === '' ? [] : raw.split(/\s+/)
      const word = (parts[0] ?? '').toLowerCase()
      if (word === 'settings' || word === 'setting') return { text: await settingsCommand($, parts.slice(1)) }
      if (word === 'help' || word === '?') return { text: USAGE }
      const tab = TAB_WORDS.find(t => t === word) ?? null
      if (raw === '' || tab) {
        void openOn($, tab).catch(() => undefined)
        return { text: tab ? `Opening the work report on ${tab}. Hours and dollars in it are estimates.` : 'Opening the work report. Hours and dollars in it are estimates.' }
      }
      return { text: `I do not know "${raw}". ${USAGE}` }
    } catch (err) {
      return { text: `Work Report could not do that: ${plain(err)}.` }
    }
  }).catch(() => ({ text: 'Work Report could not do that right now.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e) as unknown as Elements['terminal']
    if (e.surface === 'mobile') {
      const { Text } = el
      return <Text color={COLORS.muted}>Work Report needs the terminal or the desktop app.</Text>
    }
    const days = (await read($, daysAtom)) ?? {}
    const settings = normalizeSettings(await read($, settingsAtom))
    const tab = (await read($, tabAtom)) ?? 'today'
    const now = await $.clock.now()
    const width = Math.max(20, Math.min(110, e.props.bodyColumns || PANE_ARGS.columns))
    const press =
      (fn: () => Promise<unknown>) =>
      () => {
        fn().catch(err => $.ui.toast(`Work Report: ${plain(err)}`))
      }
    return drawPane(el, { width, tab, days, settings, now }, { pickTab: t => press(() => update($, tabAtom, () => t))() })
  })

  // The one button: a chip above the prompt that opens the pane. The band is
  // shared, so what the others draw is kept beneath it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const days = (await read($, daysAtom)) ?? {}
    const today = tasksOf(days[keyOf(noonOf(await $.clock.now()))])
    const label = fit(Math.max(0, (e.props.bodyColumns || 80) - 14), [`${today} ${today === 1 ? 'task' : 'tasks'} today`, `${today} today`, ''])
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button key="work-report-open" plain onPress={() => void openPane($)}>
            <Text backgroundColor={COLORS.hair} color={COLORS.text}>
              {' Work report '}
            </Text>
          </Button>
          {label !== '' && <Text color={COLORS.muted}>{label}</Text>}
        </Box>
        {below}
      </Box>
    )
  })
}
