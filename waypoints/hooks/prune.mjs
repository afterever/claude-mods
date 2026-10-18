// The data folder's upkeep: which chats' files the pane lists, when it says the folder has
// grown, and how the folder is named to the person. Pure, so the rules are tested without
// the engine.

export const OTHERS_MS = 3600000 // other chats' goals shown in /waypoints
export const NOTE_AT = 100 // past this many files the pane names the folder

// The folder as the person's system writes it, ending in a separator: a Windows home
// (with a `\`) turns every `/` into `\`
export function shownPath(path) {
  const p = String(path || '')
  return p.includes('\\') ? p.replace(/\//g, '\\') + '\\' : p + '/'
}
