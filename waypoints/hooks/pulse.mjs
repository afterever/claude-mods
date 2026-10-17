// The terminal's animations, one `Client` region each, all a fixed width so the band's
// layout never moves under them. Each runs on the surface's frame clock; the hooks never
// run per frame. A new key (a new task, a new finish) is a new instance with its own clock.
//
// - spin:  the running task's spinner, cycling `frames` every `ms`, with `colors` alongside
// - node:  the pulsing node at the start of a running leg: it cycles `colors`, and with
//          `breathe` also swells ◉ → ◎ → ◉
// - sweep: the finish, played once: the sparkle `colors` run along the route (`chars`), then
//          it rests on the solid route in the `done` colours (one per char)

const NODE_MS = 120
const SWEEP_MS = 60
const SWEEP_FRAMES = 25 // 1.5 s
const TAIL = 4 // cells the sparkle trails behind the head

export default function Pulse(props, surface) {
  const { Text } = surface.elements

  if (surface.state === undefined) {
    let frame = 0
    const ms = props.kind === 'spin' ? props.ms : props.kind === 'node' ? NODE_MS : SWEEP_MS
    const stop = surface.every(ms, () => {
      frame += 1
      // the sweep plays once, then rests
      if (props.kind === 'sweep' && frame >= SWEEP_FRAMES) stop()
      surface.setState({ frame })
    })
  }

  const frame = surface.state ? surface.state.frame : 0

  if (props.kind === 'spin') {
    return Text({ color: props.colors[frame % props.colors.length], children: [props.frames[frame % props.frames.length] || ' '] })
  }

  if (props.kind === 'node') {
    const glyph = props.breathe && Math.floor(frame / 3) % 2 === 1 ? '◎' : '◉'
    return Text({ color: props.colors[frame % props.colors.length], children: [glyph] })
  }

  // sweep: the head runs from the start to past the end; behind it the sparkle, ahead of it the route
  const chars = [...props.chars]
  const head = Math.round((frame / SWEEP_FRAMES) * (chars.length + TAIL))
  const n = props.colors.length
  const cells = chars.map((ch, i) => ({ ch, color: frame < SWEEP_FRAMES && i <= head && i > head - TAIL ? props.colors[(i + frame) % n] : props.done[i] }))
  const runs = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.color === c.color) last.text += c.ch
    else runs.push({ text: c.ch, color: c.color })
  }
  return Text({ children: runs.map((r) => Text({ color: r.color, children: [r.text] })) })
}
