import type { ClientModule } from 'claude-code'

/**
 * The terminal's animations, one `Client` region each, all a fixed width so
 * the box's layout never moves under them:
 *
 * - `spin`: the status glyph, cycling `frames` every `ms`
 * - `shimmer`: `text` with a band of light sweeping across it
 * - `sparkle`: a short burst of stars after a turn ends, then nothing
 *
 * Each runs on the surface's frame clock; the hooks never run per frame. A
 * new phase or a new beat is a new `key`, so a new instance with its own
 * clock.
 */
export type PulseProps =
  | { kind: 'spin'; frames: string[]; ms: number; color: string }
  | { kind: 'shimmer'; text: string; colors: string[]; ms: number }
  | { kind: 'sparkle'; colors: string[] }

type PulseState = { frame: number }

const SPARKLE_FRAMES = ['  ✦ ', ' ✧ ✦', '✦ ✧ ', ' ⋆ ✧', '  · ', '    '] as const
const SPARKLE_MS = 260

const Pulse: ClientModule<PulseProps, PulseState> = (props, surface) => {
  const { Text } = surface.elements

  if (surface.state === undefined) {
    let frame = 0
    const ms = props.kind === 'sparkle' ? SPARKLE_MS : props.ms

    const stop = surface.every(ms, () => {
      frame += 1

      // The sparkle plays once, then rests on its blank last frame.
      if (props.kind === 'sparkle' && frame >= SPARKLE_FRAMES.length - 1) {
        stop()
      }

      surface.setState({ frame })
    })
  }

  const frame = surface.state?.frame ?? 0

  switch (props.kind) {
    case 'spin':
      return <Text color={props.color}>{props.frames[frame % props.frames.length] ?? ' '}</Text>
    case 'shimmer': {
      const n = props.colors.length

      return (
        <Text bold>
          {[...props.text].map((char, i) => (
            <Text color={props.colors[(((i - frame) % n) + n) % n]}>{char}</Text>
          ))}
        </Text>
      )
    }
    case 'sparkle': {
      const cells = SPARKLE_FRAMES[Math.min(frame, SPARKLE_FRAMES.length - 1)] ?? '    '
      const n = props.colors.length

      return (
        <Text>
          {[...cells].map((char, i) => (
            <Text color={props.colors[(i + frame) % n]}>{char}</Text>
          ))}
        </Text>
      )
    }
  }
}

export default Pulse
