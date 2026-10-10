import { test, expect } from 'claude-code/testing'

import type { AgentStatus, Flow } from '../types'
import { AUTO_TITLE, isCounted, isSavvyType, onFinish, onSpawn, openKey, startsBatch } from './auto'

const orchestrated: Flow = {
  title: 'Ship it',
  total: 3,
  done: 1,
  running: 1,
  phase: 'delegate',
  isFinished: false,
  tasks: [{ title: 'Write', tier: 'medium', after: [] }],
}

const auto = (over: Partial<Flow> = {}): Flow => ({
  title: AUTO_TITLE,
  total: 2,
  done: 0,
  running: 2,
  phase: 'delegate',
  isFinished: false,
  tasks: [],
  isAuto: true,
  ids: ['a', 'b'],
  ...over,
})

const run = (id: string, status: AgentStatus) => ({ id, status })

test('savvy workers are recognised bare and plugin-namespaced', () => {
  expect(isSavvyType('savvy-careful')).toBe(true)
  expect(isSavvyType('savvy-flow:savvy-careful')).toBe(true)
  expect(isSavvyType('Explore')).toBe(false)
  expect(isSavvyType('general-purpose')).toBe(false)
})

test('the first spawn opens an auto flow titled Subagents', () => {
  const f = onSpawn(null, 'a')
  expect(f?.title).toBe(AUTO_TITLE)
  expect(f?.isAuto).toBe(true)
  expect(f?.total).toBe(1)
  expect(f?.running).toBe(1)
  expect(f?.phase).toBe('delegate')
  expect(f?.ids).toEqual(['a'])
})

test('further spawns join the running auto flow', () => {
  const f = onSpawn(auto({ total: 1, running: 1, ids: ['a'] }), 'b')
  expect(f?.total).toBe(2)
  expect(f?.running).toBe(2)
  expect(f?.ids).toEqual(['a', 'b'])
})

test('a spawn after the row finished starts a fresh flow', () => {
  const f = onSpawn(auto({ total: 4, done: 4, running: 0, isFinished: true, phase: 'close' }), 'z')
  expect(f?.isFinished).toBe(false)
  expect(f?.total).toBe(1)
  expect(f?.done).toBe(0)
  expect(f?.ids).toEqual(['z'])
})

test('an orchestrated flow is left alone by spawns and completions', () => {
  expect(onSpawn(orchestrated, 'a')).toBe(orchestrated)
  expect(onFinish(orchestrated, true, [run('a', 'done')])).toBe(orchestrated)
})

test('a batch starts when there is no flow or the last one is closed', () => {
  expect(startsBatch(null)).toBe(true)
  expect(startsBatch(auto({ isFinished: true }))).toBe(true)
  expect(startsBatch(auto())).toBe(false)
  expect(startsBatch(orchestrated)).toBe(false)
})

test('a completion counts once while others still run', () => {
  const f = onFinish(auto(), true, [run('a', 'done'), run('b', 'running')])
  expect(f?.done).toBe(1)
  expect(f?.running).toBe(1)
  expect(f?.isFinished).toBe(false)
})

test('the last completion closes the flow into the Done row', () => {
  const f = onFinish(auto({ total: 3, done: 2, running: 1, ids: ['a', 'b', 'c'] }), true, [
    run('a', 'done'),
    run('b', 'done'),
    run('c', 'done'),
  ])
  expect(f?.isFinished).toBe(true)
  expect(f?.phase).toBe('close')
  expect(f?.done).toBe(3)
  expect(f?.running).toBe(0)
})

test('a run left running by an earlier batch does not hold this one open', () => {
  const f = onFinish(auto({ total: 1, running: 1, ids: ['new'] }), true, [
    run('zombie', 'running'),
    run('new', 'done'),
  ])
  expect(f?.isFinished).toBe(true)
  expect(f?.done).toBe(1)
})

test('a failed agent of the batch still lets it close', () => {
  const f = onFinish(auto({ total: 1, running: 1, ids: ['a'] }), true, [run('a', 'failed')])
  expect(f?.isFinished).toBe(true)
})

test('an uncounted completion changes nothing while the batch still runs', () => {
  const f = auto()
  expect(onFinish(f, false, [run('a', 'running'), run('b', 'running')])).toBe(f)
})

test('a finished flow is not reopened by a late completion', () => {
  const f = auto({ isFinished: true, done: 2, running: 0, phase: 'close' })
  expect(onFinish(f, true, [run('a', 'done'), run('b', 'done')])).toBe(f)
})

test('the panel key changes per batch for an auto flow, per title for an orchestrated one', () => {
  expect(openKey(auto({ ids: ['a', 'b'] }))).toBe('a')
  expect(openKey(onSpawn(auto({ ids: ['a'] }), 'b')!)).toBe('a')
  expect(openKey(onSpawn(auto({ isFinished: true, ids: ['a'] }), 'c')!)).toBe('c')
  expect(openKey(orchestrated)).toBe('Ship it')
})

test('only a running non-savvy agent is counted', () => {
  expect(isCounted({ status: 'running', type: 'Explore' })).toBe(true)
  expect(isCounted({ status: 'done', type: 'Explore' })).toBe(false)
  expect(isCounted({ status: 'running', type: 'savvy-flow:savvy-light' })).toBe(false)
  expect(isCounted(undefined)).toBe(false)
})
