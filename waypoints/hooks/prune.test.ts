import { test, expect } from 'claude-code/testing'

// @ts-ignore plain JavaScript, shared with the module
import { shownPath, pickPrunable, deleteArgv } from './prune.mjs'

const NOW = new Date(2026, 9, 18, 16, 0).getTime()
const MIN = 60000
const H = 60 * MIN

test('the folder is shown as the system writes it, ending in a separator', async () => {
  expect(shownPath('C:\\Users\\bats/.claude/mods-data/waypoints')).toBe('C:\\Users\\bats\\.claude\\mods-data\\waypoints\\')
  expect(shownPath('/home/bats/.claude/mods-data/waypoints')).toBe('/home/bats/.claude/mods-data/waypoints/')
})

test('prune picks finished goals past the hour, dead files and old unreadable ones, oldest first', async () => {
  const items = [
    { name: 'self.json', mtimeMs: NOW - 30 * H, goal: { status: 'met', endedAt: NOW - 30 * H } },
    { name: 'a.json', mtimeMs: NOW - 3 * H, goal: { status: 'met', endedAt: NOW - 3 * H } },
    { name: 'b.json', mtimeMs: NOW - 10 * MIN, goal: { status: 'running' } },
    { name: 'c.json', mtimeMs: NOW - 10 * MIN, goal: { status: 'met', endedAt: NOW - 10 * MIN } },
    { name: 'd.json', mtimeMs: NOW - 25 * H, goal: { status: 'running' } },
    { name: 'e.json', mtimeMs: NOW - 2 * H, goal: null },
  ]
  expect(pickPrunable(items, { now: NOW, self: 'self.json' })).toEqual(['d.json', 'a.json', 'e.json'])
})

test('unreadable fresh file is kept: another chat may be writing it', async () => {
  expect(pickPrunable([{ name: 'w.json', mtimeMs: NOW - MIN, goal: null }], { now: NOW, self: 's.json' })).toEqual([])
})

test('prune takes at most 200 files a run', async () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ name: `${i}.json`, mtimeMs: NOW - 30 * H - i, goal: null }))
  expect(pickPrunable(items, { now: NOW, self: 's.json' })).toHaveLength(200)
})

test('the delete names every file as its own argument, no shell', async () => {
  const p = ["C:\\Users\\Ann O'Brien/.claude/mods-data/waypoints/a.json", "C:\\Users\\Ann O'Brien/.claude/mods-data/waypoints/b.json"]
  expect(deleteArgv(true, p)).toEqual(['cmd', '/d', '/c', 'del', '/f', '/q', "C:\\Users\\Ann O'Brien\\.claude\\mods-data\\waypoints\\a.json", "C:\\Users\\Ann O'Brien\\.claude\\mods-data\\waypoints\\b.json"])
  expect(deleteArgv(false, ['/home/ann/.claude/mods-data/waypoints/a.json'])).toEqual(['rm', '-f', '--', '/home/ann/.claude/mods-data/waypoints/a.json'])
})

test('on Windows a path cmd would read as syntax deletes nothing', async () => {
  expect(deleteArgv(true, ['C:\\Users\\R&D/.claude/mods-data/waypoints/a.json'])).toBeNull()
  expect(deleteArgv(true, ['C:\\Users\\50%/.claude/mods-data/waypoints/a.json'])).toBeNull()
})
