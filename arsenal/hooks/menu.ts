// What the menu needs that is only arithmetic and wording: the labels in the
// header, which rows the session has, and how they fall into columns. Nothing
// here touches the engine, so all of it is tested without one.

import type { ArsenalRunning, ArsenalTools } from '../types'

/** Menus at least this many cells wide draw the Launch rows in two columns. */
export const TWO_COLUMNS = 64

export type LaunchItem = {
  /** Names the button: `arsenal-<key>`. */
  key: string
  glyph: string
  label: string
  /** The slash command it runs, without the slash: the tool it belongs to. */
  command: keyof ArsenalTools
  /** The command's own argument text, as typed after its name. */
  args: string
  hotkey: string
}

// Every row ends in a command the tool already has. The tool's name in
// `command` is also the key into `tools`, so a missing tool drops its rows
export const LAUNCH: readonly LaunchItem[] = [
  { key: 'upgrade', glyph: '✦', label: 'Upgrade a prompt', command: 'better', args: '', hotkey: 'u' },
  { key: 'history', glyph: '◷', label: 'Prompt history', command: 'better', args: 'history', hotkey: 'h' },
  { key: 'today', glyph: '▤', label: "Today's report", command: 'report', args: 'today', hotkey: 't' },
  { key: 'week', glyph: '▥', label: "This week's report", command: 'report', args: 'week', hotkey: 'w' },
  { key: 'settings', glyph: '⚙', label: 'Report settings', command: 'report', args: 'settings', hotkey: 's' },
]

// ── Header ───────────────────────────────────────────────────────────────

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable']

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
const version = (major: string, minor?: string) => (minor ? `${major}.${minor}` : major)

/**
 * `claude-opus-5-5` → `Opus 5.5`, `claude-sonnet-5-5[1m]` → `Sonnet 5.5`, the
 * alias `opus` → `Opus`. Anything else is shown as given.
 */
export function modelLabel(raw: string): string {
  const given = raw.trim()
  const id = given.toLowerCase().replace(/\[[^\]]*\]$/, '')
  // claude-<family>-<major>[-<minor>][-<date>]; a minor is one or two digits,
  // so a date such as 20250514 is never taken for one
  const named = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id)
  if (named) {
    const [, family = '', major = '', minor] = named
    return `${cap(family)} ${version(major, minor)}`
  }
  // the older order: claude-<major>[-<minor>]-<family>[-<date>]
  const older = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/.exec(id)
  if (older) {
    const [, major = '', minor, family = ''] = older
    return `${cap(family)} ${version(major, minor)}`
  }
  if (FAMILIES.includes(id)) return cap(id)
  return given
}

/** `opus` and `claude-opus-5-5` are both of the family `opus`; null when unknown. */
function familyOf(raw: string): string | null {
  const label = modelLabel(raw)
  const word = (label.split(' ')[0] ?? '').toLowerCase()
  return FAMILIES.includes(word) ? word : null
}

const EFFORTS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max' }

/** `high` → `High`, `32000` → `effort 32000`, absent → an empty string. */
export function effortLabel(effort: string | number | null | undefined): string {
  if (effort === null || effort === undefined || effort === '') return ''
  const text = String(effort)
  if (/^\d+$/.test(text)) return `effort ${text}`
  return EFFORTS[text.toLowerCase()] ?? text
}

/** The header's right side: `Opus 5.5 · High`, the model alone, or nothing. */
export function headerNote(running: ArsenalRunning | null): string {
  if (!running) return ''
  const model = modelLabel(running.model)
  const effort = effortLabel(running.effort)
  return effort ? `${model} · ${effort}` : model
}

/** What a `turn.step` of the main loop says the model and effort are. */
export function runningFrom(model: string, effort: string | number | undefined): ArsenalRunning {
  return { model, effort: effort === undefined ? null : String(effort) }
}

export const sameRunning = (a: ArsenalRunning | null, b: ArsenalRunning | null) =>
  a === b || (!!a && !!b && a.model === b.model && a.effort === b.effort)

/**
 * `$.session.model()` as the menu opens: what the person set with `/model`
 * since the last request. The last request's model and effort stand while it
 * is the same model (an alias such as `opus` is the family of
 * `claude-opus-5-5`); otherwise the effort is not known and is left out.
 */
export function reconcile(running: ArsenalRunning | null, sessionModel: string): ArsenalRunning | null {
  const session = sessionModel.trim()
  if (!session) return running
  if (running) {
    if (modelLabel(running.model) === modelLabel(session)) return running
    const family = familyOf(session)
    const isAlias = family !== null && session.toLowerCase().replace(/\[[^\]]*\]$/, '') === family
    if (isAlias && familyOf(running.model) === family) return running
  }
  return { model: session, effort: null }
}

// ── Rows ─────────────────────────────────────────────────────────────────

/** Which tools the session has, from the names `$.command.list()` gives. */
export function toolsFrom(names: readonly string[]): ArsenalTools {
  return { better: names.includes('better'), report: names.includes('report') }
}

/** Nothing to show, so no button either. */
export const hasRows = (tools: ArsenalTools) => tools.better || tools.report

/** The Prompt Upgrade switch is the only setting, and it needs prompt-upgrade. */
export const hasSettings = (tools: ArsenalTools) => tools.better

/** The Launch rows whose tool is there, in the order they are listed. */
export const launchItems = (tools: ArsenalTools): LaunchItem[] => LAUNCH.filter(item => tools[item.command])

/**
 * The Launch rows in columns: prompt-upgrade's on the left and work-report's
 * on the right when there is room and both tools are there, else one column.
 */
export function launchColumns(tools: ArsenalTools, bodyColumns: number): LaunchItem[][] {
  const items = launchItems(tools)
  if (bodyColumns >= TWO_COLUMNS && tools.better && tools.report) {
    return [items.filter(i => i.command === 'better'), items.filter(i => i.command === 'report')]
  }
  return items.length ? [items] : []
}

// ── Words ────────────────────────────────────────────────────────────────

/** `SETTINGS` → `── S E T T I N G S`. */
export const sectionTitle = (name: string) => `── ${[...name].join(' ')}`

/** `/better`, `/report today`: what a press runs, as the person would type it. */
export const commandLine = (command: string, args: string) => `/${command}${args ? ` ${args}` : ''}`

const NOTE_LIMIT = 80

const clip = (text: string) => (text.length > NOTE_LIMIT ? `${text.slice(0, NOTE_LIMIT - 1)}…` : text)

export const queuedNote = (line: string) => clip(`queued: ${line}`)
export const ranNote = (line: string) => clip(`ran: ${line}`)
export const failedNote = (line: string, why: string) => clip(`${line} failed: ${why}`)
