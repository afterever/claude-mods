// The sound notifications: which sounds there are, which one is chosen, how a
// sound is played, and what `/chime` understands. Only text and lists in, text
// and lists out: the reading of folders and the running of a player are
// register.tsx's, so all of this is tested without the engine.
//
// Sound notifications idea from https://github.com/angomedia/claude-mods.
// The code is written fresh for the Windows PCs this mod runs on; none of it is
// copied from there.

import type { ArsenalChime } from '../types'

export type Os = 'windows' | 'mac' | 'linux'
export type Sound = { name: string; path: string }
/** The person's own sounds, and the system's that were found on disk. */
export type Sounds = { personal: Sound[]; system: Sound[] }

/** Off, with the default sound: what anything unexpected in the store means. */
export const NO_CHIME: ArsenalChime = { isOn: false, sound: '' }

export const CHIME_STORE_KEY = 'chime'

/** The file in the person's folder that is the question sound, and no choice in the picker. */
const QUESTION = 'question'

/** `Windows_NT` is Windows; a home under `/Users/` is a Mac; anything else is Linux. */
export function osFrom(windowsEnv: string | undefined, home: string): Os {
  if (windowsEnv === 'Windows_NT') return 'windows'
  return home.startsWith('/Users/') ? 'mac' : 'linux'
}

export const soundsFolder = (home: string) => `${home}/.claude/arsenal/sounds`

const WINDOWS = ['Windows Notify Messaging', 'Windows Notify System Generic', 'Windows Message Nudge', 'Windows Ding', 'Windows Background']
const MAC = ['Glass', 'Ping', 'Pop', 'Hero', 'Tink']

/** The system's own sounds, in the order they are offered. The caller keeps those found on disk. */
export function systemCandidates(os: Os): Sound[] {
  if (os === 'windows') return WINDOWS.map(name => ({ name, path: `C:/Windows/Media/${name}.wav` }))
  if (os === 'mac') return MAC.map(name => ({ name, path: `/System/Library/Sounds/${name}.aiff` }))
  return []
}

/** The system sound the question uses when the person has no `question.wav`. */
export const questionFallback = (os: Os) => (os === 'windows' ? 'Windows Message Nudge' : os === 'mac' ? 'Ping' : '')

/** The `.wav` files of the person's folder, by name without the extension, `question` left out. */
export function personalSounds(fileNames: readonly string[], folder: string): Sound[] {
  return fileNames
    .filter(file => /\.wav$/i.test(file))
    .map(file => ({ name: file.slice(0, -4), path: `${folder}/${file}` }))
    .filter(sound => sound.name.toLowerCase() !== QUESTION)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** `question.wav` in the person's folder, else the system's fallback, else nothing to play. */
export function questionPath(fileNames: readonly string[], folder: string, system: Sound[], os: Os): string | undefined {
  const own = fileNames.find(file => file.toLowerCase() === `${QUESTION}.wav`)
  if (own) return `${folder}/${own}`
  return system.find(sound => sound.name === questionFallback(os))?.path
}

export const listOf = (s: Sounds): Sound[] => [...s.personal, ...s.system]

/** The sound called `name`; one that is gone or never chosen is the first system sound, else the person's first. */
export const chosen = (s: Sounds, name: string): Sound | undefined => listOf(s).find(x => x.name === name) ?? s.system[0] ?? s.personal[0]

/** The name after the chosen sound in the list, wrapping; empty when there is nothing to pick. */
export function nextName(s: Sounds, name: string): string {
  const list = listOf(s)
  if (list.length === 0) return ''
  const now = chosen(s, name)
  const at = now ? list.indexOf(now) : -1
  return list[(at + 1) % list.length]?.name ?? ''
}

/** The command that plays `path`, or null where nothing can. The path goes inside single quotes, doubled. */
export function playerFor(path: string, os: Os): string[] | null {
  if (os === 'windows') {
    return ['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object System.Media.SoundPlayer '${path.replace(/'/g, "''")}').PlaySync()`]
  }
  return os === 'mac' ? ['afplay', path] : null
}

// ── The store ────────────────────────────────────────────────────────────

/** What `$.store.get('chime')` gave, read back. Anything unexpected is the chime off. */
export function chimeFromStore(raw: unknown): ArsenalChime {
  const held = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return { isOn: held.isOn === true, sound: typeof held.sound === 'string' ? held.sound : '' }
}

/** The value to save for `chime`. */
export const chimeToStore = (c: ArsenalChime) => ({ version: 1 as const, isOn: c.isOn, sound: c.sound })

// ── /chime ───────────────────────────────────────────────────────────────

export type ChimeCommand = { kind: 'show' | 'on' | 'off' | 'test' | 'help' } | { kind: 'sound'; name: string }

export function parseChime(args: string): ChimeCommand {
  const text = args.trim()
  const [word = '', ...rest] = text.split(/\s+/)
  const lower = word.toLowerCase()
  if (text === '') return { kind: 'show' }
  if (lower === 'on' || lower === 'off' || lower === 'test') return { kind: lower }
  const name = rest.join(' ').trim()
  return lower === 'sound' && name !== '' ? { kind: 'sound', name } : { kind: 'help' }
}

export const CHIME_HELP = ['`/chime on` · `/chime off` · `/chime test`', '`/chime sound <name>`: pick the sound for replies'].join('\n')

/** What bare `/chime` says: on or off, the sound shown, and the names to pick from. */
export const describeChime = (c: ArsenalChime, shownName: string, names: readonly string[]) =>
  [`Sound notifications are **${c.isOn ? 'on' : 'off'}**.`, `Sound: ${shownName || 'none found'}`, names.length ? `Sounds: ${names.join(', ')}` : 'No sounds found.', '', CHIME_HELP].join('\n')
