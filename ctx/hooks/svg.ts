// The Desktop's drawings, as SVG sources: the band's bar as a small pill, and
// the pane's breathing ⚠. The browser runs the motion (CSS @keyframes), so the
// mod draws again only when the data changes. A source must not change between
// redraws unless the data did (a new source restarts its animations): nothing
// here carries a time, and a one-shot carries its event's id, so it plays once.

import type { Level } from './palette'

type Cell = { ch: string; color: string; bg?: string; dim?: boolean; scope: string }

const CELL_PX = 8
const H = 12
// The row under a labelled bar, and the width a 10 px label character is taken to need
const LABEL_H = 14
const LABEL_CHAR = 5.6
const REDUCED = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

// Consecutive cells of one category, with the colours at their two ends
function segments(cells: readonly Cell[]) {
  const segs: { scope: string; kind: 'used' | 'free' | 'buffer'; from: number; to: number; first: string; last: string }[] = []
  cells.forEach((c, i) => {
    const kind = c.ch === '░' ? 'buffer' : c.ch === '~' || c.ch === '≈' || c.ch === '·' ? 'free' : 'used'
    const seg = segs[segs.length - 1]
    if (seg && seg.scope === c.scope && seg.kind === kind) {
      seg.to = i + 1
      if (kind !== 'free' || c.ch !== '≈') seg.last = c.color
    } else segs.push({ scope: c.scope, kind, from: i, to: i + 1, first: c.color, last: c.color })
  })
  return segs
}

export type BandSvg = {
  cells: readonly Cell[]
  level: Level
  /** The water's edge, or -1. */
  edge: number
  /** The auto-compact point, as a cell column. */
  tick?: number
  /** Near auto-compact: the colour the tick and the edge breathe in. */
  warn?: string
  growth?: { id: number; from: number; to: number; colors: readonly string[] }
  sweep?: { id: number; from: number; to: number }
  /** Pixels a cell takes; 8 unless the bar is drawn at a width of its own (the pane's). */
  cellPx?: number
  /** Words under the bar at the tick, with a caret; needs a tick. */
  label?: string
}

/** The bar on Desktop: a rounded pill, `cells.length × cellPx` (8) by 12 px, a label's row under it when asked. */
export function bandSvg(o: BandSvg): { source: string; width: number; height: number } {
  const px = o.cellPx ?? CELL_PX
  const W = o.cells.length * px
  const moving = o.level !== 'off'
  const segs = segments(o.cells)
  const water = segs.find(s => s.kind === 'free')
  const foam = o.edge >= 0 ? o.cells[o.edge]?.color : undefined
  const hasWater = Boolean(water && o.cells.some(c => c.ch === '~' || c.ch === '≈'))
  const defs: string[] = [`<clipPath id="c"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath>`]
  const body: string[] = []
  segs.forEach((s, i) => {
    const x = s.from * px
    const w = (s.to - s.from) * px
    if (s.kind === 'used') {
      defs.push(`<linearGradient id="u${i}" x1="0" x2="1"><stop offset="0" stop-color="${esc(s.first)}"/><stop offset="1" stop-color="${esc(s.last)}"/></linearGradient>`)
      body.push(`<rect x="${x}" width="${w}" height="${H}" fill="url(#u${i})"/>`)
    } else if (s.kind === 'buffer') {
      defs.push(`<pattern id="h" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="3" fill="${esc(s.first)}"/></pattern>`)
      body.push(`<rect x="${x}" width="${w}" height="${H}" fill="${esc(s.first)}" opacity="0.18"/><rect x="${x}" width="${w}" height="${H}" fill="url(#h)" opacity="0.6"/>`)
    } else if (hasWater) {
      body.push(`<rect x="${x}" width="${w}" height="${H}" fill="${esc(s.last)}" opacity="0.28"/>`)
      // the wave along the water's surface, wider than the water so it can drift
      const crest = Array.from({ length: Math.ceil(w / 8) + 3 }, (_, k) => `q2 -2 4 0 t4 0`).join(' ')
      body.push(`<path class="wave" d="M${x - 16} 4 ${crest}" fill="none" stroke="${esc(foam ?? s.last)}" stroke-width="1.2" opacity="0.8"/>`)
      if (o.level === 'full') {
        for (const k of [0.25, 0.55, 0.8]) body.push(`<circle class="glint" cx="${(x + w * k).toFixed(1)}" cy="8" r="0.9" fill="#ffffff"/>`)
      }
    } else {
      body.push(`<rect x="${x}" width="${w}" height="${H}" fill="${esc(s.first)}" opacity="0.18"/>`)
    }
  })
  if (foam && hasWater) body.push(`<rect class="${o.warn ? 'edge breathe' : 'edge'}" x="${o.edge * px}" width="1.5" height="${H}" fill="${esc(o.warn ?? foam)}"/>`)
  if (o.tick !== undefined) body.push(`<rect class="tick${o.warn ? ' breathe' : ''}" x="${Math.min(W - 1.5, o.tick * px)}" width="1.5" height="${H}" fill="${esc(o.warn ?? '#ffffff')}" opacity="0.85"/>`)
  if (moving && o.growth && o.growth.to > o.growth.from) {
    const c = o.growth.colors[Math.floor(o.growth.colors.length / 2)] ?? '#ffffff'
    body.push(`<rect id="g${o.growth.id}" class="grow" x="${o.growth.from * px}" width="${(o.growth.to - o.growth.from) * px}" height="${H}" fill="${esc(c)}"/>`)
  }
  if (o.level === 'full' && o.sweep && o.sweep.to > o.sweep.from) {
    const from = o.sweep.from * px
    const span = (o.sweep.to - o.sweep.from) * px
    body.push(
      `<rect id="s${o.sweep.id}" class="sweep" x="${from}" width="${span}" height="${H}" fill="${esc(foam ?? '#ffffff')}" style="transform-origin:${from}px 0"/>`,
    )
  }
  const css = moving
    ? [
        '@keyframes drift{to{transform:translateX(-8px)}}',
        '.wave{animation:drift 2.4s linear infinite}',
        '@keyframes twinkle{0%,100%{opacity:0}50%{opacity:.85}}',
        '.glint{opacity:0;animation:twinkle 2.6s ease-in-out infinite}',
        '.glint:nth-of-type(2n){animation-delay:.9s}',
        '.glint:nth-of-type(3n){animation-delay:1.7s}',
        '@keyframes breathe{0%,100%{opacity:.35}50%{opacity:1}}',
        '.breathe{animation:breathe 2s ease-in-out infinite}',
        '@keyframes grow{0%{opacity:.9}100%{opacity:0}}',
        '.grow{opacity:0;animation:grow 1.5s ease-out 1}',
        '@keyframes sweep{0%{transform:scaleX(1);opacity:.9}100%{transform:scaleX(0);opacity:.4}}',
        '.sweep{transform:scaleX(0);animation:sweep 1.2s ease-in 1}',
      ].join('')
    : ''
  // the auto-compact caret and its words under the bar: after the tick when they fit, else ending at it
  const labelled = o.label !== undefined && o.tick !== undefined
  const total = labelled ? H + LABEL_H : H
  let under = ''
  if (labelled) {
    const tx = Math.min(W - 3, o.tick! * px + 0.75)
    const fits = tx + 6 + o.label!.length * LABEL_CHAR <= W
    under =
      `<path d="M${(tx - 3).toFixed(1)} ${H + 8} l3 -5 l3 5z" fill="#8a8f98"/>` +
      `<text x="${(fits ? tx + 7 : tx + 3).toFixed(1)}" y="${H + 12}" font-size="10" fill="#8a8f98"${fits ? '' : ' text-anchor="end"'}>${esc(o.label!)}</text>`
  }
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 0 ${W} ${total}">` +
    `<style>${css}${REDUCED}</style><defs>${defs.join('')}</defs><g clip-path="url(#c)">${body.join('')}</g>${under}</svg>`
  return { source, width: W, height: total }
}

/** The pane's ⚠ near auto-compact, breathing in `color`: 10 by 12 px. */
export function breathSvg(color: string): { source: string; width: 10; height: 12 } {
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="12" viewBox="0 0 10 12">` +
    `<style>@keyframes breathe{0%,100%{opacity:.35}50%{opacity:1}}text{animation:breathe 2s ease-in-out infinite}${REDUCED}</style>` +
    `<text x="0" y="10" font-size="10" font-weight="700" fill="${esc(color)}">⚠</text></svg>`
  return { source, width: 10, height: 12 }
}
