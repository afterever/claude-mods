import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { strWidth } from './layout'
import { VERSION } from './version'

const PANE = 'prompt-upgrade'

const QUESTIONS =
  '<question><text>Who is it for?</text><option>Customers</option><option>My team</option></question>' +
  '<question><text>How long should it be?</text><option>Short</option><option>Detailed</option><option>One page</option></question>'
const UPGRADE =
  'Write a short, friendly launch email for [product name], aimed at customers, with one clear call to action. It is done when I can paste it straight into my mail tool.'
const REWRITE = `<prompt>${UPGRADE}</prompt><added><item>Audience: customers</item><item>Tone: friendly</item><item>What done looks like</item></added>`

type Opts = {
  /** Whether the pane can be seated. */
  placed?: boolean
  questions?: string
  rewrite?: string
  /** The rewrite calls' answers in turn; the last one repeats. */
  rewrites?: string[]
  /** Answers this many model calls with a rate limit before answering. */
  failFirst?: number
  /** Holds the first model call until this resolves. */
  hold?: Promise<void>
  stored?: Record<string, unknown>
}

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// The world beneath the plugin: the model, the prompt box, the pane, the store
function world(on: On, o: Opts = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const stored: Record<string, unknown> = o.stored ?? {}
  const calls: { model: string; system: string; prompt: string }[] = []
  const submitted: { text: string; kind: string }[] = []
  const filled: string[] = []
  const toasts: string[] = []
  const closed: string[] = []
  const opened: string[] = []
  let failures = o.failFirst ?? 0
  const rewrites = [...(o.rewrites ?? [o.rewrite ?? REWRITE])]

  on('store.get', async (_$, e) => ({ value: stored[e.key] }) as any)
  on('store.set', async (_$, e) => {
    stored[e.key] = e.value
    return { value: undefined } as any
  })
  on('session.start', async () => ({ cwd: 'C:/bats' }))
  on('command.register', async () => ({ value: { command: 'prompt-upgrade' } }) as any)
  on('prompt.submit', async (_$, e) => {
    submitted.push({ text: e.text, kind: e.origin.kind })
    return { text: e.text } as any
  })
  on('prompt.fill', async (_$, e) => {
    filled.push(e.text)
    return { isFilled: true } as any
  })
  on('ui.open', async () => {
    opened.push('open')
    return { value: o.placed === false ? { isPlaced: false, reason: 'the terminal is 80 columns wide' } : { isPlaced: true } } as any
  })
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    return { value: undefined } as any
  })
  on('ui.panes', async () => ({ value: [{ id: PANE, title: 'Prompt Upgrade', isShown: true, isFocused: true, isPlaced: true }] }) as any)
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as any
  })
  on('ui.copy', async () => ({ value: { isCopied: true } }) as any)
  on('model.complete', async (_$, e) => {
    const index = calls.length
    calls.push({ model: e.model, system: e.system ?? '', prompt: e.prompt })
    if (index === 0 && o.hold) await o.hold
    if (failures > 0) {
      failures -= 1
      return { value: { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage } } as any
    }
    const isQuestions = (e.system ?? '').includes('multiple-choice')
    const text = isQuestions ? (o.questions ?? QUESTIONS) : rewrites.length > 1 ? rewrites.shift()! : rewrites[0]!
    return { value: { isAnswered: true, text, usage } } as any
  })
  return { clock, stored, calls, submitted, filled, toasts, closed, opened }
}

const cmd = (args: string) => ({ command: 'prompt-upgrade', args }) as any
const typed = (text: string, extra: Record<string, unknown> = {}) =>
  ({ text, wait: false, origin: { kind: 'composer' }, ...extra }) as any

const paneProps = (bodyColumns: number) => ({
  title: 'Prompt Upgrade',
  isFocused: true,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
})

const mountPane = ($: any, cols = 100) =>
  $.ui.mount({ plugin: PANE, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(cols) })

// Every visual row of a drawn tree, as cells: a row Box is the sum of what it holds
const strings = (n: any): string => (typeof n === 'string' ? n : Array.isArray(n?.children) ? n.children.flat(Infinity).map(strings).join('') : '')
function rowWidths(n: any, out: number[] = []): number[] {
  if (typeof n === 'string') {
    out.push(strWidth(n))
    return out
  }
  const kids: any[] = Array.isArray(n?.children) ? n.children.flat(Infinity).filter((k: any) => k !== null && k !== false && k !== undefined) : []
  // nothing may be given a width in cells: the pane reports a width the row it
  // is laid out in can be narrower than, so a fixed number runs off the edge
  // (a drawing is sized in CSS pixels and scales down to its slot: that is not a width in cells)
  if (n?.type === 'Svg') return out
  expect(typeof n?.props?.width === 'number' ? `a fixed width of ${n.props.width} on a ${n.type}` : 'none').toBe('none')
  if (n?.type === 'Text') {
    // text the surface wraps or truncates is bounded by the row it sits in
    if (n.props?.wrap === 'wrap' || n.props?.wrap === 'truncate-end') return out
    out.push(strWidth(strings(n)))
    return out
  }
  // a rule is a long run in a box that clips it: bounded by the row, never wrapped
  if (n?.type === 'Box' && n.props?.overflow === 'hidden') {
    expect(n.props.height).toBe(1)
    return out
  }
  if (n?.type === 'Box' && n.props?.flexDirection === 'row') {
    // a row of chips or pieces is allowed to wrap between them
    if (n.props.flexWrap === 'wrap') {
      kids.forEach(k => out.push(strWidth(strings(k))))
      return out
    }
    // a row the surface sizes (a percent width, or none): its children are laid out inside it
    kids.forEach(k => rowWidths(k, out))
    return out
  }
  if (n?.type === 'Box' || n?.type === undefined) kids.forEach(k => rowWidths(k, out))
  else out.push(strWidth(strings(n)))
  return out
}

test('the last row of the pane is the version, on the compose and the history screens', async ($, on) => {
  const w = world(on)
  const lastText = async (ui: any) => (await ui.findAll({ type: 'Text' })).slice(-1).map((t: any) => t.text)
  const ui = await mountPane($)
  expect(await lastText(ui)).toEqual([`prompt-upgrade v${VERSION}`])
  await $.command.run(cmd('history'))
  await w.clock.settle()
  expect(await lastText(ui)).toEqual([`prompt-upgrade v${VERSION}`])
})

test('automatic mode holds a rough prompt and lets everything else straight through', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('on'))

  // straight through: the engine's own bottom took each, as typed
  for (const text of ['/compact', 'yes', 'keep going', '@src/app.ts explain this file']) {
    const r: any = await $.prompt.submit(typed(text))
    expect(r.text).toBe(text)
  }
  expect(((await $.prompt.submit(typed('what is in this image', { attachments: [{ type: 'image' }] }))) as any).text).toBe('what is in this image')
  expect(((await $.prompt.submit(typed('also add tests', { turnId: 't1' }))) as any).text).toBe('also add tests')
  // the ">" is the escape: stripped, then sent as it is
  expect(((await $.prompt.submit(typed('>fix the typo in the readme'))) as any).text).toBe('fix the typo in the readme')
  // another source's prompt, and the mod's own, are never held: nothing can loop back
  for (const name of ['someone-else', PANE]) {
    const r: any = await $.prompt.submit({ text: 'write a poem about rain', wait: false, origin: { kind: 'plugin', name } } as any)
    expect(r.text).toBe('write a poem about rain')
  }
  await w.clock.settle()
  expect(w.calls).toHaveLength(0)
  expect(w.opened).toHaveLength(0)
  expect(w.submitted).toHaveLength(9)

  // a rough prompt: held, the pane opens, the fast model is asked, nothing is sent
  const held: any = await $.prompt.submit(typed('write a launch email'))
  expect(held.drop).toBeDefined()
  expect(held.text).toBeUndefined()
  await w.clock.settle()
  expect(w.submitted).toHaveLength(9)
  expect(w.opened).toHaveLength(1)
  expect(w.calls).toHaveLength(1)
  expect(w.calls[0]!.model).toBe('haiku')
  expect(w.calls[0]!.prompt).toContain('write a launch email')
})

test('the on and off switch is kept, and off lets every prompt through', async ($, on) => {
  const w = world(on)
  const rough = 'write a launch email'
  // off to begin with: a rough prompt is not held
  expect(((await $.prompt.submit(typed(rough))) as any).text).toBe(rough)

  const turnedOn: any = await $.command.run(cmd('on'))
  expect(turnedOn.text).toContain('on')
  expect(w.stored.auto).toBe(true)
  expect(((await $.prompt.submit(typed(rough))) as any).drop).toBeDefined()
  await w.clock.settle()

  // a held one is open in the pane; cancel it, then switch off
  const ui = await mountPane($)
  await ui.press({ key: 'cancel' })
  const turnedOff: any = await $.command.run(cmd('off'))
  expect(turnedOff.text).toContain('off')
  expect(w.stored.auto).toBe(false)
  expect(((await $.prompt.submit(typed('write a poem'))) as any).text).toBe('write a poem')
})

test('automatic mode is read back from the store when a session starts', async ($, on) => {
  const w = world(on, { stored: { auto: true } })
  await $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
  expect(((await $.prompt.submit(typed('write a launch email'))) as any).drop).toBeDefined()
  await w.clock.settle()
  expect(w.calls).toHaveLength(1)
})

test('the full flow from /prompt-upgrade to Run', async ($, on) => {
  const w = world(on)
  const r: any = await $.command.run(cmd('write a launch email'))
  // the command answers at once, in a sentence
  expect(r.text).toContain('Nothing is sent until you press Run')
  await w.clock.settle()

  const ui = await mountPane($)
  // step two: the questions, each a numbered badge, chips, "Other (type it)" and a quiet Skip
  expect(await ui.find({ text: 'Who is it for?' })).toBeDefined()
  expect(await ui.find({ text: 'How long should it be?' })).toBeDefined()
  expect(await ui.find({ key: 'q0-other' })).toMatchObject({ text: ' Other (type it) ' })
  expect(await ui.find({ key: 'q0-skip' })).toBeDefined()
  expect(await ui.find({ text: '0 of 2 answered' })).toBeDefined()
  expect(await ui.find({ key: 'upgrade-now' })).toMatchObject({ text: ' Skip the rest, upgrade now ' })

  // answering turns the badge into a green check and counts it
  await ui.press({ key: 'q0-o0' })
  expect(await ui.find({ text: '1 of 2 answered' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: ' ✓ ' })).some(t => t.props.backgroundColor === '#3DD68C')).toBe(true)
  await ui.press({ key: 'q1-skip' })
  expect(await ui.find({ key: 'upgrade-now' })).toMatchObject({ text: ' Upgrade now ' })
  await ui.press({ key: 'upgrade-now' })
  await w.clock.settle()

  // the rewrite asks from what was answered and leaves the skipped question out
  expect(w.calls).toHaveLength(2)
  expect(w.calls[1]!.model).toBe('sonnet')
  expect(w.calls[1]!.prompt).toContain('Customers')
  expect(w.calls[1]!.prompt).not.toContain('How long should it be?')

  // step four: the review
  expect(await ui.find({ key: 'run' })).toMatchObject({ text: ' Run it ' })
  // the upgrade on the right, the list of what was added above the cards
  expect(await ui.find({ text: 'Write a short, friendly launch' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === 'Audience: customers')).toBe(true)
  // the gold chip is the main button; Edit and Copy are slate; Cancel is plain
  expect((await ui.findAll({ type: 'Text', text: ' Run it ' }))[0]!.props).toMatchObject({ backgroundColor: '#F2C46D', color: '#0D1117', bold: true })
  expect((await ui.findAll({ type: 'Text', text: ' Edit ' }))[0]!.props).toMatchObject({ backgroundColor: '#262B33', color: '#E6EDF3' })
  expect((await ui.findAll({ type: 'Text', text: ' Cancel ' }))[0]!.props.backgroundColor).toBeUndefined()

  await ui.press({ key: 'run' })
  await w.clock.settle()
  // the upgrade is sent by the mod, as the person's own words
  expect(w.submitted).toEqual([{ text: UPGRADE, kind: 'plugin' }])
  expect(w.closed).toContain(PANE)
  // and it is kept in the history
  const kept = w.stored.history as { original: string; text: string; added: string[] }[]
  expect(kept).toHaveLength(1)
  expect(kept[0]).toMatchObject({ original: 'write a launch email', text: UPGRADE, added: ['Audience: customers', 'Tone: friendly', 'What done looks like'] })
})

test('the sent upgrade never comes back to the pane, even in automatic mode', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('on'))
  expect(((await $.prompt.submit(typed('write a launch email'))) as any).drop).toBeDefined()
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'upgrade-now' })
  await w.clock.settle()
  await ui.press({ key: 'run' })
  await w.clock.settle()
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]!.kind).toBe('plugin')
  // two model calls for one upgrade, none for the sent text
  expect(w.calls).toHaveLength(2)
  expect(w.opened).toHaveLength(1)
})

test('no question would help: straight from reading to the review', async ($, on) => {
  const w = world(on, { questions: '<none/>' })
  await $.command.run(cmd('translate "good morning" into French'))
  await w.clock.settle()
  expect(w.calls).toHaveLength(2)
  expect(w.calls[1]!.prompt).toContain('<answers>none</answers>')
  const ui = await mountPane($)
  expect(await ui.find({ key: 'run' })).toBeDefined()
  expect(await ui.find({ key: 'q0-o0' })).toBeUndefined()
})

test('Other (type it) takes a typed answer into the rewrite', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'q0-other' })
  await ui.input({ key: 'other-0', text: 'the investors' })
  expect(await ui.find({ key: 'q0-other' })).toMatchObject({ text: ' ✓ Other: the investors ' })
  await ui.press({ key: 'upgrade-now' })
  await w.clock.settle()
  expect(w.calls[1]!.prompt).toContain('the investors')
})

test('Cancel closes the pane and puts the original prompt back in the box', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'cancel' })
  await w.clock.settle()
  expect(w.closed).toContain(PANE)
  expect(w.filled).toEqual(['write a launch email'])
  expect(w.submitted).toEqual([])
})

test('Cancel while the model is thinking stops it: a late answer is dropped', async ($, on) => {
  let release!: () => void
  const hold = new Promise<void>(r => (release = r))
  const w = world(on, { hold, questions: '<none/>' })
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  // the questions call is held; the person cancels meanwhile
  const ui = await mountPane($)
  expect(await ui.find({ key: 'cancel' })).toBeDefined()
  await ui.press({ key: 'cancel' })
  release()
  await w.clock.settle()
  expect(w.filled).toEqual(['write a launch email'])
  // the answer that landed after is not turned into a second call
  expect(w.calls).toHaveLength(1)
  expect(w.submitted).toEqual([])
})

test('a failed model call shows a calm card with Try again, Send my original and Cancel', async ($, on) => {
  const w = world(on, { failFirst: 1 })
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(all.some(t => t.includes('Your prompt is safe'))).toBe(true)
  expect(all.some(t => t.includes('busy'))).toBe(true)
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  expect(await ui.find({ key: 'send-original' })).toBeDefined()
  expect(await ui.find({ key: 'cancel' })).toBeDefined()
  // nothing was sent and nothing was lost
  expect(w.submitted).toEqual([])

  await ui.press({ key: 'retry' })
  await w.clock.settle()
  expect(w.calls).toHaveLength(2)
  expect(await ui.find({ text: 'Who is it for?' })).toBeDefined()
})

test('Send my original sends the words exactly as typed', async ($, on) => {
  const w = world(on, { failFirst: 1 })
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'send-original' })
  await w.clock.settle()
  expect(w.submitted).toEqual([{ text: 'write a launch email', kind: 'plugin' }])
  expect(w.closed).toContain(PANE)
})

test('a rewrite that cannot be read keeps the answers: Try again does not ask the questions twice', async ($, on) => {
  // the first rewrite has no prompt in it; the second is good
  const w = world(on, { rewrites: ['<added><item>x</item></added>', REWRITE] })
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'q0-o1' })
  await ui.press({ key: 'upgrade-now' })
  await w.clock.settle()
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  expect(w.calls).toHaveLength(2)
  await ui.press({ key: 'retry' })
  await w.clock.settle()
  expect(await ui.find({ key: 'run' })).toBeDefined()
  // three calls in all: the questions once, the rewrite twice, both with the answer
  expect(w.calls).toHaveLength(3)
  expect(w.calls[2]!.prompt).toContain('My team')
})

test('a pane that cannot open gives the words back and says so in one line', async ($, on) => {
  const w = world(on, { placed: false })
  const r: any = await $.command.run(cmd('write a launch email'))
  expect(r.text).toBeDefined()
  await w.clock.settle()
  expect(w.filled).toEqual(['write a launch email'])
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('wider window')
  expect(w.toasts[0]).not.toContain('\n')
  // nothing was asked of the model for a pane nobody can see
  expect(w.calls).toHaveLength(0)
})

test('in automatic mode a pane that cannot open lets the words go back to the box too', async ($, on) => {
  const w = world(on, { placed: false })
  await $.command.run(cmd('on'))
  const r: any = await $.prompt.submit(typed('write a launch email'))
  expect(r.drop).toBeDefined()
  // the box is filled once the engine has taken the submitted text out of it
  await w.clock.advance(300)
  expect(w.filled).toEqual(['write a launch email'])
  expect(w.toasts).toHaveLength(1)
  expect(w.submitted).toEqual([])
})

test('a reload mid-step picks the step back up instead of leaving the pane stuck', async ($, on) => {
  let release!: () => void
  const hold = new Promise<void>(r => (release = r))
  const w = world(on, { hold })
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  // the questions call is out and never comes back: the module is reloaded
  expect(w.calls).toHaveLength(1)
  await $.session.start({ cwd: 'C:/bats', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  expect(w.calls).toHaveLength(2)

  const ui = await mountPane($)
  expect(await ui.find({ text: 'Who is it for?' })).toBeDefined()
  await ui.press({ key: 'q0-o0' })
  // the first call lands late: it must not undo what the person has done since
  release()
  await w.clock.settle()
  expect(await ui.find({ text: '1 of 2 answered' })).toBeDefined()
  expect(w.calls).toHaveLength(2)
})

test('edit changes the upgraded text and Enter runs it', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'upgrade-now' })
  await w.clock.settle()
  await ui.press({ key: 'edit' })
  expect(await ui.find({ key: 'edit-text' })).toBeDefined()
  await ui.input({ key: 'edit-text', text: 'Write a launch email for [product name] in two sentences.', kind: 'change' })
  await ui.input({ key: 'edit-text', text: 'Write a launch email for [product name] in two sentences.' })
  await w.clock.settle()
  expect(w.submitted).toEqual([{ text: 'Write a launch email for [product name] in two sentences.', kind: 'plugin' }])
})

test('the three numbers are one drawing where vectors are drawn, box characters in a terminal', async ($, on) => {
  const w = world(on, { questions: '<none/>' })
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const desktop = await $.ui.mount({ plugin: PANE, surface: 'desktop', component: 'Pane', requestId: PANE, props: paneProps(100) })
  const art = await desktop.find({ type: 'Svg' })
  expect(art).toBeDefined()
  expect(String(art!.props.alt)).toMatch(/^\d+ words before, \d+ words after, \d+ details added$/)
  // the review's other rows are text on either surface
  expect(await desktop.find({ key: 'run' })).toBeDefined()

  const terminal = await mountPane($, 100)
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ text: 'words before' })).toBeDefined()
  expect((await terminal.findAll({ type: 'Text' })).some(t => /^[─-╳ ]+$/.test(t.text) && t.text.includes('━'))).toBe(true)
})

test('copy puts the upgrade on the clipboard and says so beside the button', async ($, on) => {
  const w = world(on)
  await $.command.run(cmd('write a launch email'))
  await w.clock.settle()
  const ui = await mountPane($)
  await ui.press({ key: 'upgrade-now' })
  await w.clock.settle()
  await ui.press({ key: 'copy' })
  await w.clock.settle()
  expect(await ui.find({ text: 'Copied' })).toBeDefined()
  // copying is no reason to toast
  expect(w.toasts).toEqual([])
})

test('the history keeps twenty and a click reopens an upgrade for review', async ($, on) => {
  const w = world(on, { questions: '<none/>' })
  const ui = await mountPane($)
  for (let i = 0; i < 22; i++) {
    await $.command.run(cmd(`prompt number ${i}`))
    await w.clock.settle()
    await ui.press({ key: 'run' })
    await w.clock.settle()
  }
  const kept = w.stored.history as { original: string }[]
  expect(kept).toHaveLength(20)
  expect(kept[0]!.original).toBe('prompt number 21')

  const shown: any = await $.command.run(cmd('history'))
  expect(shown.text).toContain('20')
  await w.clock.settle()
  const rows = await ui.findAll({ type: 'Button' })
  expect(rows.filter(b => (b.key ?? '').startsWith('hist-'))).toHaveLength(20)
  await ui.press({ key: 'hist-2' })
  // the review of that upgrade, original on the left
  expect(await ui.find({ key: 'run' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text.includes('prompt number 19'))).toBe(true)
  // closing a reopened review puts nothing in the prompt box
  await ui.press({ key: 'cancel' })
  await w.clock.settle()
  expect(w.filled).toEqual([])
})

test('/prompt-upgrade alone opens a box to type a prompt', async ($, on) => {
  const w = world(on, { questions: '<none/>' })
  const r: any = await $.command.run(cmd(''))
  expect(r.text).toBeDefined()
  await w.clock.settle()
  const ui = await mountPane($)
  expect(await ui.find({ key: 'compose' })).toBeDefined()
  await ui.input({ key: 'compose', text: 'write a launch email' })
  await w.clock.settle()
  expect(w.calls).toHaveLength(2)
  expect(await ui.find({ key: 'run' })).toBeDefined()
})

test('every form of the command answers at once with a sentence, never nothing', async ($, on) => {
  const w = world(on, { questions: '<none/>' })
  for (const args of ['', 'on', 'off', 'history', 'help', 'write a launch email']) {
    const r: any = await $.command.run(cmd(args))
    expect(typeof r.text).toBe('string')
    expect(r.text.length).toBeGreaterThan(10)
    await w.clock.settle()
  }
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`every screen fits the pane at a narrow width and a wide one on ${surface}`, async ($, on) => {
    const long = 'Write a launch email for the new product. '.repeat(12) + 'verylongunbrokenwordthatwillhavetobebroken'.repeat(2)
    const w = world(on, {
      rewrite: `<prompt>${long}</prompt><added><item>${'A rather long detail that has to be wrapped '.repeat(3)}</item><item>Short</item></added>`,
    })
    for (const cols of [30, 44, 60, 80, 100, 140]) {
      const ui = await $.ui.mount({ plugin: PANE, surface, component: 'Pane', requestId: PANE, props: paneProps(cols) })
      const width = Math.min(120, cols)
      const check = async (what: string) => {
        const rows = rowWidths(await ui.drawn())
        const widest = Math.max(...rows)
        expect(`${what} @${cols}: ${widest <= width ? 'fits' : 'wide ' + widest}`).toBe(`${what} @${cols}: fits`)
      }
      await $.command.run(cmd('write a launch email'))
      await w.clock.settle()
      // the check is only worth anything if it saw rows
      expect(rowWidths(await ui.drawn()).length).toBeGreaterThan(8)
      await check('questions')
      await ui.press({ key: 'q0-o0' })
      await ui.press({ key: 'q1-other' })
      await check('typing')
      await ui.press({ key: 'upgrade-now' })
      await w.clock.settle()
      await check('review')
      await ui.press({ key: 'edit' })
      await check('edit')
      await ui.press({ key: 'stop-edit' })
      await ui.press({ key: 'show-history' })
      await check('history')
      await ui.press({ key: 'close' })
      await ui.press({ key: 'cancel' })
      await w.clock.settle()
      await ui.unmount()
    }
  })
}
