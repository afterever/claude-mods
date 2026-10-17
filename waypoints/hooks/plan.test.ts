import { test, expect } from 'claude-code/testing'

// @ts-ignore the plan is plain JavaScript, shared with the module
import { newGoal, applyAction, progress, eta, instruction, nudge, standing, strictDeny, planSubject, TOOL_SPEC } from './plan.mjs'

const TOOL = 'mcp__waypoints__tasks'

function planned() {
  const g = newGoal({ sessionId: 's1', condition: 'ship the thing', now: 0, cwd: 'C:/bats' })
  applyAction(g, { action: 'plan', tasks: [{ title: 'one', size: 'S' }, { title: 'two', size: 'M' }, { title: 'three', size: 'L' }] }, { now: 1000 })
  return g
}

test('the bar counts finished work by size, not by task', async () => {
  const g = planned()
  applyAction(g, { action: 'done', id: 1 }, { now: 2000 })
  // S is 1 of 6 units of work
  expect(progress(g).pct).toBe(17)
  applyAction(g, { action: 'done', ids: [2, 3] }, { now: 3000 })
  expect(progress(g).pct).toBe(100)
  expect(progress(g).doneN).toBe(3)
})

test('the ETA waits for two finished tasks, then follows the goal\'s own pace', async () => {
  const g = planned()
  applyAction(g, { action: 'done', id: 1 }, { now: 61000 })
  expect(eta(g, 61000)).toBe(null)
  applyAction(g, { action: 'done', id: 2 }, { now: 181000 })
  // 3 units done in 180 s after the plan: 60 s a unit, 3 units left
  expect(eta(g, 181000)).toEqual({ ms: 180000, at: 361000 })
})

test('a new plan replaces the work not started yet and keeps what is running or done', async () => {
  const g = planned()
  applyAction(g, { action: 'start', id: 1 }, { now: 2000 })
  applyAction(g, { action: 'plan', tasks: [{ title: 'four', size: 'S' }] }, { now: 3000 })
  const live = g.tasks.filter((t: any) => !t.replaced).map((t: any) => t.title)
  expect(live).toEqual(['one', 'four'])
})

test('every word Claude reads names Waypoints and the tool', async () => {
  expect(TOOL_SPEC.description).toStartWith('Waypoints:')
  expect(applyAction(planned(), { action: 'nope' }, { now: 1 }).text).toStartWith('Waypoints:')
  for (const text of [instruction(TOOL), nudge(TOOL), strictDeny(TOOL), standing(TOOL)]) {
    expect(text).toContain(TOOL)
    expect(text.toLowerCase()).not.toContain('goal meter')
    expect(text.toLowerCase()).not.toContain('goal-meter')
  }
})

test('the standing line asks for a plan on multi-step work and keeps subagents out of it', async () => {
  const text = standing(TOOL)
  expect(text).toContain('3 or more steps')
  expect(text).toContain('ToolSearch')
  expect(text).toContain('action "plan"')
  expect(text).toContain('single-step')
  expect(text).toContain('subagent')
})

test('a plan outside /goal is named after the goal Claude gives, else its first task', async () => {
  const tasks = [{ title: 'Review README intro', size: 'S' }]
  expect(planSubject({ action: 'plan', goal: 'Review the README for stale claims', tasks })).toBe('Review the README for stale claims')
  expect(planSubject({ action: 'plan', tasks })).toBe('Review README intro')
  expect(planSubject({ action: 'plan', goal: '   ', tasks })).toBe('Review README intro')
  expect(planSubject({ action: 'plan', goal: 'x'.repeat(200), tasks })).toHaveLength(160)
})

test('the plan tool takes an optional goal, and the standing line asks for it', async () => {
  expect(TOOL_SPEC.inputSchema.properties.goal.type).toBe('string')
  expect(TOOL_SPEC.inputSchema.required).toEqual(['action'])
  expect(standing(TOOL)).toContain('"goal"')
})
