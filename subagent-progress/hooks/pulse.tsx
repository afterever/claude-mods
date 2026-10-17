import type { ClientModule } from 'claude-code'

// The terminal's other animations, one Client region each and all a fixed width, so the band's layout
// never moves under them. Each runs on the surface's frame clock; the hooks never run per frame.
//
// - spin:  a cell cycling `frames` every `ms`, with `colors` alongside (one frame and one colour hold still)
// - sweep: the finish, played once: the sparkle `colors` run along the bar's `chars`, then it rests on the
//          solid bar in the `done` colours (one per char)

export type PulseProps =
  | { kind: 'spin'; frames: string[]; ms: number; colors: string[] }
  | { kind: 'sweep'; chars: string[]; done: string[]; colors: string[] }

type PulseState = { frame: number }

const SWEEP_MS = 60
const SWEEP_FRAMES = 25 // 1.5 s
const TAIL = 4 // cells the sparkle trails behind the head

const Pulse: ClientModule<PulseProps, PulseState> = (props, surface) => {
  const { Text } = surface.elements

  if (surface.state === undefined) {
    const isStill = props.kind === 'spin' && props.frames.length <= 1 && props.colors.length <= 1

    if (!isStill) {
      let frame = 0
      const stop = surface.every(props.kind === 'spin' ? props.ms : SWEEP_MS, () => {
        frame += 1

        // The sweep plays once, then rests.
        if (props.kind === 'sweep' && frame >= SWEEP_FRAMES) {
          stop()
        }

        surface.setState({ frame })
      })
    }
  }

  const frame = surface.state?.frame ?? 0

  if (props.kind === 'spin') {
    return <Text color={props.colors[frame % props.colors.length]}>{props.frames[frame % props.frames.length] ?? ' '}</Text>
  }

  // The head runs from the start to past the end; behind it the sparkle, ahead of it the solid bar.
  const head = Math.round((frame / SWEEP_FRAMES) * (props.chars.length + TAIL))
  const n = props.colors.length
  const runs: { text: string; color: string | undefined }[] = []

  props.chars.forEach((ch, i) => {
    const isLit = frame < SWEEP_FRAMES && i <= head && i > head - TAIL
    const color = isLit ? props.colors[(i + frame) % n] : props.done[i]
    const last = runs[runs.length - 1]

    if (last && last.color === color) {
      last.text += ch
    } else {
      runs.push({ text: ch, color })
    }
  })

  return (
    <Text>
      {runs.map((r, i) => (
        <Text key={`s${i}`} color={r.color}>
          {r.text}
        </Text>
      ))}
    </Text>
  )
}

export default Pulse
