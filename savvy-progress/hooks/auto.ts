import type { AgentRun, Flow } from '../types'

// Subagent work outside any /savvy-flow: nobody reports a plan, so the flow row is
// derived from spawns and completions. An orchestrated flow (the `progress` tool,
// or a `savvy-*` worker) is never touched here.

export const AUTO_TITLE = 'Subagents'

/** `savvy-careful`, or `savvy-flow:savvy-careful` when the agents ship in a plugin. */
export const isSavvyType = (type: string): boolean => type.startsWith('savvy-')

const fresh = (): Flow => ({
  title: AUTO_TITLE,
  total: 0,
  done: 0,
  running: 0,
  phase: 'delegate',
  isFinished: false,
  tasks: [],
  isAuto: true,
  ids: [],
})

/** No flow, or the last one is closed: the next spawn opens a new batch. */
export const startsBatch = (prev: Flow | null): boolean => prev === null || prev.isFinished

/** A non-savvy agent `id` started: join the running auto flow, or open a new one. */
export const onSpawn = (prev: Flow | null, id: string): Flow | null => {
  if (prev && !prev.isFinished && !prev.isAuto) return prev
  const base = prev && !prev.isFinished ? prev : fresh()
  const ids = base.ids ?? []
  return {
    ...base,
    total: base.total + 1,
    running: base.running + 1,
    ids: ids.includes(id) ? ids : [...ids, id],
  }
}

/** Whether a run's completion counts toward an auto flow: it was running and not a savvy worker. */
export const isCounted = (run: Pick<AgentRun, 'status' | 'type'> | undefined): boolean =>
  run !== undefined && run.status === 'running' && !isSavvyType(run.type)

/**
 * Only this batch's own agents decide it is over: a run left `running` by an earlier
 * batch (an interrupted agent never reports back) must not hold it open.
 */
const isBatchIdle = (f: Flow, runs: Pick<AgentRun, 'id' | 'status'>[]): boolean =>
  (f.ids ?? []).every(id => runs.find(r => r.id === id)?.status !== 'running')

/**
 * An agent finished. Count it when it was one this flow spawned; once none of the
 * batch is running any more, close the flow, which draws as the green "Done" row
 * until dismissed.
 */
export const onFinish = (
  prev: Flow | null,
  counted: boolean,
  runs: Pick<AgentRun, 'id' | 'status'>[],
): Flow | null => {
  if (!prev || !prev.isAuto || prev.isFinished) return prev
  if (isBatchIdle(prev, runs)) return { ...prev, done: prev.total, running: 0, phase: 'close', isFinished: true }
  if (!counted) return prev
  return { ...prev, done: Math.min(prev.total, prev.done + 1), running: Math.max(0, prev.running - 1) }
}
