// The person's own skills and commands: how a file becomes a row, and where
// the project is. Only text in, text out: the reading of folders and the git
// calls are register.tsx's, so all of this is tested without the engine.

import type { ArsenalOff, OwnCommand } from '../types'

// ── Frontmatter ──────────────────────────────────────────────────────────

const unquote = (value: string) => {
  const first = value.charAt(0)
  return value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first) ? value.slice(1, -1) : value
}

/**
 * The `key: value` lines between a leading `---` and the next one, the value
 * with its surrounding quotes taken off. A line that is indented (the rest of
 * a multi-line value) or has no key is ignored; no block, or one never closed,
 * is no keys at all.
 */
export function parseFrontmatter(text: string): Record<string, string> {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return {}
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end < 0) return {}
  const keys: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z][\w-]*):(.*)$/.exec(line)
    if (match) keys[match[1] ?? ''] = unquote((match[2] ?? '').trim())
  }
  return keys
}

// ── Naming and classification ────────────────────────────────────────────

/** A file in `skills/<folder>/SKILL.md` or `commands/<file>.md`, as read. */
export type Candidate = {
  kind: 'skill' | 'command'
  /** The folder's name for a skill, the file's name without `.md` for a command. */
  fallback: string
  text: string
}

/** What a file says about itself; the engine says whether it is really there. */
export type Found = { name: string; takesArgs: boolean }

/**
 * A skill is named by its frontmatter `name`, else its folder; a command by
 * its file. `user-invocable: false` is no command for the person, so null.
 */
export function readCandidate(c: Candidate): Found | null {
  const keys = parseFrontmatter(c.text)
  if ((keys['user-invocable'] ?? '').toLowerCase() === 'false') return null
  const name = c.kind === 'skill' ? keys.name || c.fallback : c.fallback
  return { name, takesArgs: (keys['argument-hint'] ?? '') !== '' }
}

// ── Confirming against the engine ────────────────────────────────────────

/** What `$.command.list()` gives for each command that matters here. */
export type Listed = { name: string; description: string; source: string }

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * The rows for what a folder scan found: only the names the engine lists as
 * the person's own (`source: 'user'`; a plugin's skill of the same name is
 * not), with the description it gives. The synced claude.ai skills are `user`
 * too, which is why the folders decide first and the engine confirms after.
 * A skill and a command of one name make one row; either may take arguments.
 */
export function confirmed(found: readonly Found[], list: readonly Listed[]): OwnCommand[] {
  const own = new Map<string, string>()
  for (const c of list) if (c.source === 'user' && !own.has(c.name)) own.set(c.name, oneLine(c.description))
  const rows = new Map<string, OwnCommand>()
  for (const f of found) {
    const description = own.get(f.name)
    if (description === undefined) continue
    rows.set(f.name, { name: f.name, description, takesArgs: (rows.get(f.name)?.takesArgs ?? false) || f.takesArgs })
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The project's rows without the names USER has. The global one is the one
 * `/name` runs (checked), so such a name is drawn once, under USER.
 */
export function withoutUser(project: readonly OwnCommand[], user: readonly OwnCommand[]): OwnCommand[] {
  const taken = new Set(user.map(c => c.name))
  return project.filter(c => !taken.has(c.name))
}

// ── What is saved ────────────────────────────────────────────────────────

/** `$.store` key `off` holds this: names turned off, never on, so new commands show by themselves. */
export const STORE_KEY = 'off'

const names = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v !== ''))].sort() : []

/**
 * What `$.store.get('off')` gave, read back. Anything unexpected (unset, an
 * older or hand-edited file) is an empty list for that part, never an error.
 */
export function offFromStore(raw: unknown): ArsenalOff {
  const held = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const project: Record<string, string[]> = {}
  if (held.project && typeof held.project === 'object' && !Array.isArray(held.project)) {
    for (const [key, list] of Object.entries(held.project)) {
      const kept = names(list)
      if (kept.length) project[key] = kept
    }
  }
  return { user: names(held.user), project }
}

/** The value to save for `off`. */
export const offToStore = (off: ArsenalOff) => ({ version: 1, user: off.user, project: off.project })

// ── Where the project is ─────────────────────────────────────────────────

/**
 * Slashes `/`, no trailing slash, and the case folded on a drive path: the
 * form two spellings of one folder share. A POSIX path keeps its case.
 */
export function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:/.test(slashed) ? slashed.toLowerCase() : slashed
}

export const sameFolder = (a: string, b: string) => normalizePath(a) === normalizePath(b)

const isAbsolute = (path: string) => /^([A-Za-z]:|\/|\\\\)/.test(path)

/** `path` against `base`, with the `.` and `..` steps taken. */
function resolveFrom(base: string, path: string): string {
  if (isAbsolute(path)) return path
  const parts = base.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  for (const step of path.replace(/\\/g, '/').split('/')) {
    if (step === '..') {
      if (parts.length > 1) parts.pop()
    } else if (step !== '.' && step !== '') {
      parts.push(step)
    }
  }
  return parts.join('/')
}

/** What the two `git rev-parse` calls printed; null where git did not answer. */
export type GitAnswers = { top: string | null; common: string | null }

/**
 * The folder to scan for PROJECT and the key of its off list. In a repo they
 * are this checkout's top level and the repo's shared `.git` folder, so a
 * worktree or a subfolder of one repo keeps one off list. A relative `.git`
 * (a git older than the `--path-format` flag) is read against the folder git
 * ran in, `root`. Outside git, `root` is both.
 */
export function projectPlace(root: string, git: GitAnswers): { folder: string; key: string } {
  if (!git.top || !git.common) return { folder: root, key: normalizePath(root) }
  return { folder: git.top, key: normalizePath(resolveFrom(root, git.common)) }
}
