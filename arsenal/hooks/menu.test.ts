import { test, expect } from 'claude-code/testing'

import {
  TWO_COLUMNS,
  commandLine,
  effortLabel,
  failedNote,
  hasRows,
  headerNote,
  launchColumns,
  launchItems,
  modelLabel,
  sentNote,
  reconcile,
  runningFrom,
  sectionTitle,
  toolsFrom,
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
