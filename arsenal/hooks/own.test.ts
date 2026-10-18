import { test, expect } from 'claude-code/testing'

import { confirmed, normalizePath, offFromStore, offToStore, parseFrontmatter, projectPlace, readCandidate, sameFolder, withoutUser } from './own'

// ── Frontmatter ──────────────────────────────────────────────────────────

test('the three keys are read from the block between the leading dashes', () => {
  const text = '---\nname: handoff\nargument-hint: [a|b]\nuser-invocable: true\n---\nbody: not a key\n'
  expect(parseFrontmatter(text)).toEqual({ name: 'handoff', 'argument-hint': '[a|b]', 'user-invocable': 'true' })
})

test('surrounding quotes are taken off, and only a matching pair', () => {
  expect(parseFrontmatter('---\na: "[x|y]"\nb: \'two words\'\nc: "open\n---\n')).toEqual({ a: '[x|y]', b: 'two words', c: '"open' })
})

test('CRLF line endings and a byte order mark are accepted', () => {
  expect(parseFrontmatter('\uFEFF---\r\nname: crlf\r\nargument-hint: "[q]"\r\n---\r\nbody')).toEqual({ name: 'crlf', 'argument-hint': '[q]' })
})

test('text without a frontmatter block, or with one never closed, has no keys', () => {
  expect(parseFrontmatter('just a prompt\nname: no')).toEqual({})
  expect(parseFrontmatter('---\nname: unclosed\nmore')).toEqual({})
  expect(parseFrontmatter('')).toEqual({})
  expect(parseFrontmatter('\n---\nname: late\n---\n')).toEqual({})
})

test('a multi-line value does not break the keys after it', () => {
  const text = ['---', 'description: >', '  Long text', '  with a colon: inside', '  and more', 'argument-hint: "[go]"', 'name: after', '---'].join('\n')
  const fm = parseFrontmatter(text)
  expect(fm['argument-hint']).toBe('[go]')
  expect(fm.name).toBe('after')
})

test('a value may hold colons, and a key with no value is empty', () => {
  expect(parseFrontmatter('---\ndescription: a: b: c\nargument-hint:\n---\n')).toEqual({ description: 'a: b: c', 'argument-hint': '' })
})

// ── Naming and classification ────────────────────────────────────────────

test('a skill is named by its frontmatter name, else by its folder', () => {
  expect(readCandidate({ kind: 'skill', fallback: 'folder-name', text: '---\nname: fancy-name\n---\n' })?.name).toBe('fancy-name')
  expect(readCandidate({ kind: 'skill', fallback: 'folder-name', text: '---\ndescription: x\n---\n' })?.name).toBe('folder-name')
  expect(readCandidate({ kind: 'skill', fallback: 'folder-name', text: 'no frontmatter at all' })?.name).toBe('folder-name')
  expect(readCandidate({ kind: 'skill', fallback: 'folder-name', text: '---\nname: ""\n---\n' })?.name).toBe('folder-name')
})

test('a command is named by its file, whatever its frontmatter says', () => {
  expect(readCandidate({ kind: 'command', fallback: 'hello', text: '---\nname: other\n---\n' })?.name).toBe('hello')
})

test('user-invocable: false leaves a command out, in any case', () => {
  expect(readCandidate({ kind: 'skill', fallback: 'hidden', text: '---\nuser-invocable: false\n---\n' })).toBeNull()
  expect(readCandidate({ kind: 'skill', fallback: 'hidden', text: '---\nuser-invocable: "False"\n---\n' })).toBeNull()
  expect(readCandidate({ kind: 'skill', fallback: 'shown', text: '---\nuser-invocable: true\n---\n' })).not.toBeNull()
})

test('a non-empty argument-hint means the command takes arguments', () => {
  const hint = (value: string) => readCandidate({ kind: 'command', fallback: 'c', text: `---\nargument-hint: ${value}\n---\n` })?.takesArgs
  expect(hint('"[shipped|s|list]"')).toBe(true)
  expect(hint('<file>')).toBe(true)
  expect(hint('""')).toBe(false)
  expect(hint('')).toBe(false)
  expect(readCandidate({ kind: 'command', fallback: 'c', text: 'plain' })?.takesArgs).toBe(false)
})

// ── Confirming against the engine ────────────────────────────────────────

const listed = (name: string, source: string, description = `about ${name}`) => ({ name, description, source })

test('only names the engine lists as the person’s own are kept, with its description', () => {
  const found = [
    { name: 'handoff', takesArgs: true },
    { name: 'broken', takesArgs: false },
    { name: 'shadow', takesArgs: false },
    { name: 'docs', takesArgs: false },
  ]
  const list = [listed('handoff', 'user', 'Use when saving'), listed('shadow', 'plugin'), listed('docs', 'builtin')]
  expect(confirmed(found, list)).toEqual([{ name: 'handoff', description: 'Use when saving', takesArgs: true }])
})

test('a skill and a command of one name are one row, and either one’s hint gives the …', () => {
  const found = [
    { name: 'sync', takesArgs: false },
    { name: 'sync', takesArgs: true },
  ]
  expect(confirmed(found, [listed('sync', 'user')])).toEqual([{ name: 'sync', description: 'about sync', takesArgs: true }])
})

test('rows are sorted by name', () => {
  const found = ['standup', 'deploy', 'handoff'].map(name => ({ name, takesArgs: false }))
  const list = found.map(f => listed(f.name, 'user'))
  expect(confirmed(found, list).map(c => c.name)).toEqual(['deploy', 'handoff', 'standup'])
})

test('a description runs to one line', () => {
  const found = [{ name: 'a', takesArgs: false }]
  expect(confirmed(found, [listed('a', 'user', 'first\nsecond   line\r\nthird')])[0]?.description).toBe('first second line third')
})

test('a name found in both places is left to USER', () => {
  const user = [{ name: 'handoff', description: 'g', takesArgs: false }]
  const project = [
    { name: 'handoff', description: 'p', takesArgs: false },
    { name: 'hello', description: 'h', takesArgs: false },
  ]
  expect(withoutUser(project, user).map(c => c.name)).toEqual(['hello'])
  expect(withoutUser(project, [])).toEqual(project)
})

// ── Where the project is ─────────────────────────────────────────────────

test('slashes, a trailing slash and, on a drive path, case are made alike', () => {
  expect(normalizePath('C:\\Users\\Wenha\\Repo\\')).toBe('c:/users/wenha/repo')
  expect(normalizePath('C:/Users/Wenha/Repo/.git')).toBe('c:/users/wenha/repo/.git')
  expect(normalizePath('/home/Wenha/Repo/')).toBe('/home/Wenha/Repo')
})

test('two spellings of one folder are the same folder', () => {
  expect(sameFolder('C:\\Users\\Wenha', 'c:/users/wenha/')).toBe(true)
  expect(sameFolder('C:/Users/Wenha', 'C:/Users/Wenha/repo')).toBe(false)
})

test('in a repo the folder is its top level and the key is the shared .git folder', () => {
  const place = projectPlace('C:\\work\\repo\\sub\\deep', { top: 'C:/work/repo', common: 'C:/work/repo/.git' })
  expect(place).toEqual({ folder: 'C:/work/repo', key: 'c:/work/repo/.git' })
})

test('a worktree and the main checkout, and any subfolder, give one key', () => {
  const main = projectPlace('C:/work/repo', { top: 'C:/work/repo', common: 'C:/work/repo/.git' })
  const sub = projectPlace('C:/work/repo/sub', { top: 'C:/work/repo', common: 'C:/Work/Repo/.git' })
  const tree = projectPlace('C:/work/repo-wt', { top: 'C:/work/repo-wt', common: 'C:/work/repo/.git' })
  expect(sub.key).toBe(main.key)
  expect(tree.key).toBe(main.key)
  expect(tree.folder).toBe('C:/work/repo-wt')
})

test('an older git’s relative common dir is read against the folder git ran in', () => {
  expect(projectPlace('C:/work/repo/sub/deep', { top: 'C:/work/repo', common: '../../.git' }).key).toBe('c:/work/repo/.git')
  expect(projectPlace('C:/work/repo', { top: 'C:/work/repo', common: '.git' }).key).toBe('c:/work/repo/.git')
  expect(projectPlace('/home/me/repo/sub', { top: '/home/me/repo', common: '../.git' }).key).toBe('/home/me/repo/.git')
})

test('outside git the folder is the session’s and so is the key', () => {
  expect(projectPlace('C:\\scratch\\notes', { top: null, common: null })).toEqual({ folder: 'C:\\scratch\\notes', key: 'c:/scratch/notes' })
  expect(projectPlace('C:/scratch/notes', { top: 'C:/x', common: null })).toEqual({ folder: 'C:/scratch/notes', key: 'c:/scratch/notes' })
})

// ── What is saved ────────────────────────────────────────────────────────

test('what was saved reads back as it was written', () => {
  const off = { user: ['deploy', 'handoff'], project: { 'c:/work/repo/.git': ['seed-db'] } }
  expect(offFromStore(JSON.parse(JSON.stringify(offToStore(off))))).toEqual(off)
  expect(offToStore(off).version).toBe(1)
})

test('nothing saved, or something unexpected, reads as nothing off', () => {
  const none = { user: [], project: {} }
  expect(offFromStore(undefined)).toEqual(none)
  expect(offFromStore(null)).toEqual(none)
  expect(offFromStore('off')).toEqual(none)
  expect(offFromStore({ user: 'handoff', project: ['x'] })).toEqual(none)
  expect(offFromStore({ version: 1, user: [1, 'ok', '', 'ok', null], project: { a: [], b: 'no', c: ['z', 'y'] } })).toEqual({ user: ['ok'], project: { c: ['y', 'z'] } })
})
