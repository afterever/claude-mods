import type { ClientModule } from 'claude-code'

// Tide: the bar's motion, one Client region of a fixed width, so the band's
// layout never moves under it. It runs on the surface's frame clock; the hooks
// never run per frame. It imports nothing from the mod (a Client module stands
// alone): the hooks hand it every colour already mixed.
//
// - the foam at the water's edge laps (`lap`), and at `full` a brighter `~` drifts along the water
// - `breathe`: the cells at `at` cycle `colors` (auto-compact is near)
// - `growth`: one-shot, the cells a turn added shimmer through `colors` for 1.5 s
// - `sweep`: one-shot, a wave runs from the old edge back to the new one over 1.2 s
//
// A one-shot plays once per `id`: a redraw with the same id does not start it again.

/** One cell of the bar; `scope` is the category it draws, for hover. */
export type Cell = { ch: string; color: string; bg?: string; dim?: boolean; scope: string }

export type TideProps = {
  cells: Cell[]
  level: 'subtle' | 'full'
  /** The water's edge (the foam), or -1. */
  edge: number
  /** The foam's two colours, core then glow. */
  lap?: string[]
  /** The drifting `~`'s colour, at `full` only. */
  drift?: string
  breathe?: { at: number[]; colors: string[] }
  /** Cells `from` to `to - 1`. */
  growth?: { id: number; from: number; to: number; colors: string[] }
  /** The crest runs from `to - 1` down to `from`: the old shore before it, water behind. */
  sweep?: { id: number; from: number; to: number; shore: string; water: string; foam: string }
}

type TideState = { frame: number; growthId?: number; growthAt?: number; sweepId?: number; sweepAt?: number }

// In frames of 100 ms
const FRAME_MS = 100
const LAP = 10
const DRIFT = 6
const GROWTH = 15
const SWEEP = 12

/** The bar at `frame`; `starts` holds the frame each one-shot began at. */
export function frameAt(props: TideProps, frame: number, starts: { growth?: number; sweep?: number }): Cell[] {
  const cells = props.cells.map(c => ({ ...c }))
  const { edge } = props
  if (edge >= 0 && edge < cells.length) {
    if (props.lap && props.lap.length > 0) {
      const half = Math.floor(frame / (LAP / 2)) % 2
      cells[edge] = { ...cells[edge]!, ch: half === 0 ? '≈' : '~', color: props.lap[half % props.lap.length]!, dim: false }
    }
    if (props.level === 'full' && props.drift) {
      const water = cells.map((c, i) => (i > edge && c.ch === '~' ? i : -1)).filter(i => i >= 0)
      const at = water[Math.floor(frame / DRIFT) % Math.max(1, water.length)]
      if (at !== undefined) cells[at] = { ...cells[at]!, color: props.drift, dim: false }
    }
  }
  if (props.breathe && props.breathe.colors.length > 0) {
    const color = props.breathe.colors[frame % props.breathe.colors.length]!
    for (const i of props.breathe.at) if (cells[i]) cells[i] = { ...cells[i]!, color, dim: false }
  }
  const g = props.growth
  if (g && starts.growth !== undefined && frame >= starts.growth && frame - starts.growth < GROWTH && g.colors.length > 0) {
    for (let i = Math.max(0, g.from); i < Math.min(cells.length, g.to); i++) {
      cells[i] = { ...cells[i]!, color: g.colors[(i + frame) % g.colors.length]!, dim: false }
    }
  }
  const s = props.sweep
  if (s && starts.sweep !== undefined && frame >= starts.sweep && frame - starts.sweep < SWEEP && s.to > s.from) {
    const crest = Math.max(s.from, s.to - 1 - Math.round(((frame - starts.sweep) / SWEEP) * (s.to - s.from)))
    for (let i = s.from; i < Math.min(cells.length, s.to); i++) {
      const c = cells[i]!
      cells[i] =
        i < crest
          ? { ...c, ch: '█', color: s.shore, dim: false, bg: undefined }
          : i === crest
            ? { ...c, ch: '≈', color: s.foam, dim: false, bg: undefined }
            : { ...c, ch: '~', color: s.water, dim: true, bg: undefined }
    }
  }
  return cells
}

const moves = (p: TideProps) => Boolean(p.lap || p.breathe || p.growth || p.sweep || (p.level === 'full' && p.drift))

const Tide: ClientModule<TideProps, TideState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const st = surface.state

  if (st === undefined) {
    const first: TideState = { frame: 0 }
    if (props.growth) Object.assign(first, { growthId: props.growth.id, growthAt: 0 })
    if (props.sweep) Object.assign(first, { sweepId: props.sweep.id, sweepAt: 0 })
    surface.setState(first)
    if (moves(props)) {
      surface.every(FRAME_MS, () => {
        const now = surface.state ?? { frame: 0 }
        surface.setState({ ...now, frame: now.frame + 1 })
      })
    }
  } else if ((props.growth && props.growth.id !== st.growthId) || (props.sweep && props.sweep.id !== st.sweepId)) {
    // a new event: it starts at this frame, once
    surface.setState({
      ...st,
      ...(props.growth && props.growth.id !== st.growthId ? { growthId: props.growth.id, growthAt: st.frame } : {}),
      ...(props.sweep && props.sweep.id !== st.sweepId ? { sweepId: props.sweep.id, sweepAt: st.frame } : {}),
    })
  }

  const now = surface.state ?? { frame: 0 }
  const cells = frameAt(props, now.frame, { growth: now.growthAt, sweep: now.sweepAt })
  const runs: Cell[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.color === c.color && last.bg === c.bg && Boolean(last.dim) === Boolean(c.dim) && last.scope === c.scope) last.ch += c.ch
    else runs.push({ ...c })
  }
  return (
    <Box flexDirection="row" flexShrink={0}>
      {runs.map((r, i) => (
        <Text
          key={`t${i}`}
          color={r.color}
          {...(r.bg ? { backgroundColor: r.bg } : {})}
          {...(r.dim ? { dimColor: true } : {})}
          hover={{ scope: 'ctx:' + r.scope, inverse: true }}
        >
          {r.ch}
        </Text>
      ))}
    </Box>
  )
}

export default Tide
