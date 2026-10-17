import type { ClientModule } from 'claude-code'

import type { Level } from './palette'

// The terminal crab: 6 cells wide, 2 rows tall. Each cell holds two pixels, top and bottom, so the
// sprite is 6x4 pixels drawn in half blocks. Every crab goes through this one Client, a still one
// included: it starts no timer. See DESIGN.md, "The sprite".

export type CrabProps = {
  costume: string
  /** The costume's colour (`COSTUME_COLOR`), for the hat pixels marked `a`. */
  accent: string
  running: boolean
  /** Finished, failed and planned crabs are drawn dim. */
  dim?: boolean
  level: Level
}

type State = { frame: number }

export type Cell = { ch: ' ' | '▀' | '▄' | '█'; fg?: string; bg?: string }

const FRAME_MS = 250

// b body, c claw, l leg (all the brand clay), e eye, w white, h brown, y yellow, k grey, a the accent.
const COLORS: Record<string, string> = {
  b: '#D97757',
  c: '#D97757',
  l: '#D97757',
  e: '#1F1E1D',
  w: '#F4F3EE',
  h: '#7A4A26',
  y: '#F5C542',
  k: '#55514C',
}

const NO_HAT = '......'

// Pixel row 0, by costume.
const HAT: Record<string, string> = {
  astronaut: '.waaw.',
  detective: '.hhhh.',
  engineer: '.yyyy.',
  chef: 'wwwwww',
  racer: '.aaaa.',
  pirate: '.kwwk.',
  other: NO_HAT,
}

const put = (g: string[][], row: number, col: number, key: string): void => {
  const r = g[row]
  if (r) r[col] = key
}

// The prop is one pixel that moves with the frame (the astronaut's star blinks instead).
const PROP: Record<string, (frame: number, g: string[][]) => void> = {
  astronaut: (f, g) => {
    if (f % 2 === 0) put(g, 0, 5, 'y')
  },
  detective: (f, g) => put(g, f % 2, 5, 'k'),
  engineer: (f, g) => put(g, f % 2, 0, 'k'),
  chef: (f, g) => put(g, f % 2, 5, 'y'),
  racer: (f, g) => put(g, f % 2, 5, f % 2 ? 'w' : 'k'),
  pirate: (f, g) => put(g, f % 2, 5, 'k'),
}

/**
 * The four pixel rows of a crab, `.` for nothing. `off` holds still on frame 0; `subtle` walks the
 * legs and holds the prop at its first position; `full` moves both.
 */
export const spriteOf = (costume: string, frame: number, level: Level): string[] => {
  const legs = level === 'off' ? 0 : frame
  const prop = level === 'full' ? frame : 0
  const g = [HAT[costume] ?? NO_HAT, 'cebbec', '.bbbb.', legs % 2 ? '..ll..' : '.l..l.'].map(row => [...row])
  PROP[costume]?.(prop, g)
  return g.map(row => row.join(''))
}

/** The sprite as 2 rows of 6 terminal cells: `▀` carries the top pixel, a background the bottom one. */
export const cellsOf = (costume: string, accent: string, frame: number, level: Level): Cell[][] => {
  const sprite = spriteOf(costume, frame, level)
  const colorAt = (x: number, y: number): string | undefined => {
    const key = sprite[y]?.[x]
    return key === undefined || key === '.' ? undefined : key === 'a' ? accent : COLORS[key]
  }
  return [0, 1].map(r =>
    Array.from({ length: 6 }, (_, x): Cell => {
      const top = colorAt(x, r * 2)
      const bottom = colorAt(x, r * 2 + 1)
      if (top && bottom) return top === bottom ? { ch: '█', fg: top } : { ch: '▀', fg: top, bg: bottom }
      if (top) return { ch: '▀', fg: top }
      if (bottom) return { ch: '▄', fg: bottom }
      return { ch: ' ' }
    }),
  )
}

const Crab: ClientModule<CrabProps, State> = (props, surface) => {
  const { Text, Box } = surface.elements
  const isMoving = props.running && props.level !== 'off'

  // Started once, while there is no state yet. A crab that stops running is a new instance (its key
  // names the mode), and a still one draws frame 0 whatever its state says.
  if (surface.state === undefined && isMoving) {
    let frame = 0
    surface.every(FRAME_MS, () => {
      frame += 1
      surface.setState({ frame })
    })
  }

  const frame = isMoving ? (surface.state?.frame ?? 0) : 0

  return (
    <Box flexDirection="column">
      {cellsOf(props.costume, props.accent, frame, props.level).map((row, r) => (
        <Text key={r}>
          {row.map((c, x) => (
            <Text key={x} color={c.fg} backgroundColor={c.bg} dimColor={props.dim}>
              {c.ch}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export default Crab
