# subagent-progress 2.1: terminal look, design notes

Today the desktop app gets animated pixel-art crabs and a dithered, twinkling bar, while the terminal gets
text: a `▣` in the costume's colour, a static `●`, and one flat `█░` bar. 2.1 gives the terminal its own
version of the same look, the way `waypoints` 2.0 and `agent-pulse` did for theirs. No behaviour Claude sees
changes, and the desktop drawings are untouched.

This document is the spec for the build. A section marked **(builder's call)** was settled by the designer
without asking the person; everything else the person chose or saw.

## What the person asked for

1. The terminal should look as good as Claude Desktop does: the crabs, the motion, not plain rows.
2. It should share `agent-pulse`'s palette and animation level, as `waypoints` does, so the three bands never
   disagree. (They chose "follow".)
3. They run Windows Terminal, so nothing may depend on the kitty image protocol (it has none).

## What the spike proved

A throwaway mod drew half-block crabs through a `Client` inside a `Pane`, and the person looked at it live:

| Question | Answer |
|---|---|
| Does a `Client` mount and animate in a `Pane` render site? | **Yes.** Seven crabs moved. |
| 8 cols × 3 rows (8×6 px) | **Too big.** |
| 6 cols × 2 rows (6×4 px), beside a two-row name + model block | **"Perfect."** The six costumes can be told apart by a one-pixel-row hat and the prop pixel. |
| 4 cols × 1 row (4×2 px) | **Illegible.** |

So the crab is **6×2 cells and only that size**. Anywhere less than two rows tall (compact lines, the band)
does not shrink the crab; it uses a one-cell glyph instead.

## Principles

Borrowed from `agent-pulse/DESIGN.md` and `waypoints/DESIGN.md`:

- **Every effect carries meaning.** A walking crab means "this agent is running". A still, dim one means
  finished. Nothing moves to be busy.
- **The text stays text.** Names, models, times, costs and the band's title/percent are `Text`: they truncate,
  screen readers and tests read them. The crab is decoration beside them.
- **Motion is opt-in by degree** (`off` / `subtle` / `full`). Shape and colour show at every level.
- **No layout shifts.** The crab's region is a fixed 6×2, and the band keeps its height.

## The agent card (pane, terminal)

```
Running · 2
 ▄▀▀▄▄▀   Audit hooks                           ●      ← crab (6×2), name, status glyph
 ▐█●●█▌   general-purpose · Opus 5.5 · xhigh           ← type · model · effort (dim)
 ████░░░░ 1:20 · ≈$0.42 · ctx 12% · 120k · 3/6 note    ← full width, under the crab
```

(The crab drawn above is only a stand-in; the real sprite is the pixel map below.)

- Row 1: the crab's top row, then the description (bold, truncated) and the status glyph on the right.
- Row 2: the crab's bottom row, then `type · model · effort` (dim, truncated), and `round n` when n > 1.
- Row 3: starts at column 0, full width: the bar, then `time · ≈cost · ctx % · tokens`, then the step count and
  note last, so a cut line loses the note and not the cost and time (1.4.0's rule, kept).
- The existing eighths bar (`bar()`: `█`, `▏▎▍▌▋▊▉`, `░`) stays, in the costume colour when the worker reports
  steps. Without reported steps it is the context fill, dim, as today, and **only that bar** takes the heat
  colours: the palette's `heat` amber from 70% and red from 90% **(builder's call: the thresholds)**. A steps
  bar never takes them.
- **Not narrow:** the card needs `bodyColumns` of at least 24 for the crab beside the text. Below that the
  crab is left out and the two text rows start at column 0 (today's layout).

### The sprite (6×2 cells, 6×4 pixels)

Four pixel rows; each terminal cell holds two vertically (`▀` top only, `▄` bottom only, `█` both the same,
`▀` with a background when they differ). Pixel keys: `b` body, `c` claw, `e` eye, `l` leg (all brand clay
`#D97757`, eyes `#1F1E1D`), `a` the costume's accent colour (`COSTUME_COLOR` in `crew.ts`), `w` white, `h` brown
`#7A4A26`, `y` yellow `#F5C542`, `k` grey `#55514C`.

| Pixel row | Pixels |
|---|---|
| 0, the hat | by costume, below |
| 1 | `cebbec` |
| 2 | `.bbbb.` |
| 3, the legs | frame A `.l..l.`, frame B `..ll..` |

| Costume | Hat (row 0) | The prop pixel (one pixel that moves with the frame) |
|---|---|---|
| astronaut | `.waaw.` | right edge of row 0 blinks yellow on even frames |
| detective | `.hhhh.` | right edge, rows 0↔1, grey: the magnifier sweeping |
| engineer | `.yyyy.` | left edge, rows 0↔1, grey: the wrench turning |
| chef | `wwwwww` | right edge, rows 0↔1, yellow: the omelette tossed |
| racer | `.aaaa.` | right edge, rows 0↔1, white/grey: the flag fluttering |
| pirate | `.kwwk.` | right edge, rows 0↔1, grey: the cutlass |
| other | `......` | none |

This is exactly what the person saw in the spike and approved, from `crab.tsx` in the spike mod
(`C:\Users\wenha\.claude\dev-mods\7848d28d-4bbe-4a62-a50a-07ed07b783ee\crab-spike\hooks\crab.tsx`, throwaway:
copy the maps and rules, not the file).

### States

| State | Crab | Notes |
|---|---|---|
| running | walks (legs A↔B every 250 ms) and the prop moves | one frame clock per running crab |
| done | still, dim, legs frame A | `✓` in the theme's `success` |
| failed | still, dim | `✗` in the theme's `error` |
| planned | still, dim | sits under "Planned"; the crab replaces the leading `▢` |

A **planned card** is two rows, as today: the dim crab beside `n. title` (row 1) and `tier · profile · after …`
(row 2), with no bar row. Below 24 columns, or in compact mode, the leading `▢` / `◷` glyph returns
**(builder's call)**.

**Every crab goes through the one `Client` module** (`hooks/crab.tsx`), a still one with `running: false`, which
starts no timer. This avoids depending on a `Client` module importing a shared sprite file, which the reference
does not say it may do. **(builder's call)** If the builder confirms it can import, a shared pure
`sprite.ts` is nicer for tests; if not, export the pure sprite builder from `crab.tsx` itself.

A `Client` is kept across the pane's redraws while its `key` stays, and new `props` reach the running instance
with its state kept; so the key is the agent's `id` and the props change only when the state does.

### Compact mode

One line per agent, as in 1.4.0, with the leading status glyph made alive: a running agent's `●` becomes a
one-cell spinner (`Client`, a braille spinner in the costume's own colour, held still: no shimmer, because the
colour is the agent's identity; `ms` from the animation level); done and failed keep `✓` / `✗`. No crab: the XS
spike showed one cell-row is illegible.

## The band (terminal)

```
● Subagents █████░░░ Tasks 2/3 66% ⠋⠙✓ a: ×3 ✕
```

Same row, same height as today, with:

- **A shaded bar.** The fill shades from the palette's core to its glow along its length (the `done(t)` idea from
  `waypoints`), so a long bar has a gradient. Colour comes from the palette's **`agent`** phase (a subagent
  working is exactly what agent-pulse's `agent` phase means) **(builder's call)**. A palette that follows the theme
  (`claude`, `mono`) is flat and may be a theme key. When the flow finishes the bar and the `✓` take the
  palette's `outcome.ok`.
- **The bar keeps `bar()`'s glyphs** (`█`, the eighths `▏▎▍▌▋▊▉`, `░`) but is drawn per cell, so each cell can
  have its own colour. The **head** is the last cell that holds any fill, partial or whole; the partial cell
  stays a partial glyph inside the shaded run **(builder's call)**.
- **A pulsing head.** At `subtle` and `full` the head cell cycles `shimmerOf(palette, 'agent')` while agents run
  (a one-cell `Client`). `off`: still.
- **The finish sparkle.** At `full` only, when the flow closes into **Done**, a one-shot sweep runs the palette's
  `sparkle` colours along the filled bar for ~1.5 s, then rests on the solid `ok` colour. `subtle` / `off`:
  solid, no motion. It plays only when a render **sees the flow go from running to finished**, tracked in a
  module variable that counts finishes and keys the `Client`, so it plays once. A flow already finished when
  the module loads (a resumed session, a reload) does not sparkle **(builder's call)**. This works for an
  orchestrator-closed flow (`progress` with `finished: true`) as well as an auto flow, and needs no new state.
- **A crew glyph row in place of `▣`.** One cell per agent, in the costume's own colour, held still: a running
  agent is a spinner, a finished one `✓` (`success`), a failed one `✗` (`error`), a planned one `○` (dim). At
  most 8 cells, then `+n`. The `a: ×N` button stays, as the hotkey and the count. **(builder's call: 8)**

The band stays `[mine, below]` (the repository `CLAUDE.md` rule), `props.hasSurvey` still returns `below`
untouched, and the row's measured widths (`tail`) must count the new crew row, or the row wraps at 80 columns.

## Palette and animation

Two new settings, both defaulting to **follow**, resolved exactly as `waypoints` does (its `palette.mjs` and
`register.mjs` are the reference; do not re-derive):

| Field | Title | Values | Default |
|---|---|---|---|
| `palette` | Palette | `follow`, `ember`, `claude`, `neon`, `mono` | `follow` |
| `animation` | Animation | `follow`, `off`, `subtle`, `full` | `follow` |

- `follow` reads `$.config.list()` for the rows `agent-pulse.palette` / `agent-pulse.animation`; with no row
  (agent-pulse not installed or disabled) it is `ember` / `subtle`. An explicit value overrides the link.
- Resolve at `session.start`, in a `config.set` hook whose `key` is the literal array
  `['agent-pulse.palette', 'agent-pulse.animation']` (call `next`, then refresh), and on a separate 15 s tick as
  the fallback (a change that never reached `config.set`). `$.ui.invalidate('ui.render')` after a change.
- `hooks/palette.ts` is a **copy** of `agent-pulse/hooks/palette.ts`'s four palettes, in TypeScript this time,
  with a comment that the values are copied and must be kept in step. A test pins a few values, so a drift is
  a deliberate edit. (Each mod is installed alone; no cross-mod import is possible.) Copy from
  `waypoints/hooks/palette.mjs` and add the `agent` phase it already carries.

What each level does, **terminal only**:

| | off | subtle | full |
|---|---|---|---|
| Crab legs | still (frame A) | walk | walk |
| Crab props | still | still | move |
| Spinners (compact lines, crew glyphs) | a still `●` | cycle | cycle |
| Bar head pulse | still | pulse | pulse |
| Finish sparkle | none | none | plays once |

Shape, colour, the shaded bar and every number show at every level. **The palette does not recolour the crabs:**
body clay and the costume's accent stay fixed, because the colour carries the costume (the person accepted this
when choosing), and so do the crew glyphs and the compact-line spinners, which are the costume's identity too.
The palette colours the band's bar, its shading, its head, the finish sparkle and the context heat.

**Desktop is unchanged**, including its own `prefers-reduced-motion` handling; the `animation` setting does not
reach the SVG crabs. **(builder's call, say so in the README.)**

## Code layout (builder's call)

Stays TypeScript. `register.tsx` is already 1,100+ lines; the new code goes in new files and `register.tsx`
only calls into them.

| File | What |
|---|---|
| `hooks/crab.tsx` | The `Client` module: the sprite builder (pure, exported for tests) and the animation. Props: `{ costume, accent, running, dim, level }`. |
| `hooks/pulse.tsx` | The other `Client`s: `spin` (one-cell spinner), `head` (the bar's pulsing last cell), `sweep` (the finish). |
| `hooks/palette.ts` | The copied palettes, `resolveLook(options, rows)`, `rolesOf`, `shimmerOf`, `shadeOf`. |
| `hooks/register.tsx` | Hooks and state; the terminal pane and band call the new pieces; `config.set` and the 15 s tick. |
| `hooks/crew.ts` | Unchanged. |
| `.claude-plugin/plugin.json` | `userConfig` gains `palette` and `animation`; version **2.1.0** **(builder's call)**. |

A `Client`'s module path must be a string literal in the `Client` element (the engine reads it off the source),
and a `Client`'s own element table has no `Svg` and no nested `Client`.

## Left alone on purpose

- **The tool contract.** `progress` and `step`, their schemas and texts: untouched, so Claude behaves as in 2.0.1.
- **The costume rules** in `crew.ts`, and the desktop SVG crabs, bar, header and every desktop row.
- **The auto-flow logic** in `auto.ts` and the spawn, step and completion hooks.
- **The state contract** (`types/index.d.ts`): no new `$.state` value. The look (`palette`, `animation`) lives in
  module variables, as `waypoints` does; a reload resets them from `session.start`.
- **Language.** No new visible words.
- **Privacy.** Nothing new shows a title or a note, so nothing new needs masking.

## Risks

- **Many Clients in one tree.** Each crab is a handful of `Text` nodes, and a tree is bounded (20,000 nodes,
  100,000 characters serialized). The pane keeps at most 200 agents (the existing cap). Only running crabs start
  a timer, so the cost scales with running agents, not history. If a large batch runs, the builder may draw
  only the first 8 running crabs animated and the rest still **(builder's call: 8)**.
- **The `Client`'s frame clock and the 1 s redraw.** The pane redraws every second while agents run; the crab's
  `Client` keeps its state across that as long as its `key` and props are unchanged. The props must not carry
  the clock. Confirm live that the crabs do not restart their walk each second.
- **Font.** The half blocks and `▰▱` need block-element glyphs; the 1.4.0 README already says Cascadia or a
  Nerd Font. Spinners use braille, which Cascadia has.

## Tests

Keep the existing 46 (`auto`, `crew`, `render`; all pass on 2.0.1). Add, with `claude plugin test subagent-progress`:

- **sprite:** each costume's rows match the maps above; frame B differs from frame A only in the legs and the
  prop; `other` has no prop; every cell is one of `' ' ▀ ▄ █`, a `▀` with a background only where the two pixels
  differ; the sprite is exactly 6 cells wide and 2 rows tall.
- **levels:** `off` draws frame A at any frame; `subtle` moves the legs and not the prop; `full` moves both.
- **sparkle:** a render that sees running → finished mounts one `sweep`; a second render of the same finished
  flow mounts none; a flow already finished on first sight mounts none; `subtle` and `off` mount none.
- **palette / follow:** `follow` with an `agent-pulse.palette` row → that palette; with none → `ember`; an
  explicit value wins; the same for animation; four pinned palette values.
- **pane card, terminal:** a running agent's text rows still read name, `type · model · effort`, and the stats
  line, with a `Client` beside them; below 24 columns there is no crab; a finished agent has no timer;
  compact has a spinner `Client` for a running agent and none for a finished one.
- **band, terminal:** the crew glyph row (running, done, failed, planned, `+n` past 8); the row does not wrap at
  80 columns with 8 crew glyphs and a long label; `hasSurvey` still returns `below` untouched; the bar is still
  `[mine, below]`.
- **desktop:** `e.surface === 'desktop'` still draws the SVGs and no `Client` (a regression test, as 2.0.1 added).

Each negative test sits beside a positive one.

## Checking it live

Load with `claude --plugin-dir E:\github\claude-mods\subagent-progress` with the installed copy disabled. The
person looks; the builder lists what to look at:

1. Run three subagents of different models (an Opus one, a Sonnet one, an Explore one). Each card shows its
   own crab; the legs walk; the props move at `full` and not at `subtle`.
2. Finish them: crabs go still and dim; the band closes into Done with the sparkle (`full`) once.
3. `/config` → Animation `off`: nothing moves anywhere. `subtle`, `full`: as the table.
4. With `agent-pulse` installed, change its palette and animation in `/config`: this mod follows (15 s at
   worst). Set this mod's own value: it stops following. Disable `agent-pulse`: `follow` falls back to `ember`.
5. Compact mode: spinners, no crabs.
6. An 80-column window: the band does not wrap; a narrow pane (under 24 columns) drops the crab.
7. Leave a batch running for a minute: the walk is steady, no restart each second.
8. The desktop app: unchanged.

## Shipping

On the branch `subagent-progress-terminal-look`: this `DESIGN.md` as the first commit, then the code. Version
**2.1.0** in `plugin.json`. Update `subagent-progress/README.md` (a **2.1.0** entry under Changes, the two
settings, a Terminal look note, and the 1.x line "the terminal gets text rows in the costume's color" which is
no longer true), `SETUP.md` (the version in the table), the root `README.md` row if its wording is now wrong,
and the marketplace entry if it carries a version. Pull request, as for 2.0.0. Run
`claude plugin validate subagent-progress`, `claude plugin validate .` and `claude plugin test subagent-progress`
before the PR.

## What a smaller model can build without more questions

All of it, in this order: `palette.ts` + tests → `crab.tsx` sprite + tests → the pane card → compact mode →
`pulse.tsx` (spin, head, sweep) → the band → the settings and `follow` → docs. The two facts to confirm live
rather than assume are marked above: that the crab does not restart each second under the pane's 1 s redraw,
and the `agent-pulse.<field>` row keys reaching `config.set` (already confirmed for `waypoints`, so expect it).
