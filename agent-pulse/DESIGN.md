# agent-pulse: design notes

Agent Pulse is a fork of Tzafrir Rehan's [whats-agent-doing](https://github.com/tzafrir/whats-agent-doing) 0.4.3 (MIT), imported with its history. The original's job is unchanged: a box above the prompt that always says what Claude is doing right now, and behind its triangle what it has done. This fork adds color, motion and small charts on top, on the terminal and on the desktop app's Code tab. This document says why each addition is built the way it is, for whoever changes the mod next, including a future Claude session.

## Principles

- **Every effect carries meaning.** The original's border color already changed with the phase; nothing here moves or changes color just to be busy. A spinner says "working", a breathing border says "you are needed", a flash says "that call finished, and how", the timer's heat says "this step is taking long".
- **The text stays text.** The headline, the history and the agent rows are `Text` in the hook's tree on every surface: they truncate, they are read by screen readers and by the tests. Decoration sits beside them, never in place of them.
- **Motion is opt-in by degree.** `userConfig.animation` is `off`, `subtle` (the default) or `full`. Data (palette, heat, glyphs, timeline, bars) is not motion and shows at every level.
- **The data model is shared; drawing is per surface.** One set of `$.state` atoms. The `AbovePrompt` hook draws the terminal's tree or the desktop's from it, chosen by `e.surface`.

## How each surface animates

The two surfaces animate in opposite ways, and each addition is built for both.

| | Terminal | Desktop |
|---|---|---|
| Engine | A `Client` (`hooks/pulse.tsx`) and its frame clock, `surface.every`. It runs on the drawing thread; the hooks never run per frame. | An `Svg` whose `<style>` holds CSS `@keyframes`. The browser runs the loop; the mod draws again only when the state changes. |
| Where | Fixed-width regions only: the status glyph, the "Claude" word, the sparkle. A `Client` region is as wide as it draws, so a truncating label cannot live in one. | The jellyfish, the timeline strip, the duration bars. |
| Reduced motion | `animation: off` | `animation: off`, and `@media (prefers-reduced-motion: reduce)` in every SVG |

`Svg` exists only on `desktop` and `mobile`. The terminal's element table answers `'Svg' in ui` too but draws it empty (found in `subagent-progress`), so the test is `e.surface !== 'terminal'`. A `Client`'s own element table has no `Svg` on any surface (`ClientElements` is the terminal's table), which is why the desktop animates through plain SVG and not through a `Client`.

An SVG source must not change on every redraw: the 1 s ticker redraws the band, and a new source restarts its CSS animations. So no SVG carries the elapsed time or anything else that changes each second; one-shot animations (a flash, a sparkle) carry the id of their event, so they play once and then drop out.

## The additions

| # | Addition | off | subtle | full | Terminal | Desktop |
|---|---|---|---|---|---|---|
| 1 | Animated status glyph per phase | static `●` | ✓ | ✓ | `Client`: braille spinner (tool), pulsing `∴` (thinking), `✎` with flowing dots (writing) | the jellyfish acts the phase |
| 2 | Shimmer on the "Claude" word | | | ✓ | `Client`, one hex color per letter | gradient sweep in the jellyfish's glow |
| 3 | Breathing border while waiting on you (approval, question) | | | ✓ | the hook redraws at 8 fps during the wait only | the jellyfish's glow breathes |
| 4 | Flash when a call ends: green ✓, red ✗, yellow ⊘ | | ✓ | ✓ | border in the outcome color for 360 ms | a halo ring expands once |
| 5 | Palettes (`claude`, `neon`, `mono`) on theme keys and hex | ✓ | ✓ | ✓ | both | both |
| 6 | Timer heat: dim, amber after 30 s, orange after 2 min, red after 5 min | ✓ | ✓ | ✓ | `Text` color | `Text` color, tabular digits |
| 7 | A glyph per tool (◧ Read, ✎ Edit, ❯ Bash, ⌕ Grep, ⌁ Web, ◆ Agent, ⧉ MCP) | ✓ | ✓ | ✓ | both | both |
| 8 | A color per agent, tree connectors, a spinner each | colors | + spinners | + spinners | `├─ └─` | same |
| 9 | Turn timeline strip: the turn's phases as colored blocks | ✓ | ✓ | ✓ | block characters | `Svg` bar |
| 10 | Duration bars in the history | ✓ | ✓ | ✓ | `▏▎▍▌▋▊▉█` | `Svg` bars |
| 11 | Micro-meters for the reply's words and a call's size | ✓ | ✓ | ✓ | `▁▂▃▄▅▆▇█` on a log scale | same |
| 12 | Turn-end sparkle | | | ✓ | `Client`, 1.6 s | stars twinkle once |
| 13 | Hover cards with the whole label | ✓ | ✓ | ✓ | absolute `Box`, `hover: { display: 'flex' }` | same |
| 14 | A chime when Claude starts waiting on you | `userConfig.sound` | | | `$.audio.play` | same |
| 15 | The settings: `animation`, `palette`, `sound` | | | | | |

## The jellyfish

The desktop gets a mascot: a small jellyfish next to the headline that acts out the phase. Jellyfish pulse and glow, which is the mod's name. `subagent-progress` draws its subagents as crabs; with both mods installed, the crabs are the subagents and the jellyfish is Claude itself.

| Phase | The jellyfish |
|---|---|
| idle | sinks a little and dims; eyes closed |
| requesting | bobs; eyes up |
| thinking | drifts slowly; bubbles rise (full) |
| writing | trails ink dots (full) |
| composing | tentacles wiggle quickly |
| tool, agent | the bell pulses; tentacles swing |
| approval, question | the glow breathes yellow; eyes wide; a `!` or `?` above |
| compacting | squishes wide, slowly |

`off` draws it still in its pose; `subtle` keeps the bob and the pulse; `full` adds bubbles, ink, the halo and the sparkle. The terminal has no room for a character; its glyph is the jellyfish's stand-in.

## Settings

| Field | Values | Default |
|---|---|---|
| `animation` | `off`, `subtle`, `full` | `subtle` |
| `palette` | `claude`, `neon`, `mono` | `claude` |
| `sound` | `off`, `approval` | `off` |

A change in the config menu reloads the module with the new `options`; the state atoms survive the reload.

## Alternatives turned down

- **The whole box in one `Client`.** It would animate the border without the hook redrawing, but the label could no longer truncate to the window, the tests could no longer read the box's text, and the toggle would need a round trip through `ui.message`. The border breathes by a hook redraw at 8 fps instead, and only while Claude waits on the person.
- **A shimmer on the label.** A `Client` region takes the width of what it draws, so a shimmering label could not give way in a narrow window, which the original fixed in 0.4.3. The shimmer runs over the fixed-width "Claude" word.
- **A glowing border on the desktop.** A `Box` border cannot glow, and an absolute `Svg` behind the box depends on the desktop's layout. The jellyfish's glow carries the phase color instead.
