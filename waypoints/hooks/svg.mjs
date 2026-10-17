// The Desktop route: the same cells the terminal draws (route.mjs), as one SVG document for
// `Svg`'s `source`. CSS in the document's own <style> does the moving, so the browser runs
// the loops and the mod draws only when the plan changes.
//
// A source that changes restarts its animations (agent-pulse's rule), so nothing here carries
// the time, the ETA or anything per tick. The finish effects carry their goal's id instead,
// so they play once for a finish and again only for the next.

const REDUCED = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}'
const HEIGHT = 14
const MID = HEIGHT / 2
const LEGS = '━┄'

const f = (n) => n.toFixed(1)

// A four-point star centred on (x, y)
function star(x, y, r, attrs) {
  const k = r * 0.3
  const pts = [[x, y - r], [x + k, y - k], [x + r, y], [x + k, y + k], [x, y + r], [x - k, y + k], [x - r, y], [x - k, y - k]]
  return `<polygon points="${pts.map(([a, b]) => f(a) + ',' + f(b)).join(' ')}" ${attrs}/>`
}

// The width the row takes: the terminal's columns at 8 px each, less the title's share
export function svgWidth(bodyColumns) {
  return Math.max(140, Math.min(640, Math.round(bodyColumns * 8 - 40)))
}

// hex: { done, glow, pending, sparkle[] }; level: off | subtle | full; finishId: set once the
// goal has finished, so its one-shot effects have an address
export function routeSvg(cells, { hex, level, width, finishId = '' }) {
  const unit = width / Math.max(1, cells.length)
  const xs = (i) => (i + 0.5) * unit
  const nodes = []
  cells.forEach((c, i) => {
    if (!LEGS.includes(c.ch)) nodes.push({ c, i })
  })
  const dense = nodes.length === cells.length // one glyph per task: no legs, smaller nodes
  const r = dense ? 2.2 : 3.5
  const live = level !== 'off'
  const body = []
  const light = []

  // legs first, so the nodes sit on top
  for (let k = 0; k + 1 < nodes.length; k++) {
    const a = nodes[k]
    const b = nodes[k + 1]
    if (b.i - a.i < 2) continue
    const x1 = xs(a.i) + r
    const x2 = xs(b.i) - r
    const done = cells[a.i + 1].ch === '━'
    body.push(
      done
        ? `<line x1="${f(x1)}" y1="${MID}" x2="${f(x2)}" y2="${MID}" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>`
        : `<line x1="${f(x1)}" y1="${MID}" x2="${f(x2)}" y2="${MID}" stroke="${hex.pending}" stroke-width="2" stroke-dasharray="3 3" opacity=".6"/>`,
    )
    // at full, a small light travels along the running leg from its start node
    if (level === 'full' && a.c.role === 'active') {
      light.push(`<circle class="go" cx="${f(x1)}" cy="${MID}" r="1.8" fill="${hex.glow}" style="--d:${f(Math.max(0, x2 - x1))}px"/>`)
    }
  }

  for (const { c, i } of nodes) {
    const x = xs(i)
    if (c.role === 'active') {
      body.push(`<circle${live ? ' class="halo"' : ''} cx="${f(x)}" cy="${MID}" r="${f(r + 2.5)}" fill="${hex.glow}" opacity=".3"/>`)
      body.push(`<circle cx="${f(x)}" cy="${MID}" r="${f(r)}" fill="${hex.done}"/>`)
    } else if (c.ch === '✦') {
      body.push(star(x, MID, 6, `fill="${hex.sparkle[0]}"`))
    } else if (c.ch === '◎') {
      const done = c.role === 'done'
      body.push(`<circle cx="${f(x)}" cy="${MID}" r="5" fill="none" stroke="${done ? 'url(#g)' : hex.pending}" stroke-width="1.5"${done ? '' : ' opacity=".7"'}/>`)
      if (done) body.push(`<circle cx="${f(x)}" cy="${MID}" r="2" fill="url(#g)"/>`)
    } else if (c.role === 'done') {
      body.push(`<circle cx="${f(x)}" cy="${MID}" r="${f(r)}" fill="url(#g)"/>`)
    } else {
      body.push(`<circle cx="${f(x)}" cy="${MID}" r="${f(r - 0.5)}" fill="none" stroke="${hex.pending}" stroke-width="1.5" opacity=".7"/>`)
    }
  }

  // the finish, at full: a light sweeps the route once, three stars twinkle at the end
  const effects = []
  if (finishId && level === 'full') {
    const end = nodes.length ? xs(nodes[nodes.length - 1].i) : width
    effects.push(`<circle class="sweep" cx="0" cy="${MID}" r="5" fill="${hex.sparkle[3] || hex.sparkle[0]}" style="--d:${f(width)}px"/>`)
    ;[[-7, -3.5, 0], [6, -4, 0.35], [-1, 4.5, 0.7]].forEach(([dx, dy, delay], n) => {
      effects.push(star(end + dx, MID + dy, 2.4, `class="tw" fill="${hex.sparkle[n + 1] || hex.sparkle[0]}" style="animation-delay:${delay}s"`))
    })
  }

  const css = []
  if (live) css.push('.halo{animation:halo 1.4s ease-in-out infinite}@keyframes halo{0%,100%{opacity:.15}50%{opacity:.6}}')
  if (level === 'full') {
    css.push('.go{animation:go 1.8s linear infinite;opacity:0}@keyframes go{0%{transform:translateX(0);opacity:0}20%,80%{opacity:1}100%{transform:translateX(var(--d));opacity:0}}')
    css.push('.sweep{opacity:0;animation:sweep 1.5s ease-in forwards}@keyframes sweep{0%{transform:translateX(0);opacity:0}15%,85%{opacity:.9}100%{transform:translateX(var(--d));opacity:0}}')
    css.push('.tw{opacity:0;transform-box:fill-box;transform-origin:center;animation:tw 1.2s ease-out 1 forwards}@keyframes tw{0%{transform:scale(0);opacity:0}40%{transform:scale(1.2);opacity:1}100%{transform:scale(1);opacity:.9}}')
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">` +
    `<style>${css.join('')}${REDUCED}</style>` +
    `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="0"><stop offset="0" stop-color="${hex.done}"/><stop offset="1" stop-color="${hex.glow}"/></linearGradient></defs>` +
    body.join('') +
    light.join('') +
    (effects.length ? `<g id="fin-${finishId}">${effects.join('')}</g>` : '') +
    '</svg>'
  )
}

// What a screen reader hears of the route: numbers only, so there is no title to mask
export function routeAlt(done, total, running) {
  return `${done} of ${total} tasks done` + (running.length ? `, task${running.length > 1 ? 's' : ''} ${running.join(' and ')} running` : '')
}
