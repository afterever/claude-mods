// What the pane needs that is only arithmetic: cell widths, the tracker, the
// big numbers, and the choices that depend on how much room there is. Nothing
// here sets a width on the screen: the surface lays rows out in the room it
// has, and these only pick between a roomy shape and a tight one.

export type Tone = 'text' | 'muted' | 'hair' | 'gold' | 'green' | 'amber' | 'dark'
export type Seg = { t: string; tone?: Tone; bold?: boolean; bg?: Tone }
export type Line = Seg[]

export const COLORS: Record<Tone, string> = {
  text: '#E6EDF3',
  muted: '#7D8590',
  hair: '#262B33',
  gold: '#F2C46D',
  green: '#3DD68C',
  amber: '#E3B341',
  dark: '#0D1117',
}

export const TITLE = 'PROMPT UPGRADE'

// ── Widths ───────────────────────────────────────────────────────────────

function isWide(c: number): boolean {
  return (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1f64f) ||
    (c >= 0x1f900 && c <= 0x1f9ff) ||
    (c >= 0x20000 && c <= 0x3fffd)
  )
}

/** Terminal cells one character takes: 2 for wide characters, 0 for marks, else 1. */
export function cellWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (c < 32 || (c >= 0x7f && c < 0xa0)) return 0
  if ((c >= 0x300 && c <= 0x36f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) return 0
  return isWide(c) ? 2 : 1
}

export function strWidth(s: string): number {
  let w = 0
  for (const ch of s) w += cellWidth(ch)
  return w
}

export function lineWidth(line: Line): number {
  return line.reduce((n, s) => n + strWidth(s.t), 0)
}

/** The text cut to `width` cells, an ellipsis where it was cut. */
export function clip(s: string, width: number): string {
  if (width <= 0) return ''
  if (strWidth(s) <= width) return s
  let out = ''
  let w = 0
  for (const ch of s) {
    const cw = cellWidth(ch)
    if (w + cw > width - 1) break
    out += ch
    w += cw
  }
  return out + '…'
}

// ── Tracker ──────────────────────────────────────────────────────────────

const STEPS: readonly [string, string][] = [
  ['Your prompt', 'Prompt'],
  ['Questions', 'Ask'],
  ['Rewrite', 'Write'],
  ['Review', 'Review'],
]

/**
 * The four steps: finished ones a green check, the current one gold, the rest
 * muted. Words are shortened, then dropped from the steps that are not current,
 * to fit `width` when it is that narrow.
 */
export function trackerRow(width: number, current: number): Line {
  const build = (short: boolean, sep: string, onlyCurrent: boolean): Line => {
    const line: Line = []
    STEPS.forEach(([long, brief], i) => {
      if (i > 0) line.push({ t: sep, tone: 'hair' })
      const done = i < current
      const mark = done ? '✓' : String(i + 1)
      const tone: Tone = done ? 'green' : i === current ? 'gold' : 'muted'
      const label = onlyCurrent && i !== current ? '' : ' ' + (short ? brief : long)
      line.push({ t: mark + label, tone, bold: i === current })
    })
    return line
  }
  for (const [short, sep, only] of [
    [false, ' ─ ', false],
    [true, ' ─ ', false],
    [true, ' ', false],
    [true, ' ', true],
  ] as const) {
    const line = build(short, sep, only)
    if (lineWidth(line) <= width) return line
  }
  return build(true, ' ', true)
}

// ── Big numbers in tiles ─────────────────────────────────────────────────

const NB = ' '

// Only the common heavy box-drawing characters: the half-line ones (╺ ╸ ╻ ╹)
// are missing from many fonts, and the substitute font drew the tiles out of
// line. Gaps are non-breaking spaces so a surface cannot collapse them.
const DIGITS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', `┃${NB}┃`, '┗━┛'],
  '1': [`┏┓${NB}`, `${NB}┃${NB}`, '┗┻┛'],
  '2': ['━━┓', '┏━┛', '┗━━'],
  '3': ['━━┓', `${NB}━┫`, '━━┛'],
  '4': [`┃${NB}┃`, '┗━┫', `${NB}${NB}┃`],
  '5': ['┏━━', '┗━┓', '━━┛'],
  '6': ['┏━━', '┣━┓', '┗━┛'],
  '7': ['━━┓', `${NB}${NB}┃`, `${NB}${NB}┃`],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '━━┛'],
}

/** A number three rows tall in heavy box-drawing characters, one cell between digits. */
export function bigNumber(n: number): [string, string, string] {
  const digits = String(Math.max(0, Math.min(99999, Math.floor(Number.isFinite(n) ? n : 0)))).split('')
  const rows: [string, string, string] = ['', '', '']
  digits.forEach((d, i) => {
    const glyph = DIGITS[d] ?? DIGITS['0']!
    for (let r = 0; r < 3; r++) rows[r] += (i > 0 ? NB : '') + glyph[r]
  })
  return rows
}

export type StatsTile = { digits: [string, string, string]; tone: Tone; caption: string }

export type StatsPlan =
  /** Three framed tiles side by side: the surface gives each a third of the row. */
  | { kind: 'tiles'; tiles: StatsTile[] }
  /** Too narrow for tiles: one plain line. */
  | { kind: 'line'; line: Line }

/**
 * The review's line of numbers: words before, words after, details added.
 * `width` is the room the pane reports, used only to choose a shape: tiles
 * when a third of it holds the biggest number inside its frame, else a line.
 */
export function statsPlan(width: number, before: number, after: number, added: number): StatsPlan {
  const digits = [before, after, added].map(bigNumber)
  const dw = Math.max(...digits.map(d => strWidth(d[0])))
  // a third of the row less the two cells a frame takes
  const inner = Math.floor((width - 2) / 3) - 2
  if (inner >= dw && inner >= 6) {
    const captions = inner >= 13 ? ['words before', 'words after', 'details added'] : ['before', 'after', 'added']
    const tones: Tone[] = ['text', 'gold', 'green']
    return { kind: 'tiles', tiles: digits.map((d, i) => ({ digits: d, tone: tones[i]!, caption: captions[i]! })) }
  }
  const line: Line = [
    { t: 'words ', tone: 'muted' },
    { t: String(before), bold: true },
    { t: ' → ', tone: 'muted' },
    { t: String(after), tone: 'gold', bold: true },
    { t: '  ·  ', tone: 'hair' },
    { t: String(added), tone: 'green', bold: true },
    { t: ' details added', tone: 'muted' },
  ]
  return { kind: 'line', line }
}

// ── Cards ────────────────────────────────────────────────────────────────

/** A text cut at `max` characters with a count of what is left, so a card stays a card. */
export function cutText(text: string, max = 4000): string {
  const chars = [...text]
  if (chars.length <= max) return text
  return chars.slice(0, max).join('').trimEnd() + `\n… ${chars.length - max} more characters`
}

/** Two cards side by side from this width, stacked under it. */
export function stacksCards(width: number, sideBySideFrom = 60): boolean {
  return width < sideBySideFrom
}
