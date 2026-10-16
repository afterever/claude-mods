import type { ActivityPhase } from '../types'
import type { Level } from './palette'
import { mix } from './palette'

/**
 * SVG for the desktop: the jellyfish, the timeline strip and the history's
 * duration bars. Each is a whole document for `Svg`'s `source`, animated by
 * CSS in its own `<style>`, so the browser runs the loop and the mod draws
 * only when the state changes.
 *
 * A source that changes restarts its animations, so nothing here carries the
 * time: a one-shot (the halo, the sparkle) carries its beat's id instead.
 */

const REDUCED = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}'

/** How the jellyfish moves in each phase, as CSS durations in seconds. */
type Gait = { bob: number; pulse: number; swing: number }

const GAITS: Record<ActivityPhase, Gait> = {
  idle: { bob: 4.2, pulse: 0, swing: 3.6 },
  requesting: { bob: 1.6, pulse: 2.2, swing: 1.8 },
  thinking: { bob: 3, pulse: 2.4, swing: 2.6 },
  writing: { bob: 2, pulse: 1.4, swing: 1.4 },
  composing: { bob: 1.8, pulse: 1.2, swing: 0.45 },
  tool: { bob: 1.4, pulse: 0.9, swing: 0.9 },
  agent: { bob: 1.4, pulse: 0.9, swing: 0.9 },
  approval: { bob: 2.4, pulse: 2, swing: 2 },
  question: { bob: 2.4, pulse: 2, swing: 2 },
  compacting: { bob: 3, pulse: 0, swing: 1.6 },
}

export type JellyArgs = {
  phase: ActivityPhase
  level: Level
  /** The phase's color, hex. */
  color: string
  /** A call that ended in this phase: its id and outcome color, hex. */
  halo: { id: number; color: string } | null
  /** A turn that just ended: its id. */
  sparkle: { id: number; color: string } | null
  size: number
}

/** The jellyfish acting out `phase`, as an SVG document. */
export function jellySvg(args: JellyArgs): string {
  const { phase, level, color, halo, sparkle, size } = args
  const gait = GAITS[phase]
  const isIdle = phase === 'idle'
  const isWaiting = phase === 'approval' || phase === 'question'
  const isFull = level === 'full'
  const light = mix(color, '#ffffff', 0.45)
  const deep = mix(color, '#000000', 0.25)

  const css: string[] = [
    '.body{transform-box:fill-box;transform-origin:50% 0}',
    '.bell{transform-box:fill-box;transform-origin:50% 100%}',
    '.tent{transform-box:fill-box;transform-origin:50% 0}',
    '.halo,.star{transform-box:fill-box;transform-origin:50% 50%}',
  ]

  if (level !== 'off') {
    css.push(
      `.body{animation:bob ${gait.bob}s ease-in-out infinite}`,
      '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}',
      `.tent{animation:swing ${gait.swing}s ease-in-out infinite}`,
      '.t2{animation-delay:-.3s}.t3{animation-delay:-.6s}.t4{animation-delay:-.9s}',
      '@keyframes swing{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}',
    )

    if (gait.pulse > 0) {
      css.push(
        `.bell{animation:pulse ${gait.pulse}s ease-in-out infinite}`,
        '@keyframes pulse{0%,100%{transform:scale(1,1)}35%{transform:scale(1.07,.9)}}',
      )
    }

    if (phase === 'compacting') {
      css.push(
        '.bell{animation:squish 1.6s ease-in-out infinite alternate}',
        '@keyframes squish{from{transform:scale(1,1)}to{transform:scale(1.16,.84)}}',
      )
    }

    css.push(
      `.glow{animation:breathe ${isWaiting ? 1.4 : 3.2}s ease-in-out infinite}`,
      `@keyframes breathe{0%,100%{opacity:${isIdle ? 0.15 : 0.3}}50%{opacity:${isWaiting ? 1 : isIdle ? 0.3 : 0.65}}}`,
      '.halo{animation:halo .8s ease-out 1 forwards}',
      '@keyframes halo{from{transform:scale(.55);opacity:1}to{transform:scale(1.5);opacity:0}}',
    )
  }

  if (isFull) {
    css.push(
      '.bub{animation:rise 2.4s ease-in infinite;opacity:0}.b2{animation-delay:-.8s}.b3{animation-delay:-1.6s}',
      '@keyframes rise{0%{transform:translateY(0);opacity:0}25%{opacity:.9}100%{transform:translateY(-12px);opacity:0}}',
      '.ink{animation:ink 1.2s ease-in-out infinite;opacity:0}.i2{animation-delay:.2s}.i3{animation-delay:.4s}',
      '@keyframes ink{0%,100%{opacity:0}50%{opacity:.9}}',
      '.z{animation:zz 3s ease-in-out infinite;opacity:0}',
      '@keyframes zz{0%{transform:translate(0,0);opacity:0}40%{opacity:.8}100%{transform:translate(3px,-8px);opacity:0}}',
      '.star{animation:twinkle 1.6s ease-in-out 1 forwards;opacity:0}.s2{animation-delay:.15s}.s3{animation-delay:.3s}.s4{animation-delay:.45s}',
      '@keyframes twinkle{0%{transform:scale(0) rotate(0);opacity:0}40%{transform:scale(1.2) rotate(60deg);opacity:1}100%{transform:scale(0) rotate(120deg);opacity:0}}',
    )
  }

  const eyes = isIdle
    ? '<path d="M18.6 18.4q1.4 1.1 2.8 0M26.6 18.4q1.4 1.1 2.8 0" stroke="#2b2b3a" stroke-width="1.1" fill="none" stroke-linecap="round"/>'
    : isWaiting
      ? '<circle cx="20" cy="18" r="2.3" fill="#2b2b3a"/><circle cx="28" cy="18" r="2.3" fill="#2b2b3a"/>'
        + '<circle cx="20.8" cy="17.2" r=".8" fill="#fff"/><circle cx="28.8" cy="17.2" r=".8" fill="#fff"/>'
      : `<circle cx="20" cy="${phase === 'requesting' ? 17.3 : 18}" r="1.6" fill="#2b2b3a"/>`
        + `<circle cx="28" cy="${phase === 'requesting' ? 17.3 : 18}" r="1.6" fill="#2b2b3a"/>`
        + '<circle cx="20.5" cy="17.4" r=".55" fill="#fff"/><circle cx="28.5" cy="17.4" r=".55" fill="#fff"/>'

  const extras: string[] = []

  if (isFull && phase === 'thinking') {
    extras.push(
      `<circle class="bub b1" cx="36" cy="14" r="1.4" fill="none" stroke="${light}" stroke-width=".8"/>`,
      `<circle class="bub b2" cx="39" cy="12" r="1" fill="none" stroke="${light}" stroke-width=".7"/>`,
      `<circle class="bub b3" cx="34" cy="10" r=".8" fill="none" stroke="${light}" stroke-width=".6"/>`,
    )
  }

  if (isFull && phase === 'writing') {
    extras.push(
      `<circle class="ink i1" cx="39" cy="31" r="1.1" fill="${color}"/>`,
      `<circle class="ink i2" cx="42" cy="34" r=".9" fill="${color}"/>`,
      `<circle class="ink i3" cx="45" cy="37" r=".7" fill="${color}"/>`,
    )
  }

  if (isFull && isIdle) {
    extras.push(`<text class="z" x="35" y="11" font-size="6" font-family="sans-serif" fill="${light}">z</text>`)
  }

  if (isWaiting) {
    extras.push(
      `<text x="37" y="11" font-size="9" font-weight="700" font-family="sans-serif" fill="${color}">${phase === 'approval' ? '!' : '?'}</text>`,
    )
  }

  if (halo && level !== 'off') {
    extras.push(`<circle class="halo" data-beat="${halo.id}" cx="24" cy="20" r="14" fill="none" stroke="${halo.color}" stroke-width="1.6"/>`)
  }

  if (sparkle && isFull) {
    const star = (x: number, y: number, n: number) =>
      `<path class="star s${n}" d="M${x} ${y - 3}L${x + 0.8} ${y - 0.8}L${x + 3} ${y}L${x + 0.8} ${y + 0.8}L${x} ${y + 3}L${x - 0.8} ${y + 0.8}L${x - 3} ${y}L${x - 0.8} ${y - 0.8}Z" fill="${sparkle.color}"/>`

    extras.push(`<g data-beat="${sparkle.id}">${star(8, 9, 1)}${star(40, 7, 2)}${star(42, 28, 3)}${star(6, 30, 4)}</g>`)
  }

  const tentacles = [14.5, 20, 28, 33.5]
    .map((x, i) => `<path class="tent t${i + 1}" d="M${x} 23q-2 5 0 9q2 4 0 8" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">`
    + `<style>${css.join('')}${REDUCED}</style>`
    + '<defs>'
    + `<radialGradient id="g" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="${color}" stop-opacity=".9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${color}"/></linearGradient>`
    + '</defs>'
    + `<circle class="glow" cx="24" cy="21" r="22" fill="url(#g)" opacity="${isIdle ? 0.15 : 0.45}"/>`
    + `<g${isIdle ? ' opacity=".6" transform="translate(0 2)"' : ''}><g class="body">`
    + tentacles
    + '<g class="bell">'
    + `<path d="M9.5 23C9.5 9.5 38.5 9.5 38.5 23Q35 26 31.5 23Q27.75 26 24 23Q20.25 26 16.5 23Q13 26 9.5 23Z" fill="url(#b)" stroke="${deep}" stroke-width=".7"/>`
    + '<ellipse cx="17.5" cy="14.5" rx="3" ry="1.8" fill="#fff" opacity=".45" transform="rotate(-20 17.5 14.5)"/>'
    + eyes
    + '<circle cx="16.6" cy="20.6" r="1.5" fill="#ff8fa3" opacity=".5"/><circle cx="31.4" cy="20.6" r="1.5" fill="#ff8fa3" opacity=".5"/>'
    + (isWaiting
      ? '<ellipse cx="24" cy="21" rx="1" ry="1.2" fill="#2b2b3a"/>'
      : '<path d="M22.6 20.6q1.4 1.2 2.8 0" stroke="#2b2b3a" stroke-width=".9" fill="none" stroke-linecap="round"/>')
    + '</g></g></g>'
    + extras.join('')
    + '</svg>'
}

/**
 * The turn's phases as one rounded strip of colored segments, each as wide
 * as its share of the turn, the running one breathing.
 */
export function stripSvg(
  segments: readonly { phase: ActivityPhase; ms: number; isOpen: boolean }[],
  hexOf: (phase: ActivityPhase) => string,
  width: number,
  level: Level,
): string {
  const height = 6
  const total = segments.reduce((sum, s) => sum + s.ms, 0) || 1
  let x = 0

  const rects = segments.map(s => {
    const w = Math.max(1.5, (s.ms / total) * width)
    const rect = `<rect${s.isOpen && level !== 'off' ? ' class="live"' : ''} x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="${hexOf(s.phase)}"/>`

    x += w

    return rect
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<style>.live{animation:live 1s ease-in-out infinite}@keyframes live{0%,100%{opacity:1}50%{opacity:.45}}${REDUCED}</style>`
    + `<clipPath id="c"><rect width="${width}" height="${height}" rx="3"/></clipPath>`
    + `<g clip-path="url(#c)"><rect width="${width}" height="${height}" fill="#8a8a8a" opacity=".15"/>${rects.join('')}</g>`
    + '</svg>'
}

/** One history row's duration as a short rounded bar. */
export function barSvg(share: number, color: string, width: number): string {
  const w = Math.max(2, Math.min(1, share) * width)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="6" viewBox="0 0 ${width} 6">`
    + `<rect width="${width}" height="6" rx="3" fill="#8a8a8a" opacity=".15"/>`
    + `<rect width="${w.toFixed(1)}" height="6" rx="3" fill="${color}" opacity=".85"/>`
    + '</svg>'
}
