import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, ModelCompleteRequest, Register } from 'claude-code'

import type { UpgradeAnswer, UpgradeFlow, UpgradeHistoryItem } from '../types'
import {
  addHistory,
  explainFailure,
  judgePrompt,
  parseQuestions,
  parseRewrite,
  QUESTION_MODEL,
  questionsRequest,
  readHistory,
  REWRITE_MODEL,
  rewriteRequest,
} from './logic'
import type { Failure } from './logic'
import { drawPane } from './view'
import type { Actions } from './view'

const PANE = 'prompt-upgrade'
// Asked for by a command or a prompt, so it is placed at any width; focused so
// the chips and the field take the keys at once
const PANE_ARGS = { id: PANE, title: 'Prompt Upgrade', focus: true, closeOnEscape: true, rows: 30, columns: 100 } as const

const NEEDS_ROOM = 'Prompt Upgrade needs a wider window. Your prompt is back in the box.'

// What the drawings read lives in $.state, so a hot reload keeps the upgrade
// where it was; `auto` and `history` are also kept in $.store across sessions
const flowAtom = atom({ plugin: 'prompt-upgrade', key: 'flow' } as const, null)
const viewAtom = atom({ plugin: 'prompt-upgrade', key: 'view' } as const, 'flow')
const autoAtom = atom({ plugin: 'prompt-upgrade', key: 'auto' } as const, false)
const historyAtom = atom({ plugin: 'prompt-upgrade', key: 'history' } as const, [])

// The model calls in flight, by upgrade id, so Cancel can stop one
const stops = new Map<string, AbortController>()
let counter = 0

const plain = (err: unknown) => (err instanceof Error && err.message ? err.message : 'something went wrong')

// ── State helpers ────────────────────────────────────────────────────────

async function patch($: EngineInterface, fn: (f: UpgradeFlow) => UpgradeFlow) {
  await update($, flowAtom, f => (f ? fn(f) : null))
}

/** The upgrade is still the one a model call started for, at the same step. */
function isLive(f: UpgradeFlow | null | undefined, id: string, attempt: number, phase: UpgradeFlow['phase']): f is UpgradeFlow {
  return !!f && f.id === id && f.attempt === attempt && f.phase === phase
}

function stopCall(id: string | undefined) {
  if (!id) return
  stops.get(id)?.abort()
  stops.delete(id)
}

async function openPane($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.open(PANE_ARGS)).isPlaced
  } catch {
    return false
  }
}

async function ensurePane($: EngineInterface) {
  try {
    const open = (await $.ui.panes()).some(p => p.id === PANE)
    if (!open) await $.ui.open(PANE_ARGS)
  } catch {
    // no surface to ask: the next draw will say
  }
}

async function remember($: EngineInterface, f: UpgradeFlow, text: string) {
  const item: UpgradeHistoryItem = { id: f.id, at: await $.clock.now(), original: f.original, text, added: f.rewrite?.added ?? [] }
  const list = await update($, historyAtom, past => addHistory(past ?? [], item))
  try {
    await $.store.set('history', list)
  } catch {
    // the history is for this session still
  }
}

// ── Model calls ──────────────────────────────────────────────────────────

type Reply = { ok: true; text: string } | { ok: false; why: string }

async function ask($: EngineInterface, id: string, request: ModelCompleteRequest): Promise<Reply> {
  const stop = new AbortController()
  stops.set(id, stop)
  try {
    const r = await $.model.complete(request, { signal: stop.signal })
    if (r.isAnswered) return { ok: true, text: r.text }
    const failure: Failure = {
      reason: r.reason as Failure['reason'],
      status: 'status' in r ? r.status : undefined,
      error: 'error' in r ? String(r.error) : undefined,
    }
    return { ok: false, why: explainFailure(failure) }
  } catch {
    return { ok: false, why: explainFailure({ reason: 'api-error' }) }
  } finally {
    if (stops.get(id) === stop) stops.delete(id)
  }
}

async function fail($: EngineInterface, where: 'questions' | 'rewrite', message: string) {
  await patch($, f => ({ ...f, phase: 'error', error: { where, message } }))
}

/** Step one: the fast model's questions. None would help: straight to the rewrite. */
async function askQuestions($: EngineInterface, id: string, attempt: number) {
  const f = await read($, flowAtom)
  if (!isLive(f, id, attempt, 'reading')) return
  const reply = await ask($, id, {
    model: QUESTION_MODEL,
    ...questionsRequest(f.original),
    maxTokens: 700,
    effort: 'low',
    timeoutMs: 45000,
  })
  if (!isLive(await read($, flowAtom), id, attempt, 'reading')) return
  if (!reply.ok) return fail($, 'questions', reply.why)
  const questions = parseQuestions(reply.text)
  if (questions.length === 0) {
    await patch($, x => ({ ...x, phase: 'rewriting', attempt: attempt + 1, questions: [], answers: [], error: null }))
    return writeRewrite($, id, attempt + 1)
  }
  await patch($, x => ({ ...x, phase: 'questions', questions, answers: questions.map(() => null), typing: null, error: null }))
}

/** Step three: the upgraded prompt and the list of what was added. */
async function writeRewrite($: EngineInterface, id: string, attempt: number) {
  const f = await read($, flowAtom)
  if (!isLive(f, id, attempt, 'rewriting')) return
  const reply = await ask($, id, {
    model: REWRITE_MODEL,
    ...rewriteRequest(f.original, f.questions, f.answers),
    maxTokens: 3000,
    effort: 'low',
    timeoutMs: 90000,
  })
  if (!isLive(await read($, flowAtom), id, attempt, 'rewriting')) return
  if (!reply.ok) return fail($, 'rewrite', reply.why)
  const rewrite = parseRewrite(reply.text)
  if (!rewrite) return fail($, 'rewrite', 'The model’s answer could not be read.')
  await patch($, x => ({ ...x, phase: 'review', rewrite, draft: rewrite.text, isEditing: false, note: '', error: null }))
}

// ── Starting and ending an upgrade ───────────────────────────────────────

const fresh = (id: string, original: string): UpgradeFlow => ({
  id,
  attempt: 0,
  original,
  phase: 'reading',
  questions: [],
  answers: [],
  typing: null,
  rewrite: null,
  isEditing: false,
  draft: '',
  note: '',
  error: null,
  isFromHistory: false,
})

/** Puts the person's words back in the prompt box. False when there was no box to take them. */
async function restore($: EngineInterface, text: string): Promise<boolean> {
  try {
    return (await $.prompt.fill({ text })).isFilled
  } catch {
    return false
  }
}

async function dismiss($: EngineInterface, f: UpgradeFlow | null, closePane: boolean) {
  stopCall(f?.id)
  await update($, flowAtom, () => null)
  await update($, viewAtom, () => 'flow')
  if (closePane) {
    try {
      await $.ui.close({ id: PANE })
    } catch {
      // already gone
    }
  }
}

/** Nothing is lost: the original goes back in the box, or into the history when the box cannot take it. */
async function giveBack($: EngineInterface, f: UpgradeFlow) {
  if (f.isFromHistory || f.original.trim() === '') return
  if (await restore($, f.original)) return
  await remember($, f, f.original)
  $.ui.toast('Could not put your prompt back in the box. It is saved in /better history.')
}

/** Cancel: closes the pane and puts the original back. Esc and the pane's close mark do the same. */
async function cancel($: EngineInterface, closePane = true) {
  const f = (await read($, flowAtom)) ?? null
  await dismiss($, f, closePane)
  if (f) await giveBack($, f)
}

/** An upgrade is open and a different one starts: what the first held is kept, never dropped. */
async function settle($: EngineInterface) {
  const f = (await read($, flowAtom)) ?? null
  if (!f) return
  if (f.rewrite && f.phase === 'review') {
    if (!f.isFromHistory) await remember($, f, f.isEditing ? f.draft : f.rewrite.text)
    await dismiss($, f, false)
    return
  }
  await dismiss($, f, false)
  await giveBack($, f)
}

/**
 * Opens the pane on a new upgrade. Returns its id, or null when the pane could
 * not open: then the words are back in the prompt box and the person is told.
 * `later` waits a moment before the box is filled, for a prompt the engine is
 * still taking out of the box.
 */
async function prepare($: EngineInterface, original: string, later = false): Promise<string | null> {
  await settle($)
  const id = `${(await $.clock.now()).toString(36)}-${++counter}`
  await update($, flowAtom, () => fresh(id, original))
  await update($, viewAtom, () => 'flow')
  if (await openPane($)) return id
  await dismiss($, null, true)
  const put = async () => {
    await restore($, original)
    $.ui.toast(NEEDS_ROOM)
  }
  if (later) $.clock.after(150, () => void put())
  else await put()
  return null
}

async function startFromText($: EngineInterface, original: string) {
  const id = await prepare($, original)
  if (id) await askQuestions($, id, 0)
}

async function openCompose($: EngineInterface) {
  await settle($)
  await update($, viewAtom, () => 'flow')
  if (!(await openPane($))) $.ui.toast(NEEDS_ROOM)
}

async function showHistoryPane($: EngineInterface) {
  await update($, viewAtom, () => 'history')
  if (!(await openPane($))) $.ui.toast(NEEDS_ROOM)
}

async function setAuto($: EngineInterface, value: boolean) {
  await update($, autoAtom, () => value)
  try {
    await $.store.set('auto', value)
  } catch {
    // on or off for this session still
  }
}

// ── What a press does ────────────────────────────────────────────────────

async function runText($: EngineInterface, raw: string) {
  const f = (await read($, flowAtom)) ?? null
  const text = raw.trim()
  if (!f || f.phase !== 'review' || text === '') return
  // the history first: whatever happens next, the upgrade is kept
  await remember($, f, text)
  await dismiss($, f, true)
  try {
    await $.prompt.submit({ text, asUser: true })
  } catch (err) {
    await restore($, text)
    $.ui.toast(`Could not send the upgrade (${plain(err)}). It is back in the prompt box.`)
  }
}

async function sendOriginal($: EngineInterface) {
  const f = (await read($, flowAtom)) ?? null
  if (!f) return
  await dismiss($, f, true)
  try {
    await $.prompt.submit({ text: f.original, asUser: true })
  } catch (err) {
    await restore($, f.original)
    $.ui.toast(`Could not send your prompt (${plain(err)}). It is back in the prompt box.`)
  }
}

async function retry($: EngineInterface) {
  const f = (await read($, flowAtom)) ?? null
  if (!f || f.phase !== 'error' || !f.error) return
  const where = f.error.where
  const attempt = f.attempt + 1
  await patch($, x => ({ ...x, phase: where === 'questions' ? 'reading' : 'rewriting', attempt, error: null }))
  await (where === 'questions' ? askQuestions($, f.id, attempt) : writeRewrite($, f.id, attempt))
}

async function upgradeNow($: EngineInterface) {
  const f = (await read($, flowAtom)) ?? null
  if (!f || f.phase !== 'questions') return
  const attempt = f.attempt + 1
  await patch($, x => ({ ...x, phase: 'rewriting', attempt, typing: null }))
  await writeRewrite($, f.id, attempt)
}

function setAnswer(i: number, answer: UpgradeAnswer | null) {
  return (f: UpgradeFlow): UpgradeFlow => ({ ...f, typing: null, answers: f.answers.map((a, n) => (n === i ? answer : a)) })
}

async function choose($: EngineInterface, i: number, text: string) {
  await patch($, f => {
    const now = f.answers[i]
    const same = now?.kind === 'option' && now.text === text
    return setAnswer(i, same ? null : { kind: 'option', text })(f)
  })
}

async function submitOther($: EngineInterface, i: number, text: string) {
  const value = text.trim()
  await patch($, f => (value === '' ? { ...f, typing: null } : setAnswer(i, { kind: 'other', text: value })(f)))
}

async function skip($: EngineInterface, i: number) {
  await patch($, f => setAnswer(i, f.answers[i]?.kind === 'skip' ? null : { kind: 'skip' })(f))
}

async function copyUpgrade($: EngineInterface, surface: Parameters<Actions['copy']>[0]) {
  const f = (await read($, flowAtom)) ?? null
  if (!f?.rewrite) return
  const text = f.isEditing ? f.draft : f.rewrite.text
  let note: UpgradeFlow['note'] = 'no-clipboard'
  try {
    note = (await $.ui.copy({ text, surface })).isCopied ? 'copied' : 'no-clipboard'
  } catch {
    // no clipboard to reach
  }
  await patch($, x => ({ ...x, note }))
}

async function openHistoryItem($: EngineInterface, id: string) {
  const item = ((await read($, historyAtom)) ?? []).find(x => x.id === id)
  if (!item) return
  await settle($)
  const flow: UpgradeFlow = {
    ...fresh(`${item.id}`, item.original),
    phase: 'review',
    rewrite: { text: item.text, added: item.added },
    draft: item.text,
    isFromHistory: true,
  }
  await update($, flowAtom, () => flow)
  await update($, viewAtom, () => 'flow')
}

function actions($: EngineInterface): Actions {
  // a handler that fails says so once, plainly; nothing else is shown for a press
  const safe =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    (...args: A) => {
      fn(...args).catch(err => $.ui.toast(`Prompt Upgrade: ${plain(err)}`))
    }
  return {
    run: safe(async () => {
      const f = (await read($, flowAtom)) ?? null
      if (f?.rewrite) await runText($, f.isEditing ? f.draft : f.rewrite.text)
    }),
    runText: safe((text: string) => runText($, text)),
    edit: safe(() => patch($, f => ({ ...f, isEditing: true, draft: f.draft || f.rewrite?.text || '' }))),
    stopEdit: safe(() =>
      patch($, f => ({ ...f, isEditing: false, rewrite: f.rewrite ? { ...f.rewrite, text: f.draft.trim() || f.rewrite.text } : f.rewrite })),
    ),
    copy: surface => safe(() => copyUpgrade($, surface))(),
    cancel: safe(() => cancel($)),
    retry: safe(() => retry($)),
    sendOriginal: safe(() => sendOriginal($)),
    upgradeNow: safe(() => upgradeNow($)),
    choose: safe((i: number, text: string) => choose($, i, text)),
    typeOther: safe((i: number) => patch($, f => ({ ...f, typing: i }))),
    submitOther: safe((i: number, text: string) => submitOther($, i, text)),
    skip: safe((i: number) => skip($, i)),
    draft: safe((text: string) => patch($, f => ({ ...f, draft: text, note: '' }))),
    compose: safe(async (text: string) => {
      const value = text.trim()
      if (value === '') return
      const id = await prepare($, value)
      if (id) await askQuestions($, id, 0)
    }),
    openHistoryItem: safe((id: string) => openHistoryItem($, id)),
    showHistory: safe(() => update($, viewAtom, () => 'history').then(() => undefined)),
    closeHistory: safe(async () => {
      await update($, viewAtom, () => 'flow')
      if (!(await read($, flowAtom))) await dismiss($, null, true)
    }),
  }
}

// ── The module ───────────────────────────────────────────────────────────

/** A reload leaves a model call dead: start the step again so the pane is never stuck. */
async function resume($: EngineInterface) {
  const f = (await read($, flowAtom)) ?? null
  if (!f) return
  await ensurePane($)
  if (f.phase !== 'reading' && f.phase !== 'rewriting') return
  const attempt = f.attempt + 1
  await patch($, x => ({ ...x, attempt }))
  if (f.phase === 'reading') await askQuestions($, f.id, attempt)
  else await writeRewrite($, f.id, attempt)
}

const USAGE = 'Prompt Upgrade: /better <prompt> upgrades that prompt, /better opens a box to type one, /better on|off flips automatic mode, /better history shows your last 20.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'better',
        description: 'Upgrade a rough prompt before it is sent (/better <prompt>, on, off, history)',
        argumentHint: '[prompt | on | off | history]',
        immediate: true,
      })
    } catch {
      // the automatic mode still works without the command
    }
    try {
      await update($, autoAtom, () => false)
      if ((await $.store.get('auto')) === true) await update($, autoAtom, () => true)
      const saved = readHistory(await $.store.get('history'))
      await update($, historyAtom, () => saved)
    } catch {
      // start with the defaults: automatic mode off, no history
    }
    try {
      await resume($)
    } catch {
      // a step that cannot be picked up again shows its error card on the next try
    }
    return next(e)
  })

  // Automatic mode: a typed prompt goes to the pane first. Anything that fails
  // here lets the prompt through untouched, never loses it.
  on('prompt.submit', async ($, e, next) => {
    const verdict = judgePrompt({
      text: e.text,
      originKind: e.origin.kind,
      attachments: e.attachments?.length ?? 0,
      turnId: e.turnId,
      auto: (await read($, autoAtom)) === true,
    })
    if (verdict.kind === 'pass') return next(e)
    if (verdict.kind === 'strip') return next({ ...e, text: verdict.text })

    const open = (await read($, flowAtom)) ?? null
    if (open && !open.isFromHistory) {
      // one upgrade at a time: the new words wait in the box
      const words = e.text
      $.clock.after(150, () => void restore($, words))
      return { drop: 'An upgrade is already open in the pane. Your prompt is back in the box.' }
    }
    const id = await prepare($, e.text, true)
    if (id) void askQuestions($, id, 0)
    return { drop: id ? 'Held for upgrade in the Prompt Upgrade pane. Nothing was sent.' : NEEDS_ROOM }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'better' }, async ($, e) => {
    try {
      const raw = String(e.args ?? '').trim()
      const word = raw.toLowerCase()
      if (word === 'on' || word === 'off') {
        await setAuto($, word === 'on')
        return {
          text:
            word === 'on'
              ? 'Automatic upgrades are on: prompts you type open in the pane first. Start one with ">" to send it as it is.'
              : 'Automatic upgrades are off. /better still upgrades a prompt when you ask.',
        }
      }
      if (word === 'help' || word === '?') return { text: USAGE }
      if (word === 'history') {
        const n = ((await read($, historyAtom)) ?? []).length
        void showHistoryPane($).catch(() => undefined)
        return { text: n > 0 ? `Your last ${n} ${n === 1 ? 'upgrade is' : 'upgrades are'} in the pane. Click one to reopen it.` : 'No upgrades yet.' }
      }
      if (raw === '') {
        void openCompose($).catch(() => undefined)
        return { text: 'Type your rough prompt in the pane.' }
      }
      void startFromText($, raw).catch(() => undefined)
      return { text: 'Upgrading your prompt in the pane. Nothing is sent until you press Run.' }
    } catch (err) {
      return { text: `Prompt Upgrade could not do that: ${plain(err)}.` }
    }
  }).catch(() => ({ text: 'Prompt Upgrade could not do that right now. Your prompt was not sent.' }))

  // Esc and the pane's close mark are a Cancel: the original goes back in the box
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') {
      try {
        await cancel($, false)
      } catch {
        // the pane is closed either way
      }
    }
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e) as unknown as Elements['terminal']
    if (e.surface === 'mobile') {
      const { Text } = el
      return <Text color="#7D8590">Prompt Upgrade needs the terminal or the desktop app.</Text>
    }
    const flow = (await read($, flowAtom)) ?? null
    const view = (await read($, viewAtom)) ?? 'flow'
    const auto = (await read($, autoAtom)) === true
    const history = (await read($, historyAtom)) ?? []
    const now = await $.clock.now()
    const width = Math.max(24, Math.min(120, e.props.bodyColumns || PANE_ARGS.columns))
    // the terminal's table answers Svg too but draws it empty: its tiles are text
    const Svg = e.surface === 'terminal' ? undefined : (el as unknown as Partial<Elements['desktop']>).Svg
    return drawPane(el, { width, auto, flow, view, history, now, ...(Svg ? { Svg } : {}) }, actions($))
  })
}
