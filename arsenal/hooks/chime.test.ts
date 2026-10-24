import { test, expect } from 'claude-code/testing'

import {
  CHIME_HELP,
  NO_CHIME,
  chimeFromStore,
  chimeToStore,
  chosen,
  describeChime,
  listOf,
  nextName,
  osFrom,
  parseChime,
  personalSounds,
  playerFor,
  questionFallback,
  questionPath,
  soundsFolder,
  systemCandidates,
} from './chime'
import type { Sounds } from './chime'

const system = [
  { name: 'Windows Notify Messaging', path: 'C:/Windows/Media/Windows Notify Messaging.wav' },
  { name: 'Windows Message Nudge', path: 'C:/Windows/Media/Windows Message Nudge.wav' },
]
const sounds = (personal: string[]): Sounds => ({ personal: personal.map(name => ({ name, path: `F/${name}.wav` })), system })

// ── The player ───────────────────────────────────────────────────────────

test('Windows plays a wav through PowerShell’s SoundPlayer', () => {
  expect(playerFor('C:/a/b.wav', 'windows')).toEqual([
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "(New-Object System.Media.SoundPlayer 'C:/a/b.wav').PlaySync()",
  ])
})

test('an apostrophe in the path is doubled, so it cannot leave the quotes', () => {
  const argv = playerFor("C:/Users/O'Brien/x.wav", 'windows')
  expect(argv?.[4]).toBe("(New-Object System.Media.SoundPlayer 'C:/Users/O''Brien/x.wav').PlaySync()")
})

test('macOS plays with afplay, and Linux plays nothing', () => {
  expect(playerFor('/x.aiff', 'mac')).toEqual(['afplay', '/x.aiff'])
  expect(playerFor('/x.wav', 'linux')).toBeNull()
})

test('the OS comes from the Windows environment, else a Mac-style home', () => {
  expect(osFrom('Windows_NT', '')).toBe('windows')
  expect(osFrom(undefined, '/Users/me')).toBe('mac')
  expect(osFrom(undefined, '/home/me')).toBe('linux')
})

// ── The list ─────────────────────────────────────────────────────────────

test('the person’s sounds are the wav files, by name, without question.wav', () => {
  expect(personalSounds(['b.WAV', 'a.wav', 'question.wav', 'notes.txt', 'c.mp3'], 'F')).toEqual([
    { name: 'a', path: 'F/a.wav' },
    { name: 'b', path: 'F/b.WAV' },
  ])
})

test('the folder is under .claude/arsenal/sounds in the home folder', () => {
  expect(soundsFolder('C:/home')).toBe('C:/home/.claude/arsenal/sounds')
})

test('the system candidates are the design’s five on Windows, five on a Mac, none on Linux', () => {
  expect(systemCandidates('windows').map(s => s.name)).toEqual([
    'Windows Notify Messaging',
    'Windows Notify System Generic',
    'Windows Message Nudge',
    'Windows Ding',
    'Windows Background',
  ])
  expect(systemCandidates('windows')[0]?.path).toBe('C:/Windows/Media/Windows Notify Messaging.wav')
  expect(systemCandidates('mac').map(s => s.name)).toEqual(['Glass', 'Ping', 'Pop', 'Hero', 'Tink'])
  expect(systemCandidates('mac')[0]?.path).toBe('/System/Library/Sounds/Glass.aiff')
  expect(systemCandidates('linux')).toEqual([])
})

test('the question sound is question.wav when there is one, else the system’s fallback, else none', () => {
  expect(questionFallback('windows')).toBe('Windows Message Nudge')
  expect(questionFallback('mac')).toBe('Ping')
  expect(questionFallback('linux')).toBe('')
  expect(questionPath(['question.wav', 'a.wav'], 'F', system, 'windows')).toBe('F/question.wav')
  expect(questionPath(['a.wav'], 'F', system, 'windows')).toBe('C:/Windows/Media/Windows Message Nudge.wav')
  expect(questionPath([], 'F', [], 'windows')).toBeUndefined()
})

test('the chosen sound is the one named, else the first system sound, else the first of the person’s', () => {
  expect(chosen(sounds(['mine']), 'mine')?.name).toBe('mine')
  expect(chosen(sounds(['mine']), 'Windows Message Nudge')?.name).toBe('Windows Message Nudge')
  expect(chosen(sounds(['mine']), '')?.name).toBe('Windows Notify Messaging')
  expect(chosen(sounds(['mine']), 'gone')?.name).toBe('Windows Notify Messaging')
  expect(chosen({ personal: [{ name: 'mine', path: 'F/mine.wav' }], system: [] }, 'gone')?.name).toBe('mine')
  expect(chosen({ personal: [], system: [] }, '')).toBeUndefined()
})

test('the next sound goes down the list, personal first, and wraps', () => {
  const s = sounds(['mine'])
  expect(listOf(s).map(x => x.name)).toEqual(['mine', 'Windows Notify Messaging', 'Windows Message Nudge'])
  expect(nextName(s, 'mine')).toBe('Windows Notify Messaging')
  expect(nextName(s, 'Windows Message Nudge')).toBe('mine')
  expect(nextName(s, 'gone')).toBe('Windows Message Nudge')
  expect(nextName({ personal: [], system: [] }, '')).toBe('')
})

// ── The store ────────────────────────────────────────────────────────────

test('anything unexpected in the store is the chime off', () => {
  for (const raw of [undefined, null, 'x', 7, [], { isOn: 'yes' }]) expect(chimeFromStore(raw)).toEqual(NO_CHIME)
})

test('the chime round-trips through the store', () => {
  const held = { isOn: true, sound: 'Ping' }
  expect(chimeToStore(held)).toEqual({ version: 1, isOn: true, sound: 'Ping' })
  expect(chimeFromStore(chimeToStore(held))).toEqual(held)
})

// ── /chime ───────────────────────────────────────────────────────────────

test('/chime arguments: nothing shows, on, off, test, sound <name>, anything else helps', () => {
  expect(parseChime('')).toEqual({ kind: 'show' })
  expect(parseChime(' ON ')).toEqual({ kind: 'on' })
  expect(parseChime('off')).toEqual({ kind: 'off' })
  expect(parseChime('test')).toEqual({ kind: 'test' })
  expect(parseChime('sound Windows Ding')).toEqual({ kind: 'sound', name: 'Windows Ding' })
  expect(parseChime('sound')).toEqual({ kind: 'help' })
  expect(parseChime('banana')).toEqual({ kind: 'help' })
})

test('the state line names on or off, the sound shown and the names to pick from', () => {
  const on = describeChime({ isOn: true, sound: '' }, 'Windows Ding', ['a', 'Windows Ding'])
  expect(on).toContain('on')
  expect(on).toContain('Windows Ding')
  expect(on).toContain('a, Windows Ding')
  expect(describeChime(NO_CHIME, 'Windows Ding', [])).toContain('off')
  expect(CHIME_HELP).toContain('/chime sound')
})
