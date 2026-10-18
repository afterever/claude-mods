# Waypoints 2.0: design notes

Waypoints 1.1 works: Claude plans with `mcp__waypoints__tasks`, the band, footer and pane draw the plan, and the
person confirmed all of it live. 2.0 changes how it *looks*, the way `agent-pulse` was made from
`whats-agent-doing`, and makes the pane come up by itself. No behaviour Claude sees changes.

This document is the spec for the build. A section marked **(builder's call)** was settled by the designer
without asking the person; everything else the person chose.

## What the person asked for

1. The right-hand pane should show automatically when a plan starts, with a setting (default on) to turn that off.
2. A nicer bar than one row of cyan `█░`, in the terminal and in Claude Desktop. (They also see the finished bar
   in red; 1.1 draws it with the theme key `green`, so their skin is probably remapping it. Fixed hex palettes
   remove the question.)
3. A better way to show the task list than a window of up to ~6 rows with `+n more`.

## Principles

Borrowed from `agent-pulse/DESIGN.md`, and they hold here too:

- **Every effect carries meaning.** The pulse says "this task is running", the sweep says "the plan is done".
  Nothing moves just to be busy.
- **The text stays text.** The header, the now/next rows and the pane's rows are `Text`: they truncate, screen
  readers and tests read them. The route is decoration beside the header's numbers, never the only place a fact
  lives.
- **Motion is opt-in by degree** (`off` / `subtle` / `full`); colour and shape are not motion and show at every level.
- **One look across the two mods.** By default Waypoints follows Agent-Pulse's palette and animation level, so
  the two bands never disagree. It still works alone.

## The band (terminal)

### Running

```
◎ Plan: Add band to Settings type…               3 of 6 · 44% · ~2m   all tasks g
●━━━━━━━━●━━━━●━━━━━━━━◉┄┄┄┄┄┄┄┄○┄┄┄┄○┄┄┄┄┄┄┄┄◎ +2
⠋ M  Tests: normalize, command, band on/off           ◆ reviewer · 1m
  next ○ S  README, version bump, marketplace.json
⏸ paused, waiting on you                              (only when it applies)
```

Row by row, top to bottom:

1. **Header.** Left: `◎ Goal:` or `◎ Plan:` and the title, truncated. Right: `n of N · pct%`, then ` · ~ETA` once
   `eta()` has one, then the existing `all tasks` button (hotkey `g`). Numbers in the palette's accent colour
   (see Colour roles), ETA dim. The `stats` row of 1.1 is gone; elapsed time moves to the pane.
2. **Route.** See "The route" below.
3. **Now.** One row per running task, at most 2, then `+n running` folded onto the second. Each row: a spinner
   (terminal `Client`; a still `◉` at `off`), size, title (bold, truncated), then on the right `◆ <by>` in the
   agent's colour when `by` is set, and ` · <running time>`. The running time turns amber (`heat[0]`) once it
   passes twice the plan's own pace for that size (pace = time since `planAt` / done weight, × the task's weight;
   only once `eta()` exists) **(builder's call)**. With no task running, this row shows the last finished task
   dimmed (`✓ M  title  1m`), so the band keeps its height between tasks.
4. **Next.** `next ○ <size>  <title>` for the first pending task, dim. Left out when nothing is pending.
5. **Notable (only when it applies).** One row, the first that holds, in this order:
   goal check not met (`warning` colour, `Goal check: not met yet: <reason>`), `interrupted`,
   `⏸ paused, waiting on you`. Otherwise no row.

`plan grew` becomes the dim `+k` after the route (k = live tasks − `firstPlan`). Agents running show as the `◆`
marks on the now rows; the 1.1 "n agents running" text is dropped from the band. Goal-check count moves to the pane.

**Room.** If `e.props.maxRows` is short, rows give way in this order: next, notable, now. Header and route stay.

### Planning (no plan yet)

Header (right side: `planning…`) and one dim row: a spinner and `Waiting for Claude's task plan…`, or 1.1's
"No plan yet: reminded Claude…" after the nudge. No route.

### Finished

When the goal finishes (`finishGoal`):

- **`full`:** for ~1.5 s the route row is a one-shot `Client` (keyed by goal id + `endedAt`) that sweeps the
  palette's `sparkle` colours along the route from start to end and leaves a `✦` on the last node.
- **`subtle` / `off`:** the route draws all solid in the `done` colour with `✦` on the last node, no motion.
- Either way the full band stays **8 s** after the finish, then collapses to one row for the rest of the
  `RECENT_MS`, which 2.0 shortens from 10 minutes to 3 (the person's call) **(builder's call: the 8 s)**:

```
✓ Plan: Add band to Settings type…                 6 tasks · done in 14m   all tasks g
```

`✓` in the `ok` outcome colour. A stopped goal collapses at once to `◎ Plan: <title>   stopped`.

### The route

One row and a fixed width: it is computed from `bodyColumns`, so it never needs to truncate.

- **Nodes and legs.** Node 0 (start) is `●`. Each live task (not dropped, not replaced) in id order is a **leg**
  and then the node at its end. A leg's length is proportional to `weight()` (S 1, M 2, L 3), at least 2 cells.
  The last node is `◎` (the destination).
- **By state:**
  - done leg `━` and end node `●`: the `done` role, shaded along the route (see below);
  - running leg `┄` dim, and the node at its **start** is `◉`, pulsing;
  - pending leg `┄` and node `○`: dim.

  Tasks finishing out of order (parallel agents) are fine: each leg draws its own state, and every running
  task's start node pulses.
- **Fit.** Width = `bodyColumns` minus the `+k` tail. If the legs cannot all get 2 cells, drop to 1 cell each.
  If even that does not fit (more than ~width/2 tasks), draw **dense mode**: one glyph per task (`●` done, `◉`
  running, `○` pending), no legs, ending in `…` if still too long.
- **The pulse.** Only the `◉` cells animate: a 1-cell `Client` per running node, cycling `shimmerOf(palette, 'tool')`
  (`subtle`); at `full` the glyph also breathes `◉ → ◎ → ◉`. At `off` it is a plain `Text` in the core colour.
- Everything else in the route is plain `Text`, one per run of same-coloured cells, so tests can read it.
- Layout lives in a **pure function** (`route.mjs`, below) that returns cells `{ ch, role, t }`; the drawing only
  colours them. That is what the tests exercise.

## The band (Desktop)

`e.surface !== 'terminal'` (Desktop and mobile; `Svg` draws empty on the terminal, see `agent-pulse/DESIGN.md`).
The header, now, next and notable rows are the same `Text`. The route row is one `Svg`:

- Width as in agent-pulse's strip (`clamp(140..640, bodyColumns × 8 − 40)`) **(builder's call)**, height 14 px.
- Done legs: a solid line with a `linearGradient` core → glow. Pending legs: dashed, dim. Nodes: circles, filled
  for done, a ring for pending, a double ring for the destination.
- Motion (CSS `@keyframes` in the SVG's `<style>`, plus `@media (prefers-reduced-motion: reduce)` in every SVG):
  `subtle` pulses the running node's glow; `full` also moves a small light along each running leg. On finish,
  `full` sweeps light along the route once and twinkles three stars at the last node.
- **The source must not change between redraws** unless the plan did (agent-pulse's rule: a new source restarts
  the CSS). No time, no ETA, nothing per tick in the SVG. A one-shot (the finish sweep) carries the goal id +
  `endedAt` in an id so it plays once.
- `alt`: `"3 of 6 tasks done, task 4 running"`.
- The now row's spinner is a still `◉` in the accent colour on Desktop; the motion lives in the SVG.

## The pane (`/waypoints`)

Opened by hand (`/waypoints`, `g`) as today, **and now automatically** (see below). Its layout:

```
◎ Plan: Add band to Settings type…
  3 of 6 · 44% · 4m elapsed · ~2m left (≈11:41am) · plan grew 4 → 6 · 1 goal check

  ● M  Parse /report settings band on|off       ▅▅▅▅▅▅ 1m
  ┃
  ● S  Band hook honours the setting            ▅▅ 30s
  ┃
  ● M  Settings type, defaults, normalize       ▅▅▅▅ 1m
  ┃
  ◉ M  Tests: normalize, command, band on/off   ◆ reviewer · running 1m
  ┆
  ○ S  README, version bump, marketplace.json
  ┆
  ◎ M  Validate, type-check, test, commit, push

Last goal check: not met yet: …

Other chats (2)
  agent-pulse: palette work     ●━●━◉┄○┄◎   60% · ~5m
  work-report: band setting     ●━●━●━●━✦   done ✓

auto: on · /waypoints hide|show · clear (stop the goal) · look & pane: /config → Waypoints
```

- **Trail.** One row per task (replaced tasks hidden, dropped ones shown dim with `×`, struck through, and the
  note). The node glyph and its colour follow the route's rules (the last task's node is `◎`). Between rows a
  connector: `┃` in the `done` colour below a finished task, `┆` dim otherwise.
  Connectors are left out when the plan has more than 10 tasks **(builder's call)**.
- **Timing.** A done task gets a duration bar `▅` (`doneAt − startedAt`), scaled so the longest done task is 12
  cells, in the `done` colour, then the duration. A running task gets `◆ by · running 3m`. The pane draws no
  `Client`; its running node is a still `◉`, and the existing 15 s tick redraws it.
- **Stats** take the old band stats line plus elapsed and goal-check count.
- **Other chats.** Each row: label and title, a **mini route** (2 cells per task: node + leg, ending with `◎`, or
  `✦` when done; one glyph per task when more than 12), then `pct% · ~ETA`, `done ✓`, `stopped` or `planning`.
  Coloured with the same roles.
- The last row shows `auto`'s state (not the word that would flip it), the commands, and points to `/config` for
  the look and the pane's opening. Past 100 data files, a row above it names the folder and `/waypoints prune`
  (2.1.0, see Pruning).

## Auto-opening the pane

- **Setting** `pane`: `auto` (default) or `off` (`userConfig`, see Settings).
- **When:** when a `plan` action succeeds and this goal had no plan before (its `planAt` was 0 before
  `applyAction` ran): `$.ui.open({ id: 'waypoints', title: 'Waypoints', closeOnEscape: true })`.
  Only then: never on `add`, `start`, `done`, and not on `/goal` before there is a plan.
- **No `focus`.** An unasked pane must never take the keys from the prompt, so `focus` is left out. (The first
  draft of this spec said `focus: false`; the host refuses that: `PaneOpenArgs.focus` is `true` or absent.)
- **Not twice:** skip when `$.ui.panes()` already lists `waypoints`.
- **Respect a close.** When `ui.close` for `waypoints` arrives with `e.origin.kind === 'person'`, remember the
  goal's `startedAt` (in memory) and do not auto-open again for that goal. A new goal or plan may auto-open again.
- **Narrow windows.** The engine only places an unasked pane at ≥144 columns (110 for a pane the person opened
  before and has not closed by hand); otherwise `ui.open` resolves `{ isPlaced: false }` and the pane waits
  undrawn until the window widens. Treat `isPlaced: false` silently: no toast (nobody asked). `g` and
  `/waypoints` still open it at any width.
- **Closing.** A pane that Waypoints opened automatically closes itself (`$.ui.close`) when the band leaves
  (`RECENT_MS` after the finish), unless the person opened it themselves in the meantime **(builder's call)**.
  A pane the person opened is never closed by the mod.
- **Is it open?** Replace the `paneOpen` module flag with `$.ui.panes()` (the engine's own record, which survives
  a reload); keep a cached boolean refreshed by `ui.close` and the 15 s tick if a per-draw await is a problem.
  `ui.close` with `origin.kind === 'unload'` must not count as the person closing it.

## Colour

### Palettes

`hooks/palette.mjs` holds a **copy** of `agent-pulse/hooks/palette.ts`'s four palettes (`ember`, `claude`, `neon`,
`mono`): `hex`, `glow`, `phase` (theme keys for `claude`/`mono`), `outcome`, `sparkle`, `heat`, `agents`, and the
helpers `paletteOf`, `levelOf`, `mix`, `shadeOf`, `shimmerOf`, `agentColorOf`, written as plain JS. A comment at
the top says the values are copied and must be kept in step with Agent-Pulse. A Waypoints test pins a few values
so a drift is a deliberate edit. A cross-mod import is not possible (each mod is installed alone).

### Colour roles

Waypoints draws with these roles, mapped onto Agent-Pulse's phase colours so a palette means the same in both
mods:

| Role | Used for | From the palette |
|---|---|---|
| `done` | done legs, done nodes, connectors, duration bars | `tool` core → `tool` glow, shaded along the route by position (cell index / route width) |
| `active` | the pulsing node, the spinner, header numbers (accent) | `shimmerOf(palette, 'tool')`; still: `phase.tool` |
| `pending` | pending legs and nodes, `next` row | `phase.idle` |
| `attention` | goal check not met, paused, interrupted | `phase.approval` |
| `ok` | `✓` of a finished goal, `done ✓` | `outcome.ok` |
| `sparkle` | finish sweep, `✦` | `sparkle[]` |
| agent | `◆ <by>` | `agentColorOf(palette, by)` (same colour Agent-Pulse gives that agent) |
| heat | a task running long | `heat[0]` |

For `claude` and `mono`, `hex === glow`, so `done` is flat and may be a theme key: that is expected (they follow
the theme). On the Desktop SVG always use `hex`/`glow`.

### Follow Agent-Pulse

Waypoints' `palette` and `animation` settings default to **`follow`**:

- `follow` resolves to Agent-Pulse's own value: read `$.config.list()` and take the row with key
  `agent-pulse.palette` (or `agent-pulse.animation`). If there is no such row (Agent-Pulse not installed or
  disabled), use `ember` / `subtle`.
- An explicit value (`ember`, `claude`, `neon`, `mono`; `off`, `subtle`, `full`) overrides the link.
- **When to resolve:** at `session.start`, on a `config.set` hook whose `key` is `agent-pulse.palette` or
  `agent-pulse.animation` (call `next`, then use the new value and invalidate), and on the existing 15 s tick as a
  fallback. The builder must confirm live that the row key really is `agent-pulse.<field>` and that another
  plugin's `/config` change reaches Waypoints' `config.set` hook; if it doesn't, the 15 s tick still catches it.

## Settings

Added to `waypoints/.claude-plugin/plugin.json` as `userConfig` (shown in `/config`; a change reloads the module,
and `session.start` runs again on a reload, as Arsenal relies on, so `restore()` reloads the plan from its file):

| Field | Title | Values | Default |
|---|---|---|---|
| `palette` | Palette | `follow`, `ember`, `claude`, `neon`, `mono` | `follow` |
| `animation` | Animation | `follow`, `off`, `subtle`, `full` | `follow` |
| `pane` | Pane | `auto`, `off` | `auto` |

`register(on)` becomes `register(on, options)`. The existing `/waypoints auto|hide|show|clear` commands and the
`$.store` setting behind `auto` are unchanged: they change behaviour, not the look. A `/goal` refuses file edits
until Claude has planned, always, unless the task tool did not register (2.1.0).

## Pruning (2.1.0)

Every chat that plans writes `~/.claude/mods-data/waypoints/<session>.json`, and nothing removed them. `$.fs` has no
delete, so `/waypoints prune` runs the host's own through `$.process.run` with an argv, no shell and no dialog:
`cmd /d /c del /f /q <paths>` on Windows (`OS` is `Windows_NT`), `rm -f -- <paths>` elsewhere. The person chose
this over Claude Code's Bash tool and its permission dialog: typing the command is the confirmation.

- **What goes** (`pickPrunable` in `prune.mjs`): other chats' finished goals that ended over an hour ago (the ones
  the pane no longer lists), any file untouched for 24 hours (`restore()` never loads one that old again), and an
  unreadable file once it is an hour old (younger, another chat may be writing it). Never this chat's file, never a
  running goal touched within the day. At most 200 a run, oldest first.
- **Each path is its own argv entry**, so a space or a quote in a name is just part of it. `cmd` still parses its
  line, so on Windows a path holding `& | < > ^ % ! "` runs nothing and the toast sends the person to the folder.
- **The toast counts the files really gone** (`$.fs.exists` after the run), never the files picked.
- **Seen live** (Windows 11, 2026-10-18, a throwaway probe mod): `cmd /d /c del /f /q` through `$.process.run`
  deleted `a.json` and `b c.json`, exit code 0.

What a reload loses (agent names, running-agent set, `hidden`, `nudged`, `pendingGoal`, the "person closed it"
memory) is acceptable; that was true of 1.1 too.

## Code layout (builder's call)

Stays plain JavaScript (`.mjs`), as 1.1 is; no TypeScript conversion. A `Client` module is any module file,
`.mjs` included, written with element calls (`surface.elements.Text({...})`) instead of JSX.

| File | What |
|---|---|
| `hooks/register.mjs` | Hooks only: state, tool, commands, settings resolution, auto-open. Drawing moves out. |
| `hooks/draw.mjs` | `drawBand`, `drawPane`, the rows; terminal and Desktop branches |
| `hooks/route.mjs` | Pure: `routeCells(tasks, width)` → `{ cells, dense }`; `miniRoute(g, maxTasks)` |
| `hooks/svg.mjs` | Pure: the Desktop route SVG source from the cells, palette and level |
| `hooks/pulse.mjs` | The terminal `Client`: `spin` (spinner or node pulse) and `sweep` (finish) |
| `hooks/pane.mjs` | Pure: when the pane opens and closes by itself (`createAutoPane`). The test engine cannot raise a `ui.close` with an origin, so the person/plugin/unload rules are tested here |
| `hooks/palette.mjs` | Palettes and helpers copied from Agent-Pulse, the role map, `resolveLook(options, configRows)` |
| `hooks/plan.mjs`, `fmt.mjs`, `privacy.mjs` | Unchanged (a helper may be added to `fmt.mjs` for durations) |

Module state that a drawing reads can stay in module variables as in 1.1 (the plan reloads from its file).

## Left alone on purpose

- **The tool contract.** `TOOL_SPEC`, `instruction()`, `standing()`, `nudge()`, `strictDeny()`: not touched, so
  Claude plans exactly as in 1.1 (2.1.0 only took the option's name out of `strictDeny()`'s words).
- **The data file** (`~/.claude/mods-data/waypoints/<session>.json`): same fields; other chats running 1.1 still
  read and draw.
- **The footer** (`SessionMode`): still `◎ plan 44% · ~2m`. It is a plain label; no colour to add. On the terminal it is
  appended to `modes`. Desktop does not draw the labels in `modes` (seen 2026-10-18, with a plan running and its band
  up: the footer held only `Auto`, Arsenal and the model), only a tree, so from 2.0.3 the label there is a `Text` in a
  `Box` around `await next(e)`, as Arsenal's launcher and ctx's footer do. The band draws the plan on Desktop, so the
  tree shows only while `bandUp()` is false (`/waypoints hide`, or a goal that ended long ago). A hook cannot see the
  engine's own collapse of the band (ctrl+x ctrl+a), so that case stays unlabelled. Seen live on Desktop (2026-10-18, 2.0.3): with a plan and with a `/goal`, `/waypoints hide` puts the label in the footer and `show` takes it out.
- **Privacy.** Every new string that shows a title, a note, a `by` name or a check reason goes through `mask(...)`,
  including the SVG's `alt`.
- **Band order.** Still `[mine, below]`, and `props.hasSurvey` still returns `below` untouched.
- **The goal-check reading** (`lastGoalStatus`, `onCheck`) and the `/goal` flow.

## Tests

Keep the existing 12. Add, with `claude plugin test waypoints`:

- **route:** leg lengths follow S/M/L; minimum 2 cells, then 1; dense mode past the width; running node at the
  start of its leg; out-of-order done; dropped/replaced left out; last node `◎`.
- **palette / follow:** `follow` with an `agent-pulse.palette` row → that palette; with no row → `ember`; an
  explicit value wins; same for animation.
- **band rows:** header right side with and without ETA; now row with `by` and with nothing running (last done);
  next row; notable row priority; `+k` when the plan grew; rows give way under a small `maxRows`; finished →
  route for 8 s then the single summary row; `hasSurvey` still returns `below`.
- **auto-open:** the first `plan` opens the pane without `focus`; a second `plan` or `add` does not; `pane: off`
  never opens; a person's close (`origin.kind: 'person'`) stops it for that goal, a new goal opens again; an
  `unload` close does not count.
- **masking:** with Recording Mode on, titles in the now/next rows, the pane trail and the SVG `alt` are masked.

Each negative test sits beside a positive one. Things the 1.1 session tripped on in the test kit:

- The test's `on(...)` hooks stand for the engine, and a noun call needs one: `session.start`, `session.id`,
  `session.cwd`, `fs.exists/write/list`, `tool.register`, `command.register`, `ui.log`, `ui.toast` (and now
  `ui.open`, `ui.close`, `ui.panes`, `config.list`). Answers to a noun call are `{ value: ... }`.
- `$.prompt.compose(...)` needs the whole input (`model`, `promptModel`, `surfaces`, `tools`, `outputStyle`,
  `traits`). With less, the engine skips the hook, and a "returns nothing" test then passes for the wrong reason.
- `claude plugin test` runs `*.test.ts` against the real engine; a `.test.ts` importing a `.mjs` file needs
  `// @ts-ignore` for the missing types.
- Mods do not hot-reload from the installed copy. Expect two copies registering the same tool and `/waypoints`
  if the installed one is on while loading with `--plugin-dir`; disable it first.

## Checking it live

Load with `claude --plugin-dir E:\github\claude-mods\waypoints` with the installed copy disabled. The person
looks; the builder lists what to look at:

1. Terminal ≥ 144 columns: ask for a 6-task plan. The pane opens on the right **without** taking the cursor; the
   band shows header, route, now, next; the running node pulses; the band height stays steady between tasks.
2. Terminal ~100 columns: the pane does not appear; `g` opens it.
3. Close the pane with Esc mid-plan: it stays closed for that plan; a new plan opens it again.
4. `/config` → Waypoints → Pane `off`: a new plan opens nothing.
5. With Agent-Pulse installed: change its palette in `/config`; Waypoints recolours (within 15 s at worst).
   Set Waypoints' own palette explicitly; it stops following. Disable Agent-Pulse: `follow` falls back to `ember`.
6. Animation `off` / `subtle` / `full`: nothing moves / pulse only / pulse + breathing + finish sweep.
7. Finish a plan: sweep (full), 8 s, then the single summary row; the auto-opened pane closes 3 minutes after the finish.
8. Desktop app: the SVG route, its pulse, no restart of the animation every 15 s, the finish sweep once.
9. Recording Mode on: titles masked everywhere, the SVG `alt` included.
10. A plan of 20+ tasks in an 80-column window: dense route, no wrap.

## Shipping

On a branch `waypoints-2.0`: this DESIGN.md as the first commit, then the code. Version **2.0.0** in
`plugin.json` (a new look and new settings) **(builder's call)**. Update `waypoints/README.md` (settings, the new
look), the marketplace entry, the root `README.md` and `SETUP.md` in the same change. Pull request, as for 1.1.
Run `claude plugin validate waypoints`, `claude plugin validate .` and `claude plugin test waypoints` before the PR.

## What a smaller model can build without more questions

All of it, in this order: `palette.mjs` + tests → `route.mjs` + tests → `draw.mjs` terminal band → pane →
auto-open + settings → `pulse.mjs` → `svg.mjs` (Desktop) → docs. The two facts to confirm live rather than assume
are marked above: the `agent-pulse.<field>` row key and `config.set` reaching Waypoints for another plugin's
change. If either fails, fall back as described and note it in the PR.
