import { test, expect } from 'claude-code/testing'

import {
  addHistory,
  answeredPairs,
  countWords,
  explainFailure,
  HISTORY_LIMIT,
  isShortReply,
  judgePrompt,
  parseQuestions,
  parseRewrite,
  readHistory,
  rewriteRequest,
} from './logic'
import type { SubmitFacts } from './logic'

const facts = (over: Partial<SubmitFacts> = {}): SubmitFacts => ({
  text: 'write a blog post about coffee',
  originKind: 'composer',
  attachments: 0,
  turnId: undefined,
  auto: true,
  ...over,
})

test('a rough prompt typed in automatic mode is held for an upgrade', () => {
  expect(judgePrompt(facts())).toEqual({ kind: 'upgrade' })
  expect(judgePrompt(facts({ text: 'fix the login bug' }))).toEqual({ kind: 'upgrade' })
  expect(judgePrompt(facts({ text: 'yes, but use postgres instead of sqlite for this' }))).toEqual({ kind: 'upgrade' })
})

test('nothing is held while automatic mode is off', () => {
  expect(judgePrompt(facts({ auto: false }))).toEqual({ kind: 'pass' })
  // and a ">" is then just a character: a quote, not an escape
  expect(judgePrompt(facts({ auto: false, text: '> quoted text' }))).toEqual({ kind: 'pass' })
})

test('slash commands, files, images, mid-turn messages and short replies go straight through', () => {
  const passes: Partial<SubmitFacts>[] = [
    { text: '/compact' },
    { text: '  /prompt-upgrade write something' },
    { text: '@src/app.ts explain what this does' },
    { text: 'what is in this picture', attachments: 1 },
    { text: 'also add tests', turnId: 'turn-7' },
    { text: 'yes' },
    { text: 'Yes!' },
    { text: 'keep going' },
    { text: 'ok, thanks' },
    { text: 'go ahead' },
    { text: 'do it' },
    { text: '2' },
    { text: '好的' },
    { text: '继续' },
    { text: '   ' },
  ]
  for (const over of passes) expect(judgePrompt(facts(over))).toEqual({ kind: 'pass' })
})

test('only the persons own Enter is held: the mods own prompt can never loop back', () => {
  for (const originKind of ['plugin', 'task-notification', 'scheduled-trigger', 'peer', 'bridge', 'sdk', 'channel']) {
    expect(judgePrompt(facts({ originKind }))).toEqual({ kind: 'pass' })
  }
})

test('a leading > skips the upgrade and is stripped before sending', () => {
  expect(judgePrompt(facts({ text: '>fix the typo' }))).toEqual({ kind: 'strip', text: 'fix the typo' })
  expect(judgePrompt(facts({ text: '> fix the typo in the readme' }))).toEqual({ kind: 'strip', text: 'fix the typo in the readme' })
  // even mid-turn or with an image: the escape is the escape
  expect(judgePrompt(facts({ text: '> look', turnId: 't', attachments: 1 }))).toEqual({ kind: 'strip', text: 'look' })
  // a lone ">" has nothing to send: left alone
  expect(judgePrompt(facts({ text: '>' }))).toEqual({ kind: 'pass' })
})

test('short replies are told from short requests', () => {
  expect(isShortReply('yes please')).toBe(true)
  expect(isShortReply('fix bug')).toBe(false)
  expect(isShortReply('refactor auth')).toBe(false)
  expect(isShortReply('')).toBe(false)
})

test('words are counted in any script', () => {
  expect(countWords('')).toBe(0)
  expect(countWords('  write   a post ')).toBe(3)
  expect(countWords('写一篇关于咖啡的文章')).toBe(10)
  expect(countWords('write 一篇 post')).toBe(4)
})

test('reading the questions: tagged, trimmed to three, two to four options each', () => {
  const raw = `
    <question><text>Who is it for?</text><option>Customers</option><option> My team </option></question>
    <question><text>How long?</text><option>Short</option><option>short</option><option>Detailed</option>
      <option>One page</option><option>Two pages</option><option>Three pages</option></question>
    <question><text>Only one option</text><option>Alone</option></question>
    <question><text>Tone?</text><option>Formal</option><option>Friendly</option></question>
    <question><text>One too many</text><option>A</option><option>B</option></question>`
  const qs = parseQuestions(raw)
  expect(qs.map(q => q.text)).toEqual(['Who is it for?', 'How long?', 'Tone?'])
  expect(qs[0]!.options).toEqual(['Customers', 'My team'])
  // a repeat is dropped, and four is the most
  expect(qs[1]!.options).toEqual(['Short', 'Detailed', 'One page', 'Two pages'])
})

test('reading the questions: none, junk and JSON all land safely', () => {
  expect(parseQuestions('<none/>')).toEqual([])
  expect(parseQuestions('')).toEqual([])
  expect(parseQuestions('Sorry, I cannot help with that.')).toEqual([])
  const json = '{"questions":[{"text":"Format?","options":["Table","List"]},{"question":"Bad","options":["x"]}]}'
  expect(parseQuestions(json)).toEqual([{ text: 'Format?', options: ['Table', 'List'] }])
  // long text is cut, never wrapped through the pane
  const long = parseQuestions(`<question><text>${'q'.repeat(400)}</text><option>${'o'.repeat(200)}</option><option>b</option></question>`)
  expect([...long[0]!.text].length).toBeLessThanOrEqual(160)
  expect([...long[0]!.options[0]!].length).toBeLessThanOrEqual(48)
})

test('reading the rewrite: the prompt and what was added', () => {
  const raw = '<prompt>\nWrite a short launch email for [product name].\n\nKeep it friendly.\n</prompt>\n<added><item>Audience</item><item> - Tone: friendly </item><item></item></added>'
  expect(parseRewrite(raw)).toEqual({
    text: 'Write a short launch email for [product name].\n\nKeep it friendly.',
    added: ['Audience', 'Tone: friendly'],
  })
})

test('reading the rewrite: an untagged answer is the prompt; tag soup and nothing are refused', () => {
  expect(parseRewrite('Write a poem about rain.')).toEqual({ text: 'Write a poem about rain.', added: [] })
  expect(parseRewrite('```\nWrite a poem.\n```')?.text).toBe('Write a poem.')
  expect(parseRewrite('')).toBeNull()
  expect(parseRewrite('<prompt>   </prompt>')).toBeNull()
  expect(parseRewrite('<added><item>x</item></added>')).toBeNull()
  const many = '<prompt>p</prompt><added>' + Array.from({ length: 12 }, (_, i) => `<item>d${i}</item>`).join('') + '</added>'
  expect(parseRewrite(many)!.added).toHaveLength(8)
})

test('the rewrite is asked from the answers given, and what was skipped is left out', () => {
  const questions = [
    { text: 'Who is it for?', options: ['Customers', 'My team'] },
    { text: 'How long?', options: ['Short', 'Long'] },
    { text: 'Tone?', options: ['Formal', 'Friendly'] },
  ]
  const answers = [
    { kind: 'option' as const, text: 'Customers' },
    { kind: 'skip' as const },
    { kind: 'other' as const, text: 'playful but not silly' },
  ]
  expect(answeredPairs(questions, answers)).toEqual([
    { question: 'Who is it for?', choice: 'Customers' },
    { question: 'Tone?', choice: 'playful but not silly' },
  ])
  const req = rewriteRequest('write a launch email', questions, answers)
  expect(req.prompt).toContain('write a launch email')
  expect(req.prompt).toContain('Customers')
  expect(req.prompt).toContain('playful but not silly')
  expect(req.prompt).not.toContain('How long?')
  expect(req.system).toContain('[placeholder]')
  expect(rewriteRequest('x', questions, [null, null, null]).prompt).toContain('<answers>none</answers>')
})

test('a failed call is explained in a plain sentence', () => {
  expect(explainFailure({ reason: 'aborted' })).toContain('too long')
  expect(explainFailure({ reason: 'empty-reply' })).toContain('nothing')
  expect(explainFailure({ reason: 'api-error', status: 429 })).toContain('busy')
  expect(explainFailure({ reason: 'api-error', status: 529, error: 'overloaded' })).toContain('overloaded')
  expect(explainFailure({ reason: 'api-error', status: null, error: 'unknown' })).toContain('could not be reached')
})

test('the history keeps the newest twenty, once each', () => {
  let list: ReturnType<typeof addHistory> = []
  for (let i = 0; i < 25; i++) list = addHistory(list, { id: 'id' + i, at: i, original: 'o' + i, text: 't' + i, added: [] })
  expect(list).toHaveLength(HISTORY_LIMIT)
  expect(list[0]!.id).toBe('id24')
  expect(list[HISTORY_LIMIT - 1]!.id).toBe('id5')
  // the same upgrade run again moves to the top instead of repeating
  list = addHistory(list, { id: 'id10', at: 99, original: 'o10', text: 'again', added: [] })
  expect(list.filter(x => x.id === 'id10')).toHaveLength(1)
  expect(list[0]!.text).toBe('again')
  // what the store held is trusted no further than its shape
  expect(readHistory('nope')).toEqual([])
  expect(readHistory([{ id: 'a', original: 'o', text: 't' }, { id: 5 }, null])).toEqual([{ id: 'a', at: 0, original: 'o', text: 't', added: [] }])
})
