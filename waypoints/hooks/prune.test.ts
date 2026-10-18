import { test, expect } from 'claude-code/testing'

// @ts-ignore plain JavaScript, shared with the module
import { shownPath } from './prune.mjs'

test('the folder is shown as the system writes it, ending in a separator', async () => {
  expect(shownPath('C:\\Users\\bats/.claude/mods-data/waypoints')).toBe('C:\\Users\\bats\\.claude\\mods-data\\waypoints\\')
  expect(shownPath('/home/bats/.claude/mods-data/waypoints')).toBe('/home/bats/.claude/mods-data/waypoints/')
})
