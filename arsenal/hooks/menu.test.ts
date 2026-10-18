import { test, expect } from 'claude-code/testing'

import {
  MORE_CELLS,
  NO_OWN,
  TWO_COLUMNS,
  clipTo,
  commandLine,
  draftNote,
  effortLabel,
  failedNote,
  flipped,
  hasOwn,
  hasRows,
  headerNote,
  launchColumns,
  launchItems,
  modelLabel,
  nameCells,
  offFor,
  ownRow,
  paneRows,
  sectionLines,
  sentNote,
  reconcile,
  runningFrom,
  sectionTitle,
  shownRows,
  toolsFrom,
  withOff,
} from './menu'

const BOTH = { better: true, report: true }
const BETTER = { better: true, report: false }
const REPORT = { better: false, report: true }
const NONE = { better: false, report: false }

test('a resolved model id reads as its name and version', () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5')
})

test('the context suffix is dropped and a date is never taken for a minor version', () => {
  expect(modelLabel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(modelLabel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(modelLabel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  expect(modelLabel('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
  expect(modelLabel('claude-3-opus-20240229')).toBe('Opus 3')
})

test('an alias reads as its family and anything else is shown as given', () => {
  expect(modelLabel('opus')).toBe('Opus')
  expect(modelLabel('Sonnet')).toBe('Sonnet')
  expect(modelLabel('opus[1m]')).toBe('Opus')
  expect(modelLabel('Opus 5.5')).toBe('Opus 5.5')
  expect(modelLabel('us.anthropic.claude-opus-5-5-v1:0')).toBe('us.anthropic.claude-opus-5-5-v1:0')
  expect(modelLabel('my-gateway-model')).toBe('my-gateway-model')
  expect(modelLabel('')).toBe('')
})

test('each effort level has its label, a number is written out, absent is empty', () => {
  expect(effortLabel('low')).toBe('Low')
  expect(effortLabel('medium')).toBe('Medium')
  expect(effortLabel('high')).toBe('High')
  expect(effortLabel('xhigh')).toBe('XHigh')
  expect(effortLabel('max')).toBe('Max')
  expect(effortLabel(32000)).toBe('effort 32000')
  expect(effortLabel('32000')).toBe('effort 32000')
  expect(effortLabel(null)).toBe('')
  expect(effortLabel(undefined)).toBe('')
})

test('the header note joins model and effort, and shows the model alone without effort', () => {
  expect(headerNote({ model: 'claude-opus-5-5', effort: 'high' })).toBe('Opus 5.5 · High')
  expect(headerNote({ model: 'claude-haiku-5-5', effort: null })).toBe('Haiku 5.5')
  expect(headerNote(null)).toBe('')
})

test('a main-loop step becomes the running pair, a numeric effort kept as text', () => {
  expect(runningFrom('claude-opus-5-5', 'xhigh')).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })
  expect(runningFrom('claude-opus-5-5', 8000)).toEqual({ model: 'claude-opus-5-5', effort: '8000' })
  expect(runningFrom('claude-haiku-5-5', undefined)).toEqual({ model: 'claude-haiku-5-5', effort: null })
})

test('opening the menu keeps the last step while /model still names that model', () => {
  const last = { model: 'claude-opus-5-5', effort: 'high' }
  expect(reconcile(last, 'claude-opus-5-5')).toBe(last)
  expect(reconcile(last, 'claude-opus-5-5[1m]')).toBe(last)
  // the alias is the same family, so the resolved id and its effort stand
  expect(reconcile(last, 'opus')).toBe(last)
  expect(reconcile(last, '')).toBe(last)
})

test('opening the menu takes /model when it names another model, with no effort', () => {
  const last = { model: 'claude-opus-5-5', effort: 'high' }
  expect(reconcile(last, 'sonnet')).toEqual({ model: 'sonnet', effort: null })
  expect(reconcile(last, 'claude-opus-5-1')).toEqual({ model: 'claude-opus-5-1', effort: null })
  expect(reconcile(null, 'opus')).toEqual({ model: 'opus', effort: null })
  expect(reconcile(null, '')).toBe(null)
})

test('tools come from the command names', () => {
  expect(toolsFrom(['model', 'better', 'report'])).toEqual(BOTH)
  expect(toolsFrom(['model', 'better'])).toEqual(BETTER)
  expect(toolsFrom(['model', 'report'])).toEqual(REPORT)
  expect(toolsFrom([])).toEqual(NONE)
})

test('the Launch rows follow the tools that are there', () => {
  const keys = (t: typeof BOTH) => launchItems(t).map(i => i.key)
  expect(keys(BOTH)).toEqual(['upgrade', 'history', 'today', 'week', 'settings'])
  expect(keys(BETTER)).toEqual(['upgrade', 'history'])
  expect(keys(REPORT)).toEqual(['today', 'week', 'settings'])
  expect(keys(NONE)).toEqual([])
  expect(hasRows(BOTH)).toBe(true)
  expect(hasRows(BETTER)).toBe(true)
  expect(hasRows(REPORT)).toBe(true)
  expect(hasRows(NONE)).toBe(false)
})

test('each Launch row runs the command its tool already has', () => {
  const line = (key: string) => {
    const i = launchItems(BOTH).find(x => x.key === key)!
    return commandLine(i.command, i.args)
  }
  expect(line('upgrade')).toBe('/better')
  expect(line('history')).toBe('/better history')
  expect(line('today')).toBe('/report today')
  expect(line('week')).toBe('/report week')
  expect(line('settings')).toBe('/report settings')
})

test('the hotkeys are single letters, all different, and clear of the Prompt Upgrade switch on p', () => {
  const keys = launchItems(BOTH).map(i => i.hotkey)
  expect(new Set(keys).size).toBe(keys.length)
  for (const k of keys) expect(k).toMatch(/^[a-z]$/)
  expect(keys).not.toContain('p')
})

test('two columns at 64 cells with both tools, one column below that or with one tool', () => {
  const two = launchColumns(BOTH, TWO_COLUMNS)
  expect(two.map(c => c.map(i => i.key))).toEqual([['upgrade', 'history'], ['today', 'week', 'settings']])
  expect(launchColumns(BOTH, TWO_COLUMNS - 1).map(c => c.map(i => i.key))).toEqual([['upgrade', 'history', 'today', 'week', 'settings']])
  expect(launchColumns(BETTER, 120).map(c => c.length)).toEqual([2])
  expect(launchColumns(REPORT, 120).map(c => c.length)).toEqual([3])
  expect(launchColumns(NONE, 120)).toEqual([])
})

test('titles and notes read as the design draws them', () => {
  expect(sectionTitle('SETTINGS')).toBe('── S E T T I N G S')
  expect(sectionTitle('LAUNCH')).toBe('── L A U N C H')
  expect(sentNote('/better on')).toBe('sent: /better on')
  expect(failedNote('/better on', 'no such command')).toBe('/better on failed: no such command')
  expect(failedNote('/better on', 'x'.repeat(200)).length).toBeLessThanOrEqual(80)
})

// ── USER and PROJECT ─────────────────────────────────────────────────────

const cmd = (name: string, description = `about ${name}`, takesArgs = false) => ({ name, description, takesArgs })
const NO_OFF = { user: [], project: {} }

test('the launcher shows for commands of the person’s own, even with no tools and all of them off', () => {
  const own = { user: [cmd('handoff')], project: [] }
  expect(hasOwn(own)).toBe(true)
  expect(hasOwn(NO_OWN)).toBe(false)
  expect(hasRows(NONE, own)).toBe(true)
  expect(hasRows(NONE, { user: [], project: [cmd('seed-db')] })).toBe(true)
  expect(hasRows(NONE, NO_OWN)).toBe(false)
  expect(hasRows(NONE)).toBe(false)
  expect(hasRows(BETTER, NO_OWN)).toBe(true)
})

test('the rows left are the commands not turned off, and edit mode shows them all', () => {
  const all = [cmd('a'), cmd('b'), cmd('c')]
  expect(shownRows(all, ['b'], false).map(c => c.name)).toEqual(['a', 'c'])
  expect(shownRows(all, ['b'], true).map(c => c.name)).toEqual(['a', 'b', 'c'])
  expect(shownRows(all, ['gone-from-disk'], false)).toHaveLength(3)
  expect(shownRows(all, ['a', 'b', 'c'], false)).toEqual([])
})

test('flipping a name turns it off, or on again, and keeps the list sorted', () => {
  expect(flipped([], 'deploy')).toEqual(['deploy'])
  expect(flipped(['standup'], 'deploy')).toEqual(['deploy', 'standup'])
  expect(flipped(['deploy', 'standup'], 'deploy')).toEqual(['standup'])
})

test('USER’s list is one, PROJECT’s is the repo’s by key, and an empty list leaves no key', () => {
  const off = { user: ['a'], project: { k1: ['x'], k2: ['y'] } }
  expect(offFor(off, 'user', 'k1')).toEqual(['a'])
  expect(offFor(off, 'project', 'k1')).toEqual(['x'])
  expect(offFor(off, 'project', 'other')).toEqual([])
  expect(withOff(off, 'project', 'k1', ['x', 'z'])).toEqual({ user: ['a'], project: { k1: ['x', 'z'], k2: ['y'] } })
  expect(withOff(off, 'project', 'k1', [])).toEqual({ user: ['a'], project: { k2: ['y'] } })
  expect(withOff(off, 'user', 'k1', ['a', 'b'])).toEqual({ user: ['a', 'b'], project: off.project })
  expect(off).toEqual({ user: ['a'], project: { k1: ['x'], k2: ['y'] } })
})

test('a description is cut to the room with … where it was cut', () => {
  expect(clipTo('short', 10)).toBe('short')
  expect(clipTo('exactly ten', 11)).toBe('exactly ten')
  expect(clipTo('Use when the user invokes', 10)).toBe('Use when …')
  expect(clipTo('anything', 0)).toBe('')
  expect(clipTo('anything', -3)).toBe('')
})

test('names are padded to a column, up to half the menu', () => {
  expect(nameCells([cmd('a'), cmd('handoff')], 46)).toBe('/handoff'.length)
  expect(nameCells([cmd('a-very-long-command-name-indeed-yes')], 40)).toBe(20)
  expect(nameCells([], 46)).toBe(0)
})

test('a row is the padded name and a clipped description that leaves the … column free', () => {
  const inner = 46
  const row = ownRow(cmd('handoff', 'Use when the user invokes /handoff, or asks to save, list, or archive session handoff files'), 9, inner)
  expect(row.label).toBe('/handoff ')
  expect(row.detail.startsWith('  Use when')).toBe(true)
  expect(row.detail.endsWith('…')).toBe(true)
  expect(row.label.length + row.detail.length + MORE_CELLS).toBeLessThanOrEqual(inner)
  expect(ownRow(cmd('x', 'short'), 9, inner).detail).toBe('  short')
})

test('a row with no room, or no description, draws the name alone', () => {
  expect(ownRow(cmd('standup', 'Yesterday'), 8, 14).detail).toBe('')
  expect(ownRow(cmd('standup', ''), 8, 46).detail).toBe('')
})

test('a section takes its header and its rows, or one line when all are off', () => {
  const all = [cmd('a'), cmd('b'), cmd('c')]
  expect(sectionLines([], [], false)).toBe(0)
  expect(sectionLines(all, [], false)).toBe(4)
  expect(sectionLines(all, ['b'], false)).toBe(3)
  expect(sectionLines(all, ['a', 'b', 'c'], false)).toBe(2)
  expect(sectionLines(all, ['a', 'b', 'c'], true)).toBe(4)
})

test('the pane asks for 0.1.0’s rows until the menu needs more', () => {
  expect(paneRows(BOTH, NO_OWN, NO_OFF, 'k', null, 48)).toBe(14)
  expect(paneRows(NONE, NO_OWN, NO_OFF, 'k', null, 48)).toBe(14)
  const ten = Array.from({ length: 10 }, (_, i) => cmd(`c${i}`))
  const own = { user: ten, project: [cmd('p')] }
  // 2 header + 3 settings + 6 launch (title and 5) + 11 user + 2 project + 1 note = 25, and 2 of slack
  expect(paneRows(BOTH, own, NO_OFF, 'k', null, 48)).toBe(27)
})

test('edit mode counts the rows that are off, and a section that is all off counts its line', () => {
  const own = { user: [cmd('a'), cmd('b'), cmd('c'), cmd('d'), cmd('e'), cmd('f'), cmd('g'), cmd('h'), cmd('i'), cmd('j')], project: [] }
  const off = { user: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], project: {} }
  const closed = paneRows(BOTH, own, off, 'k', null, 48)
  const editing = paneRows(BOTH, own, off, 'k', 'user', 48)
  expect(editing - closed).toBe(9)
  expect(closed).toBe(2 + 3 + 6 + 2 + 1 + 2)
})

test('the draft note names the command', () => {
  expect(draftNote('handoff')).toBe('Clear the prompt box to fill /handoff.')
})
