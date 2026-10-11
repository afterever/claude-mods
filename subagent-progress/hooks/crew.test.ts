import { test, expect } from 'claude-code/testing'

import { COSTUME_COLOR, bareType, costumeOf, familyOf, isHighEffort, plannedCostume, plannedProfile } from './crew'

const run = (type: string, model?: string, effort?: string) => ({ type, model, effort })

test('Fable is an astronaut at any effort, Mythos with it', () => {
  expect(costumeOf(run('general-purpose', 'claude-fable-5-1', 'low'))).toBe('astronaut')
  expect(costumeOf(run('general-purpose', 'claude-fable-5-1'))).toBe('astronaut')
  expect(costumeOf(run('general-purpose', 'claude-mythos-5', 'medium'))).toBe('astronaut')
})

test('Opus is an astronaut at high or above, a detective below', () => {
  for (const effort of ['high', 'xhigh', 'max']) expect(costumeOf(run('general-purpose', 'claude-opus-5-5', effort))).toBe('astronaut')
  for (const effort of ['medium', 'low']) expect(costumeOf(run('general-purpose', 'claude-opus-5-5', effort))).toBe('detective')
})

test('Sonnet is an engineer at high or above, a chef below', () => {
  for (const effort of ['high', 'xhigh', 'max']) expect(costumeOf(run('general-purpose', 'claude-sonnet-5-5', effort))).toBe('engineer')
  for (const effort of ['medium', 'low']) expect(costumeOf(run('general-purpose', 'claude-sonnet-5-5', effort))).toBe('chef')
})

test('Haiku is a racer at any effort', () => {
  expect(costumeOf(run('general-purpose', 'claude-haiku-5-5'))).toBe('racer')
  expect(costumeOf(run('general-purpose', 'claude-haiku-5-5', 'high'))).toBe('racer')
})

test('an effort not known yet counts as below high', () => {
  expect(costumeOf(run('general-purpose', 'claude-opus-5-5'))).toBe('detective')
  expect(costumeOf(run('general-purpose', 'claude-sonnet-5-5'))).toBe('chef')
  expect(isHighEffort(undefined)).toBe(false)
  // a numeric thinking budget is not a level
  expect(isHighEffort(32_000)).toBe(false)
  expect(isHighEffort(' XHigh ')).toBe(true)
})

test('aliases, a [1m] suffix and any case name their family', () => {
  expect(familyOf('opus')).toBe('opus')
  expect(familyOf('Sonnet')).toBe('sonnet')
  expect(familyOf('haiku')).toBe('haiku')
  expect(familyOf('claude-opus-5-5[1m]')).toBe('opus')
  expect(familyOf('inherit')).toBeUndefined()
  expect(familyOf('')).toBeUndefined()
  expect(familyOf(undefined)).toBeUndefined()
  expect(costumeOf(run('Plan', 'sonnet', 'high'))).toBe('engineer')
})

test('the Explore agent is a pirate whatever it runs on', () => {
  expect(costumeOf(run('Explore', 'claude-haiku-5-5'))).toBe('pirate')
  expect(costumeOf(run('Explore'))).toBe('pirate')
})

test('a model nobody knows gets the plain crab', () => {
  expect(costumeOf(run('general-purpose', 'gpt-9'))).toBe('other')
  expect(costumeOf(run('general-purpose'))).toBe('other')
})

test('a savvy agent follows its model and effort, like any other', () => {
  // savvy-heavy is Opus xhigh upstream: an astronaut under the model rule
  expect(costumeOf(run('savvy-heavy', 'claude-opus-5-5', 'xhigh'))).toBe('astronaut')
  expect(costumeOf(run('savvy-flow:savvy-light', 'claude-opus-5-5', 'low'))).toBe('detective')
})

test('a savvy agent with no model yet falls back to its tier', () => {
  expect(costumeOf(run('savvy-fable'))).toBe('astronaut')
  expect(costumeOf(run('savvy-careful'))).toBe('astronaut')
  expect(costumeOf(run('savvy-flow:savvy-medium'))).toBe('detective')
  expect(costumeOf(run('savvy-light'))).toBe('detective')
  expect(costumeOf(run('savvy-nobody'))).toBe('other')
  // an inherited property is not a tier
  expect(costumeOf(run('savvy-constructor'))).toBe('other')
})

test('a plugin namespace is stripped from the type', () => {
  expect(bareType('savvy-flow:savvy-careful')).toBe('savvy-careful')
  expect(bareType('general-purpose')).toBe('general-purpose')
})

test('a planned task takes its costume from model and effort', () => {
  expect(plannedCostume({ model: 'sonnet', effort: 'high' })).toBe('engineer')
  expect(plannedCostume({ model: 'claude-opus-5-5', effort: 'medium' })).toBe('detective')
  expect(plannedCostume({ model: 'haiku' })).toBe('racer')
})

test('a planned task named by savvy tier, or by costume, still draws', () => {
  expect(plannedCostume({ tier: 'heavy' })).toBe('astronaut')
  expect(plannedCostume({ tier: 'light' })).toBe('detective')
  expect(plannedCostume({ tier: 'chef' })).toBe('chef')
  expect(plannedCostume({ tier: 'nonsense' })).toBe('other')
  expect(plannedCostume({})).toBe('other')
  // a model that names no family falls back to the tier
  expect(plannedCostume({ model: 'gpt-9', tier: 'careful' })).toBe('astronaut')
})

test('a planned task says what it will run on', () => {
  expect(plannedProfile({ tier: 'heavy' })).toEqual({ model: 'opus', effort: 'xhigh' })
  expect(plannedProfile({ model: 'sonnet', effort: 'low' })).toEqual({ model: 'sonnet', effort: 'low' })
  expect(plannedProfile({})).toEqual({})
})

test('every costume has a color', () => {
  for (const color of Object.values(COSTUME_COLOR)) expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
})
