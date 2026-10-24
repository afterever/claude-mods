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

/** Off, with the default sound and no sent sound: what anything unexpected in the store means. */
export const NO_CHIME: ArsenalChime = { isOn: false, sound: '', sent: '' }

export const CHIME_STORE_KEY = 'chime'

/** `Windows_NT` is Windows; Apple's sound folder or a home under `/Users/` is a Mac; anything else is Linux. */
export function osFrom(windowsEnv: string | undefined, home: string, hasMacSounds = false): Os {
  if (windowsEnv === 'Windows_NT') return 'windows'
  return hasMacSounds || home.startsWith('/Users/') ? 'mac' : 'linux'
}

/** The folder every Mac has Apple's own alert sounds in. */
export const MAC_SOUNDS_FOLDER = '/System/Library/Sounds'

export const soundsFolder = (home: string) => `${home}/.claude/arsenal/sounds`

const WINDOWS = ['Windows Notify Messaging', 'Windows Notify System Generic', 'Windows Message Nudge', 'Windows Ding', 'Windows Background']
const MAC = ['Glass', 'Ping', 'Pop', 'Hero', 'Tink']

/** The system's own sounds, in the order they are offered. The caller keeps those found on disk. */
export function systemCandidates(os: Os): Sound[] {
  if (os === 'windows') return WINDOWS.map(name => ({ name, path: `C:/Windows/Media/${name}.wav` }))
  if (os === 'mac') return MAC.map(name => ({ name, path: `/System/Library/Sounds/${name}.aiff` }))
  return []
}

const MP3 = /\.mp3$/i

/** The file types of the person's folder, best first: where one name has several, the first listed here is the sound. A Mac's `afplay` plays more than the Windows players do. */
const FORMATS: Record<Os, readonly string[]> = {
  windows: ['wav', 'mp3'],
  linux: ['wav', 'mp3'],
  mac: ['wav', 'mp3', 'm4a', 'aiff', 'caf'],
}

/** The files of the person's folder this system plays, by name without the extension; one name in several formats is one sound, in the best format. */
export function personalSounds(fileNames: readonly string[], folder: string, os: Os): Sound[] {
  const formats = FORMATS[os]
  const byName = new Map<string, { sound: Sound; rank: number }>()
  for (const file of fileNames) {
    const dot = file.lastIndexOf('.')
    const rank = dot < 0 ? -1 : formats.indexOf(file.slice(dot + 1).toLowerCase())
    if (rank < 0) continue
    const name = file.slice(0, dot)
    const held = byName.get(name)
    if (!held || rank < held.rank) byName.set(name, { sound: { name, path: `${folder}/${file}` }, rank })
  }
  return [...byName.values()].map(x => x.sound).sort((a, b) => a.name.localeCompare(b.name))
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

/** The sent sound: the one named. Empty, or one that is gone, is no sound, unlike Claude's, which falls back to the first. */
export const sentChoice = (s: Sounds, name: string): Sound | undefined => (name === '' ? undefined : listOf(s).find(x => x.name === name))

/** The name after the sent sound in `none`, then the list, wrapping back to none. */
export function nextSent(s: Sounds, name: string): string {
  const names = ['', ...listOf(s).map(x => x.name)]
  const at = names.indexOf(sentChoice(s, name)?.name ?? '')
  return names[(at + 1) % names.length] ?? ''
}

/** What `prompt.submit` knows of a prompt, as far as this needs. */
export type SubmittedPrompt = { origin: { kind: string }; isMeta?: true; command?: unknown }

/** The swoosh is for the person's own Enter on a prompt: not a slash command, a plugin's or a peer's prompt, or one they never see. */
export const shouldPlaySent = (p: SubmittedPrompt) => p.origin.kind === 'composer' && !p.isMeta && !p.command

/** The command that plays `path`, or null where nothing can. The path goes inside single quotes, doubled. */
export function playerFor(path: string, os: Os): string[] | null {
  if (os === 'windows') {
    const quoted = path.replace(/'/g, "''")
    return ['powershell', '-NoProfile', '-NonInteractive', '-Command', MP3.test(path) ? mp3Script(quoted) : `(New-Object System.Media.SoundPlayer '${quoted}').PlaySync()`]
  }
  return os === 'mac' ? ['afplay', path] : null
}

/**
 * `SoundPlayer` plays only wav, so an mp3 goes through WPF's `MediaPlayer`
 * (PowerShell 5.1 has it; the script has no dispatcher, so no `MediaEnded`).
 * It starts at once and then waits for the length to be known, and for what is
 * left of it, so the process outlives the clip. `quoted` has its `'` doubled.
 */
const mp3Script = (quoted: string) =>
  [
    'Add-Type -AssemblyName presentationCore',
    '$p = New-Object System.Windows.Media.MediaPlayer',
    `$p.Open((New-Object System.Uri('${quoted}')))`,
    '$p.Play()',
    '$t = [Diagnostics.Stopwatch]::StartNew()',
    'while (-not $p.NaturalDuration.HasTimeSpan -and $t.ElapsedMilliseconds -lt 3000) { Start-Sleep -Milliseconds 20 }',
    'if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int][Math]::Max(0, $p.NaturalDuration.TimeSpan.TotalMilliseconds - $p.Position.TotalMilliseconds) + 100) }',
    '$p.Close()',
  ].join('; ')

// ── The store ────────────────────────────────────────────────────────────

/** What `$.store.get('chime')` gave, read back. Anything unexpected is the chime off. */
export function chimeFromStore(raw: unknown): ArsenalChime {
  const held = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return { isOn: held.isOn === true, sound: typeof held.sound === 'string' ? held.sound : '', sent: typeof held.sent === 'string' ? held.sent : '' }
}

/** The value to save for `chime`. `sent` is left out while it is none, so a 0.4.0 store reads back the same. */
export const chimeToStore = (c: ArsenalChime) => ({ version: 1 as const, isOn: c.isOn, sound: c.sound, ...(c.sent ? { sent: c.sent } : {}) })

// ── /chime ───────────────────────────────────────────────────────────────

/** `sent`'s name is empty for `none`. */
export type ChimeCommand = { kind: 'show' | 'on' | 'off' | 'test' | 'help' } | { kind: 'sound' | 'sent'; name: string }

export function parseChime(args: string): ChimeCommand {
  const text = args.trim()
  const [word = '', ...rest] = text.split(/\s+/)
  const lower = word.toLowerCase()
  if (text === '') return { kind: 'show' }
  if (lower === 'on' || lower === 'off' || lower === 'test') return { kind: lower }
  const name = rest.join(' ').trim()
  if (lower === 'sound' && name !== '') return { kind: 'sound', name }
  if (lower === 'sent' && name !== '') return { kind: 'sent', name: name.toLowerCase() === 'none' ? '' : name }
  return { kind: 'help' }
}

export const CHIME_HELP = [
  '`/chime on` · `/chime off` · `/chime test`',
  "`/chime sound <name>`: pick Claude's sound (a reply, a question, a permission prompt)",
  "`/chime sent <name|none>`: pick the sound for your own Enter",
].join('\n')

/** What bare `/chime` says: on or off, both sounds shown, and the names to pick from. */
export const describeChime = (c: ArsenalChime, shownName: string, sentName: string, names: readonly string[]) =>
  [
    `Sound notifications are **${c.isOn ? 'on' : 'off'}**.`,
    `Sound: ${shownName || 'none found'}`,
    `Sent: ${sentName || 'none'}`,
    names.length ? `Sounds: ${names.join(', ')}` : 'No sounds found.',
    '',
    CHIME_HELP,
  ].join('\n')
