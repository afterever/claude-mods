// Which prompts count as a task. One typed request is one task: a prompt the
// person typed (or sent from the phone, or a mod sent as their own words)
// that goes on to finish with an answer. Pure; register.tsx wires it to events.

export type Origin = { kind: string; asUser?: boolean | undefined }

/** `/compact`, `/work-report week`: a slash command, as against a path that happens to start with one. */
export function isSlashCommand(text: string): boolean {
  const first = text.trimStart().split(/\s+/)[0] ?? ''
  return /^\/[A-Za-z][\w:.-]*$/.test(first)
}

/**
 * Whether a submitted prompt is the person's own request. Their Enter at the
 * prompt and a message from the phone count. A mod's prompt counts only when
 * it sent the words as the person's own (an upgraded prompt they approved).
 * Background notifications, schedules, other sessions, helper agents and
 * `claude -p` runs are not requests anyone typed.
 */
export function isTypedPrompt(text: string, origin: Origin): boolean {
  if (text.trim() === '') return false
  if (isSlashCommand(text)) return false
  if (origin.kind === 'composer' || origin.kind === 'bridge') return true
  return origin.kind === 'plugin' && origin.asUser === true
}

// A typed prompt is "armed" when it is submitted and claimed when a turn
// starts with those words, so a turn nobody typed is never counted.

const LIMIT = 20

const same = (a: string, b: string) => a.trim() === b.trim()

export function arm(queue: readonly string[], text: string): string[] {
  return [...queue, text].slice(-LIMIT)
}

export function disarm(queue: readonly string[], text: string): string[] {
  const at = queue.findIndex(q => same(q, text))
  return at < 0 ? [...queue] : [...queue.slice(0, at), ...queue.slice(at + 1)]
}

/**
 * Takes the armed prompt a turn started with off the queue. The words match
 * exactly, or, where something added to them on the way in (a settings hook's
 * note), when one holds the other and is long enough not to be a coincidence.
 */
export function claim(queue: readonly string[], turnText: string): { found: boolean; queue: string[] } {
  const exact = queue.findIndex(q => same(q, turnText))
  const near = exact >= 0 ? exact : queue.findIndex(q => {
    const a = q.trim()
    const b = turnText.trim()
    const [short, long] = a.length <= b.length ? [a, b] : [b, a]
    return short.length >= 8 && long.includes(short)
  })
  if (near < 0) return { found: false, queue: [...queue] }
  return { found: true, queue: [...queue.slice(0, near), ...queue.slice(near + 1)] }
}
