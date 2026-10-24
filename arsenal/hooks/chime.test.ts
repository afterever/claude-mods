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
  nextSent,
  osFrom,
  parseChime,
  personalSounds,
  playerFor,
  sentChoice,
  shouldPlaySent,
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

test('Windows plays an mp3 through WPF’s MediaPlayer, which starts at once and waits out the clip', () => {
  const argv = playerFor('C:/a/b.MP3', 'windows')
  expect(argv?.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-Command'])
  const script = argv?.[4] ?? ''
  expect(script).toContain('System.Windows.Media.MediaPlayer')
  expect(script).toContain("(New-Object System.Uri('C:/a/b.MP3'))")
  // play first, then wait for the length to be known and for what is left of it
  expect(script.indexOf('.Play()')).toBeLessThan(script.indexOf('NaturalDuration'))
  expect(script).toContain('.Close()')
})

test('an apostrophe in an mp3’s path is doubled too', () => {
  expect(playerFor("C:/O'Brien/x.mp3", 'windows')?.[4]).toContain("System.Uri('C:/O''Brien/x.mp3')")
})

test('macOS plays with afplay, an mp3 as well, and Linux plays nothing', () => {
  expect(playerFor('/x.aiff', 'mac')).toEqual(['afplay', '/x.aiff'])
  expect(playerFor('/x.mp3', 'mac')).toEqual(['afplay', '/x.mp3'])
  expect(playerFor('/x.wav', 'linux')).toBeNull()
  expect(playerFor('/x.mp3', 'linux')).toBeNull()
})

test('the OS comes from the Windows environment, else a Mac-style home', () => {
  expect(osFrom('Windows_NT', '')).toBe('windows')
  expect(osFrom(undefined, '/Users/me')).toBe('mac')
  expect(osFrom(undefined, '/home/me')).toBe('linux')
  // the system's own sounds folder tells a Mac whatever its home is called
  expect(osFrom(undefined, '/Volumes/X/me', true)).toBe('mac')
  expect(osFrom(undefined, '/home/me', false)).toBe('linux')
  expect(osFrom('Windows_NT', '/Users/x', true)).toBe('windows')
})

// ── The list ─────────────────────────────────────────────────────────────

test('the person’s sounds are the wav and mp3 files, by name; a question.wav is a sound like any other', () => {
  expect(personalSounds(['b.WAV', 'a.wav', 'question.wav', 'notes.txt', 'c.MP3', 'd.m4a'], 'F')).toEqual([
    { name: 'a', path: 'F/a.wav' },
    { name: 'b', path: 'F/b.WAV' },
    { name: 'c', path: 'F/c.MP3' },
    { name: 'question', path: 'F/question.wav' },
  ])
})

test('a wav and an mp3 of one name are one sound, the wav', () => {
  expect(personalSounds(['bell.mp3', 'bell.wav'], 'F')).toEqual([{ name: 'bell', path: 'F/bell.wav' }])
  expect(personalSounds(['bell.wav', 'bell.mp3'], 'F')).toEqual([{ name: 'bell', path: 'F/bell.wav' }])
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

test('the sent sound is the one named; none, or one that is gone, is no sound', () => {
  expect(sentChoice(sounds(['mine']), 'mine')?.name).toBe('mine')
  expect(sentChoice(sounds(['mine']), 'Windows Message Nudge')?.name).toBe('Windows Message Nudge')
  expect(sentChoice(sounds(['mine']), '')).toBeUndefined()
  expect(sentChoice(sounds(['mine']), 'gone')).toBeUndefined()
})

test('the next sent sound goes none, then down the list, and wraps back to none', () => {
  const s = sounds(['mine'])
  expect(nextSent(s, '')).toBe('mine')
  expect(nextSent(s, 'mine')).toBe('Windows Notify Messaging')
  expect(nextSent(s, 'Windows Message Nudge')).toBe('')
  expect(nextSent(s, 'gone')).toBe('mine')
  expect(nextSent({ personal: [], system: [] }, '')).toBe('')
})

test('only the person’s own Enter on a prompt swooshes: not a command, a plugin, a notice or a hidden prompt', () => {
  expect(shouldPlaySent({ origin: { kind: 'composer' } })).toBe(true)
  expect(shouldPlaySent({ origin: { kind: 'composer' }, command: { name: 'chime' } })).toBe(false)
  expect(shouldPlaySent({ origin: { kind: 'composer' }, isMeta: true })).toBe(false)
  expect(shouldPlaySent({ origin: { kind: 'plugin' } })).toBe(false)
  expect(shouldPlaySent({ origin: { kind: 'notification' } })).toBe(false)
})

// ── The store ────────────────────────────────────────────────────────────

test('anything unexpected in the store is the chime off', () => {
  for (const raw of [undefined, null, 'x', 7, [], { isOn: 'yes' }]) expect(chimeFromStore(raw)).toEqual(NO_CHIME)
})

test('the chime round-trips through the store', () => {
  const held = { isOn: true, sound: 'Ping', sent: '' }
  expect(chimeToStore(held)).toEqual({ version: 1, isOn: true, sound: 'Ping' })
  expect(chimeFromStore(chimeToStore(held))).toEqual(held)
})

test('a sent sound is saved when there is one, and a 0.4.0 store without it reads as none', () => {
  const held = { isOn: true, sound: 'Ping', sent: 'Glass' }
  expect(chimeToStore(held)).toEqual({ version: 1, isOn: true, sound: 'Ping', sent: 'Glass' })
  expect(chimeFromStore(chimeToStore(held))).toEqual(held)
  expect(chimeFromStore({ version: 1, isOn: true, sound: 'Ping' })).toEqual({ isOn: true, sound: 'Ping', sent: '' })
})

// ── /chime ───────────────────────────────────────────────────────────────

test('/chime arguments: nothing shows, on, off, test, sound <name>, anything else helps', () => {
  expect(parseChime('')).toEqual({ kind: 'show' })
  expect(parseChime(' ON ')).toEqual({ kind: 'on' })
  expect(parseChime('off')).toEqual({ kind: 'off' })
  expect(parseChime('test')).toEqual({ kind: 'test' })
  expect(parseChime('sound Windows Ding')).toEqual({ kind: 'sound', name: 'Windows Ding' })
  expect(parseChime('sound')).toEqual({ kind: 'help' })
  expect(parseChime('sent Windows Ding')).toEqual({ kind: 'sent', name: 'Windows Ding' })
  expect(parseChime('sent none')).toEqual({ kind: 'sent', name: '' })
  expect(parseChime('SENT None')).toEqual({ kind: 'sent', name: '' })
  expect(parseChime('sent')).toEqual({ kind: 'help' })
  expect(parseChime('banana')).toEqual({ kind: 'help' })
})

test('the state line names on or off, both sounds shown and the names to pick from', () => {
  const on = describeChime({ isOn: true, sound: '', sent: 'a' }, 'Windows Ding', 'a', ['a', 'Windows Ding'])
  expect(on).toContain('on')
  expect(on).toContain('Sound: Windows Ding')
  expect(on).toContain('Sent: a')
  expect(on).toContain('a, Windows Ding')
  expect(describeChime(NO_CHIME, 'Windows Ding', '', [])).toContain('off')
  expect(describeChime(NO_CHIME, 'Windows Ding', '', [])).toContain('Sent: none')
  expect(CHIME_HELP).toContain('/chime sound')
  expect(CHIME_HELP).toContain('/chime sent')
})
