import { test, expect } from 'claude-code/testing'

import { arm, claim, disarm, isSlashCommand, isTypedPrompt } from './record'

test('only a prompt the person typed counts', () => {
  // their Enter at the prompt, and a message from the phone
  expect(isTypedPrompt('write a launch email', { kind: 'composer' })).toBe(true)
  expect(isTypedPrompt('write a launch email', { kind: 'bridge' })).toBe(true)
  // a mod's words are theirs only when the mod sent them as the person's own
  expect(isTypedPrompt('write a launch email', { kind: 'plugin', asUser: true })).toBe(true)
  expect(isTypedPrompt('write a launch email', { kind: 'plugin' })).toBe(false)
  // nobody typed these
  for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'sdk', 'channel', 'auto-continuation', 'unclassified']) {
    expect(isTypedPrompt('write a launch email', { kind })).toBe(false)
  }
})

test('slash commands and empty prompts are not tasks', () => {
  expect(isSlashCommand('/compact')).toBe(true)
  expect(isSlashCommand('  /work-report week')).toBe(true)
  expect(isSlashCommand('/mcp__server__prompt arg')).toBe(true)
  expect(isTypedPrompt('/compact', { kind: 'composer' })).toBe(false)
  expect(isTypedPrompt('   ', { kind: 'composer' })).toBe(false)
  // a path that happens to start with a slash is a prompt
  expect(isSlashCommand('/usr/local/bin/tool is broken')).toBe(false)
  expect(isTypedPrompt('/usr/local/bin/tool is broken', { kind: 'composer' })).toBe(true)
})

test('an armed prompt is claimed once, by its own words', () => {
  let queue = arm([], 'write a launch email')
  queue = arm(queue, 'fix the typo in the readme')
  const first = claim(queue, 'fix the typo in the readme')
  expect(first.found).toBe(true)
  expect(first.queue).toEqual(['write a launch email'])
  // claimed already: a second turn with the same words is nobody's typing
  expect(claim(first.queue, 'fix the typo in the readme').found).toBe(false)
  // a turn nobody typed finds nothing
  expect(claim(queue, 'a background task finished').found).toBe(false)
})

test('words a settings hook added to are still found, short ones are not guessed at', () => {
  const queue = arm([], 'write a launch email for the new product')
  expect(claim(queue, 'write a launch email for the new product\n\n(note added by a hook)').found).toBe(true)
  expect(claim(arm([], 'yes'), 'yes please, and also the other thing').found).toBe(false)
})

test('a prompt that was held or dropped is taken off again, and the queue stays bounded', () => {
  const queue = arm(arm([], 'a prompt'), 'another prompt')
  expect(disarm(queue, 'a prompt')).toEqual(['another prompt'])
  expect(disarm(queue, 'never armed')).toEqual(queue)
  let many: string[] = []
  for (let i = 0; i < 50; i++) many = arm(many, `prompt ${i}`)
  expect(many).toHaveLength(20)
  expect(many[19]).toBe('prompt 49')
})
