// The data folder's upkeep: which chats' files the pane lists, when it says the folder has
// grown, what /waypoints prune deletes and the delete it runs, and how the folder is named
// to the person. Pure, so the rules are tested without the engine.

export const OTHERS_MS = 3600000 // other chats' goals shown in /waypoints
export const NOTE_AT = 100 // past this many files the pane names the folder

export const DEAD_MS = 24 * 3600000 // restore() never loads a file this old again
export const PRUNE_MAX = 200 // files one /waypoints prune deletes at most

// The file names /waypoints prune deletes, oldest first. items: { name, mtimeMs, goal },
// goal null for a file that did not parse. Never this chat's file; never a running goal
// touched within DEAD_MS. A file that did not parse is kept for OTHERS_MS, as another chat
// may be writing it right now.
export function pickPrunable(items, { now, self }) {
  const old = (ms) => now - (ms || 0) > OTHERS_MS
  return items
    .filter((it) => {
      if (it.name === self) return false
      if (now - (it.mtimeMs || 0) > DEAD_MS) return true
      if (!it.goal) return old(it.mtimeMs)
      return it.goal.status !== 'running' && old(it.goal.endedAt || it.mtimeMs)
    })
    .sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0))
    .slice(0, PRUNE_MAX)
    .map((it) => it.name)
}

// What cmd would read as syntax rather than as a path
const CMD_META = /[&|<>^%!"]/

// The host's delete as an argv, no shell: each path is its own argument. On Windows `del`
// lives in cmd, which parses the line again, so a path holding a cmd metacharacter deletes
// nothing (null) and the person is sent to the folder instead.
export function deleteArgv(win, paths) {
  if (!win) return ['rm', '-f', '--', ...paths]
  if (paths.some((p) => CMD_META.test(p))) return null
  return ['cmd', '/d', '/c', 'del', '/f', '/q', ...paths.map((p) => p.replace(/\//g, '\\'))]
}

// The folder as the person's system writes it, ending in a separator: a Windows home
// (with a `\`) turns every `/` into `\`
export function shownPath(path) {
  const p = String(path || '')
  return p.includes('\\') ? p.replace(/\//g, '\\') + '\\' : p + '/'
}
