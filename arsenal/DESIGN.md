# arsenal: design notes

The design was worked out and probed in a live session (Opus 5.5, 2026-10-17) before any code was
written. Everything marked **verified** was seen working in that session; everything else is a
reading of the API types and should be checked as it is built.

## The problem

Two of the mods in this repo are *tools* the person reaches for: prompt-upgrade (`/better`) and
work-report (`/report`). The other three (ctx, subagent-progress, agent-pulse) mostly *show
progress* and already live in the band above the prompt. To use a tool, you have to remember its
slash command and its arguments (`/better on`, `/better history`, `/report week`,
`/report settings`).

The idea comes from a YouTube video by Tristen O'Brien (https://tristenobrien.ai/), who also gave
us the idea for prompt-upgrade. In it, a button labelled "Tristen's Tools ▼" in the footer under
the prompt opens a framed menu with a header, a SETTINGS section of on/off rows and a LAUNCH
section of shortcuts. arsenal is that menu for the tools in this repo. Its name is deliberately
not a person's name.

## Principles

- **A remote control, not an owner.** Every row ends in a slash command that the tool already
  has. arsenal never writes another mod's `$.state` (the engine refuses that anyway) and never
  imports another mod's code. If you uninstall a tool, its rows disappear.
- **Never changes the model or effort.** The person never switches model or effort mid-session,
  so arsenal has no model or effort picker, no "auto model" and no subagent model setting. The
  header shows the model and effort in use, and that is all: arsenal only watches, it never
  rewrites.
- **The status mods keep their bands.** ctx, subagent-progress and agent-pulse are not in the
  menu. arsenal draws its launcher after their bands (`await next(e)` first), so it hides none of
  them.
- **Quiet when closed.** All it shows when closed is one button, the band's last row.

## Where it draws (as released in 0.1.0, verified live)

> **Superseded in 0.3.0.** The launcher no longer sits in the band: it moved to the prompt footer
> (`SessionMode`). This section, and "Staying the band's last row" below, are the 0.1.0 and 0.2.0
> design. Why it moved and how it draws now: "0.3.0: the launcher moves to the footer".

```
   (ctx / cache-keeper / work-report / agent-pulse … bands, drawn by next(e))
                                   [ ◆ Arsenal ▾ ]   ← (1) AbovePrompt band: the launcher, last row
 ──────────────────────────────────────────────
 > the prompt box                                     ┌ Arsenal ───────┐
 ──────────────────────────────────────────────       │ ◆ A R S E N A L│ ← (2) Pane: the menu,
 [Opus 5.5 ◑ high] | …                                │ …              │   docked right in
 … (claude-hud statusLine rows)                       └────────────────┘   fullscreen
 ⏵⏵ auto mode on (shift+tab to cycle)            ← PromptHint: left to the engine
```

- **The `statusLine` is not the place.** It is a shell command set in `settings.json` (claude-hud
  owns it here), it only prints text, and it has no click handlers.
- **Nothing a mod draws can sit between the prompt box and the statusLine.** The engine has 15
  render sites (`RenderComponent`) and none is there. `$.ui.status` lines are text only and are
  drawn at the very bottom.
- **The launcher is the last row of the `AbovePrompt` band**, right against the prompt box's top
  rule. The design first put it on the hint line (`PromptHint`), and the probe showed that works
  and can be clicked. In the live check, though, the hint line sits under the 10 rows of
  claude-hud's statusLine, and the engine hands the hint over as an opaque node
  (`{ type: 'engine', ref: 1 }`), so the button wrapped onto a row of its own at the very bottom
  of the terminal. See "The live check" below.
- **The menu is a `Pane`** (`$.ui.open({ id: 'arsenal' })`), docked on the right in fullscreen
  like ctx's, prompt-upgrade's and work-report's panes, and placed above the prompt otherwise. The
  design first drew it in the band. That put it in the middle of the screen, between the
  transcript and the prompt, unlike the person's other mods.

## The menu

```
┌ Arsenal ─────────────────────────────────┐
│ ◆  A R S E N A L          Opus 5.5 · High │
│ ──────────────────────────────────────── │
│ ── S E T T I N G S                       │
│ ○ Prompt Upgrade                ○ Off    │
│   upgrade every prompt first             │
│ ── L A U N C H                           │
│ u: ✦ Upgrade a prompt                    │
│ h: ◷ Prompt history                      │
│ t: ▤ Today's report                      │
│ w: ▥ This week's report                  │
│ s: ⚙ Report settings                     │
│ ran: /better off                         │
└──────────────────────────────────────────┘
```

The pane asks for 48 columns, which gives one Launch column. From 64 columns (a dock the person
dragged wider) the Launch rows split into two columns.

### Header

- `◆  A R S E N A L` (bold, letter-spaced) on the left, `<Model> · <Effort>` on the right (dim),
  and a rule under it.
- **Model:** at `session.start`, and again each time the menu opens, read `$.session.model()` (doc:
  "the main loop's model, as `/model` shows it"). On every `turn.step` of the main loop (no
  `e.agentId`), take `e.model`, the resolved id such as `claude-opus-5-5`. A pure function
  `modelLabel(raw)` turns both forms into `Opus 5.5` (`claude-opus-5-5` → `Opus 5.5`,
  `claude-fable-5-1` → `Fable 5.1`, `claude-sonnet-5-5[1m]` → `Sonnet 5.5`, an alias such as
  `opus` → `Opus`; anything it does not recognise is shown as given).
- **Effort:** effort is not a `/config` row (**verified**: no `effort` key among the 49 rows).
  It reaches a mod only as `e.effort` on `turn.step` (the session's setting or the model's default,
  absent for a model without effort). Remember the last main-loop value in state.
  `effortLabel`: `low` → `Low`, `medium` → `Medium`, `high` → `High`, `xhigh` → `XHigh`,
  `max` → `Max`, a number `n` → `effort n`. Until the first request of the session, or for a model
  without effort, show the model alone.
- The `turn.step` hook must only read: it passes `e` down unchanged (`return yield* next(e)`), so it never alters the request.

### SETTINGS

One row for now:

| Row | Description | Reads | Press does |
|---|---|---|---|
| Prompt Upgrade | upgrade every prompt first | `prompt-upgrade.auto` via `$.state.get` | `$.command.run({ command: 'better', args: on ? 'off' : 'on' })` |

- The row has a `●`/`○` dot, then the name (bold), then a dim description, then a pill at the
  right end: `● On` (teal background) or `○ Off` (dim background), like the reference screenshot.
- **Verified:** another mod can read `prompt-upgrade.auto` (`{ value: false, version: 1 }`), and
  `$.command.run({ command: 'better', args: 'on' | 'off' })` flips it (the transcript said
  "Automatic upgrades are on/off"). Reading it while drawing subscribes the band, so the pill
  redraws by itself once prompt-upgrade writes the new value. Do not set the pill optimistically.
- `$.command.run` writes the command's output into the transcript
  (`prompt-upgrade: Automatic upgrades are on…`). That is fine and serves as the confirmation.

### LAUNCH

| Glyph | Label | Runs | Closes the menu |
|---|---|---|---|
| ✦ | Upgrade a prompt | `/better` (opens its compose box) | yes |
| ◷ | Prompt history | `/better history` | yes |
| ▤ | Today's report | `/report today` | yes |
| ▥ | This week's report | `/report week` | yes |
| ⚙ | Report settings | `/report settings` | yes |

- `/report` takes `[today | week | month | year | settings]` (**verified** in work-report's
  `register.tsx`).
- Two columns, prompt-upgrade items on the left and work-report items on the right, when
  `e.props.bodyColumns >= 64`. Below that, one column.
- `$.command.run` is "queued and run once the session is idle". A Launch press during a turn
  therefore closes the menu, and the tool opens once the turn ends. (0.1.0 as built by Sonnet
  kept the menu open with a `queued:` note during a turn. A `Pane` has no `isWorking` prop, so
  the note went when the menu became a pane.)

### Which rows show

At `session.start`, read `$.command.list()` (**verified**: it returns all 212 names, `better` and
`report` among them) and keep only the rows whose command exists. A section left with no rows is
not drawn. If no rows are left at all, the launcher is not drawn either, and `/arsenal` opens
nothing.

### Opening and closing

- The launcher toggles the pane: label `◆ Arsenal ▾` when closed, `◆ Arsenal ▴` when open,
  `variant="primary"`.
- `/arsenal` toggles it too, for the keyboard (registered in `session.start`, answered in a
  `command.run` hook with `{ command: 'arsenal' }`, `immediate: true` so it works mid-turn).
- A Launch row closes the pane **first** and then runs its command, so the tool's own pane takes
  the dock rather than opening as a second tab. A failure is then a toast. The Prompt Upgrade
  switch keeps the pane open and writes `sent: /better on`, then `ran: /better on` (or why it
  failed) in the note line.
- The pane's own close mark, Esc (`closeOnEscape`) and ctrl+x x close it. A `ui.close` hook turns
  the launcher's arrow back down for any close but an `unload`. If the surface cannot place the
  pane, the arrow stays down and a toast says "Arsenal needs a wider window to open."
- Hotkeys while the pane is focused: `p` Prompt Upgrade toggle, `u` upgrade, `h` history,
  `t` today, `w` week, `s` settings.
- The launcher yields to a survey (`e.props.hasSurvey`): it returns `next(e)` untouched.
- `isOpen` is session state, not saved in `$.store`. A new session starts with the menu closed.
  `session.start` also runs on a hot reload, so it reads `isOpen` from `$.ui.panes()`: a pane left
  open by the reload keeps its arrow up.

### Staying the band's last row

*(Historical since 0.3.0: arsenal no longer draws in the band. The habit below is still the right one
for any band mod in this repo, so none of them lands under another mod's row.)*

No API lets a plugin choose where its hook sits in the `AbovePrompt` chain. Each hook only decides
where the tree of the plugins beneath it (`await next(e)`) goes in its own tree. So the launcher is
last exactly when every band mod above arsenal in the chain draws its own rows first and `next(e)`
after them. On 2026-10-17 all seven other installed band mods did: ctx, subagent-progress,
agent-pulse, work-report (this repo), skins, cache-keeper and goal-meter (`[mine, below]`).

- A band mod that follows that rule never lands under the launcher, whether the engine seats it
  above arsenal (its rows, then arsenal's tree, launcher last) or beneath it (inside arsenal's
  `below`).
- A mod that draws `next(e)` first and its own rows after can land under the launcher, if it is
  seated above arsenal. **Every new band mod in this repo draws its own rows first.**
- `render.test.ts` checks arsenal's side: its launcher comes after the tree beneath it.

## Architecture

### Files

```
arsenal/
  .claude-plugin/plugin.json   name, version 0.1.0, description, author afterever, MIT, types
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           the hooks: session.start, command.register, turn.step, command.run, ui.close, ui.render (band, pane)
  hooks/menu.ts                pure: rows from the command list, labels, layout columns
  hooks/menu.test.ts           unit tests of menu.ts
  hooks/render.test.ts         the hooks in the engine's test kit (see Testing)
  types/index.d.ts             the $.state contract
  tsconfig.json                { "extends": "./.claude-plugin/types/tsconfig.json" }  (engine-written, git-ignored)
  README.md                    in the style of the other mods' READMEs
  DESIGN.md                    this file
```

### State (the contract, `types/index.d.ts`)

```ts
/** The model and effort the main loop last ran, as the header shows them. */
export type ArsenalRunning = { model: string; effort: string | null }

/** Which tools this session has, from $.command.list() at session start. */
export type ArsenalTools = { better: boolean; report: boolean }

declare module 'claude-code' {
  interface PluginState {
    arsenal: {
      isOpen: boolean
      running: ArsenalRunning | null
      tools: ArsenalTools
      /** One line under the menu: what the switch sent or ran, or why a press failed. */
      note: string
    }
  }
}
```

A contract may export types and nothing else. `export {}` fails `claude plugin validate`
(**verified**).

### Reading another mod's state

`prompt-upgrade.auto` is not in arsenal's contract. There are two ways to read it:

1. List `"dependencies": ["prompt-upgrade"]` in `plugin.json`. The engine then lays
   prompt-upgrade's contract into `.claude-plugin/types/prompt-upgrade/` and the read is typed.
   **Check first:** does a missing dependency stop arsenal from loading? If it does, do not use
   this, because arsenal must still work without prompt-upgrade.
2. What the probe did: `($.state.get as any)({ plugin: 'prompt-upgrade', key: 'auto' })` inside
   a `try`, treating anything but `value === true` as off. Validate reports it as "state of other
   plugins, not checked", which is a note, not an error.

### Events

| Event | What arsenal does |
|---|---|
| `session.start` | register `/arsenal`, read `$.command.list()` into `tools`, read `$.session.model()` into `running`, set `isOpen` from `$.ui.panes()` |
| `turn.step` | main loop only (no `e.agentId`): update `running` from `e.model` / `e.effort`, then `return yield* next(e)` unchanged (it is a streaming event: an `async function*`) |
| `command.register` | `await next(e)`, then mark `better` / `report` present in `tools` if that is the command registered |
| `command.run` `{ command: 'arsenal' }` | toggle the pane, answer `{}` |
| `ui.close` | for `arsenal`, any origin but `unload`: `isOpen` false |
| `ui.render` `AbovePrompt` | `hasSurvey` or no rows → `next(e)`; else `await next(e)`, then the launcher row |
| `ui.render` `Pane` `{ requestId: 'arsenal' }` | the menu, at the pane's `bodyColumns` |

Both draw the same on `desktop`. There is no `Svg` version for 0.1.0.

## The probe that proved it (reference code)

This ran as a dev mod (`toolbox-probe`) in the design session. The footer button showed and could
be clicked, the band opened, and `/better on|off` worked from the buttons. Its PromptHint and
AbovePrompt hooks are the starting point:

```tsx
on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
  const line = await next(e)
  const { Box, Button } = $.ui.resolve(e)
  const open = await read($, isOpen)
  return (
    <Box flexDirection="row" justifyContent="space-between">
      {line}
      <Button key="toolbox" label={open ? '◆ ToolBox ▲' : '◆ ToolBox ▼'} onPress={() => update($, isOpen, v => !v)} />
    </Box>
  )
})

on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  if (e.props.hasSurvey || !(await read($, isOpen))) return next(e)
  const below = await next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text bold color="yellow">◆ T O O L B O X</Text>
        {/* rows; each Button's onPress runs $.command.run({ command, args }) */}
      </Box>
      {below}
    </Box>
  )
})

async function run($: EngineInterface, command: string, args: string) {
  try {
    const r = await $.command.run({ command, args })
    await update($, note, () => `/${command} ${args}: ${(r.text ?? '').slice(0, 80) || 'ok'}`)
  } catch (err) {
    await update($, note, () => `/${command} ${args} failed: ${String(err).slice(0, 80)}`)
  }
}
```

The probe's `session.start` dump also found: surfaces `['terminal']`, 49 `/config` rows (`model`
is one, value `opus`; there is no effort row), and 212 commands including `better`, `report`,
`model`, `effort` and `ctx`.

## Testing

- **Unit tests** (`menu.test.ts`) cover `modelLabel` (ids, `[1m]` suffix, aliases, unknown
  input), `effortLabel` (each level, a number, absent), the row list for each combination of
  `better` and `report` being present, and the switch from two columns to one at 64.
- **Render tests** (`render.test.ts`) run the hooks in the engine's test kit, the way ctx's and
  work-report's do, and check that:
  - the band is the plugins-beneath tree, then the launcher, in that order, and the hint line is
    left to the engine;
  - the launcher opens and closes the pane (`ui.open` / `ui.close`), and so does `/arsenal`;
  - an unplaced pane leaves the arrow down with a toast, and a pane left open by a hot reload
    keeps it up;
  - `hasSurvey` yields;
  - a Launch press closes the pane, then calls `command.run` with the right command and args;
  - the Prompt Upgrade pill follows `prompt-upgrade.auto`;
  - `turn.step` with an `agentId` changes nothing, and without one updates the header;
  - `turn.step` passes `e` on unchanged.
- **Live check** (`claude --plugin-dir arsenal`): the launcher is the last row above the prompt
  box. It opens the pane docked right, and the pane closes from the launcher, `/arsenal`, Esc
  and its close mark. Toggle Prompt Upgrade and watch the pill follow. Run every Launch item.
  Check that the other mods' bands stay above the launcher.

Before release: `claude plugin test arsenal`, `claude plugin validate arsenal`, and
`tsc -p arsenal` (once the engine has laid `.claude-plugin/types/`).

## Shipping 0.1.0 (repo checklist)

This is a new mod, so it goes on a branch and through a PR (repo `CLAUDE.md`). The branch
`arsenal` already exists and holds this file.

1. The mod files above. `plugin.json` matches the others: `author: { name: "afterever" }`,
   `license: "MIT"`, `types: "./types/index.d.ts"`.
2. Add an entry to `.claude-plugin/marketplace.json`, ending its description with "Idea from
   https://tristenobrien.ai/." as prompt-upgrade's entry does.
3. Add `arsenal/.claude-plugin/types/` to the root `.gitignore`.
4. Root `README.md`: add arsenal to the list of mods.
5. `SETUP.md`: add a row to "Mods at a glance", an `claude plugin install arsenal@afterever-mods`
   line under Install, and an `## arsenal` section. The section notes that arsenal needs
   prompt-upgrade and/or work-report to show any rows.
6. PR titled like the earlier ones ("Add arsenal 0.1.0: …").

## Open questions, settled while building 0.1.0

Settled on 2026-10-17 (Sonnet 5.5), with a throwaway probe mod run headlessly
(`claude -p "/probe" --plugin-dir …`, which answers a plugin's slash command without a model call) and
by reading the API types.

- **What does `$.session.model()` return?** A **resolved id**, never an alias. Started with
  `--model opus` it gave `claude-opus-5-5`; with `--model sonnet[1m]` it gave `claude-sonnet-5-5[1m]`;
  with no flag, the session's default in the same form. So `modelLabel` strips `[1m]` and turns the id
  into `Opus 5.5`. It still accepts an alias (`opus` → `Opus`), because that costs one line and the
  `/config` row for `model` holds one. `reconcile` treats an alias and an id of one family as the same
  model, so opening the menu does not throw away the effort of the last request.
- **Does a `dependencies` entry for an uninstalled plugin block loading?** **Yes.** With
  `"dependencies": ["no-such-plugin-xyz"]` the plugin did not load (`/arsenal` was absent from
  `$.command.list()` and its state stayed at version 0); the same copy without the entry loaded.
  arsenal therefore declares no dependency and reads `prompt-upgrade.auto` the second way, inside a
  `try`. Validate lists it as "state of other plugins, not checked", which is a note, not an error.
- **Does a `Button` in `PromptHint` accept `backgroundColor`?** **No.** `ButtonProps` has no colour
  props, only `variant`, `plain`, `dimColor` and `hover`. The footer button is `variant="primary"`
  (the surface draws it in its accent colour; the orange of the reference is not reachable). The
  `● On` / `○ Off` pill is a `Text` with `backgroundColor`, given as the *child* of a `plain`
  `Button`, which the types allow ("children of strings and `Text`").
- **Does a Launch item that opens a pane work when the session is narrow?** Not tested in a live
  terminal (it needs the TUI). Read from the code: both tools handle it themselves.
  prompt-upgrade toasts "Prompt Upgrade needs a wider window. Your prompt is back in the box." and
  work-report toasts "Work Report needs a wider window to open." when `$.ui.open` is not placed.
  arsenal runs the command and adds nothing, as designed. Part of the live check below.

### What building changed in this design

- **`turn.step` streams.** Its hook is an `async function*` that ends in `return yield* next(e)`;
  a plain `return next(e)` is a type error. arsenal's hook reads `e.model` and `e.effort` before
  `yield*` and passes `e` down unchanged.
- **The tools are read twice.** `$.command.list()` at `session.start` can run before a tool's own
  `session.start` has registered its command, so a `command.register` hook (`await next(e)`, then
  mark `better` or `report` present) keeps `tools` current. In the headless probe `tools` was written
  three times and ended `{ better: true, report: true }`.
- **Launch rows during a turn keep the menu open.** The design closed the menu on every Launch press
  and also wanted a `queued:` note in the menu, which cannot both be seen. Now: with the session
  idle the menu closes first (a failure then is a toast, because the note is out of view); during a
  turn it stays open with `queued: /report today` and closes once the command has run. The Prompt
  Upgrade switch never closes it.
- **A model change since the last request drops the effort.** Each time the menu opens, `reconcile`
  compares `$.session.model()` with the last `turn.step`. Same model: keep model and effort.
  Another model: show `/model`'s answer alone, because the effort of the old model means nothing.
- **Button keys are unique.** The settings section's `Box` and the Report settings button were both
  `arsenal-settings`, which made `find` return the Box; the Box is `arsenal-settings-section`.
- **`$.state.get` must be called on its noun** (`($.state as any).get(…)`), not detached
  (`const get = $.state.get`), or it loses its receiver. In the test kit a `state.get` hook answers
  `{ value: { value, version } }`: the outer `value` is the op wrapper that `$.state.get` unwraps.
- **A hook that throws is skipped, not turned into a rejection.** To test a failing
  `$.command.run`, leave `command.run` unanswered; the engine then rejects with "no implementation".
- **The test kit's `$` has no `command.register`**, so the late-registration hook is covered by
  `claude plugin validate` and the live check, not by `render.test.ts`.
- **`tsconfig.json` is the engine's file** (written when it loads a mod) and is git-ignored with
  `.claude-plugin/types/`, as in the other mods.
- **Plain Buttons draw their hotkey** (`u: ✦ Upgrade a prompt`), per the `plain` prop's doc. Not seen
  on screen yet; check the width of the two columns in the live pass.

### The live check (2026-10-17, Opus 5.5, hot-reloaded in the design session)

The tests drive the engine's own hooks and trees, but "the kit exercises the plugin's hooks and the
description they return, not any surface's paint". So the person ran it in a real terminal
(fullscreen, claude-hud as statusLine, the other mods of this repo plus skins, cache-keeper and
goal-meter installed).

- **Seen working:** the Prompt Upgrade pill follows `/better on|off` both ways; every Launch row
  opens the right pane; the header says `Opus 5.5`; the status mods' bands stay in view.
- **The button moved from the hint line to the band.** On the hint line the button drew on a row
  of its own at the very bottom of the terminal, under the 10 rows of claude-hud and under
  "auto mode on". A dump of the `PromptHint` hook showed why: the engine hands its hint over as an
  opaque `{ type: 'engine', ref: 1 }` (props `hint: "(shift+tab to cycle)"`), so a row of
  `[line, Button]` cannot share the engine's row. The person wanted the button next to the prompt
  box. The band's last row is the only clickable site that touches it.
- **The menu moved from the band to a docked pane.** Drawn in the band, the open menu sat in the
  middle of the screen. The person's other mods open docked panes on the right, so arsenal does
  too. With that, the band's `✕` and the menu's own border went (the pane's frame and close mark
  replace them), and so did the `queued:` note (see LAUNCH).
- **Not unit-tested:** the kit's `$` has no `ui.close` at run time (the types declare it), so the
  arrow turning back after Esc rests on the same hook ctx ships, and on the live check.

## 0.2.0: the person's own commands (USER and PROJECT)

Designed on 2026-10-18 (Opus 5.5) in conversation with the person. Nothing in this section is
built yet. **Read** means read from the engine's API types (`.claude-plugin/types/claude-code/`),
not run, except in "Settled while building 0.2.0", which a probe answered.

### The problem

LAUNCH holds five rows written into `menu.ts`. The person also has their own skills and slash
commands: `/handoff` on the home PC, about ten on the work PC. They want those in arsenal without
editing arsenal for each machine, but not necessarily all of them.

### Goals, non-goals, anti-goals

**Goals**

- Two new sections under LAUNCH:
  - **USER**: the skills and commands in `~/.claude/skills/` and `~/.claude/commands/`.
  - **PROJECT**: the ones in the current project's `.claude/skills/` and `.claude/commands/`.
- Every command found is shown by default. Each section has an **edit mode** that turns single
  commands off and on again. What is off is remembered on this machine across sessions.
- A press runs the command bare, as if `/handoff` were typed. A row whose command takes arguments
  also has a `…` that puts `/handoff ` in the prompt box for the person to finish.

**Non-goals**

- Skills and commands from plugins (`source: 'plugin'`, the 200-odd from superpowers, claude-mem and
  so on), built-ins and MCP prompts.
- Hotkeys on USER and PROJECT rows. LAUNCH keeps its own.
- Any change to SETTINGS or LAUNCH.
- Folding or scrolling a long section. A tall docked pane is fine (the person said so).
- Choice buttons parsed from an argument hint, and a text box inside the pane.

**Anti-goals** (it would be a failure even if it worked)

- A row that does nothing when pressed: a file in the folder that the engine did not load (bad
  frontmatter, `user-invocable: false`).
- arsenal writing to the skill or command files.
- Running a command with arguments arsenal made up.

### The menu

```
┌ Arsenal ─────────────────────────────────┐
│ ◆  A R S E N A L          Opus 5.5 · High │
│ ──────────────────────────────────────── │
│ ── S E T T I N G S                       │
│ ○ Prompt Upgrade                ○ Off    │
│   upgrade every prompt first             │
│ ── L A U N C H                           │
│ u: ✦ Upgrade a prompt                    │
│ …                                        │
│ ── U S E R                      ✎ edit   │
│ /handoff   Use when the user in…    …    │
│ /standup   Yesterday's work              │
│ ── P R O J E C T                ✎ edit   │
│ /seed-db   Reset the local data…         │
│ ran: /better off                         │
└──────────────────────────────────────────┘
```

Edit mode, for one section at a time:

```
│ ── U S E R                      ✓ done   │
│ /deploy-check                 ○ Off      │
│ /handoff                      ● On       │
│ /standup                      ● On       │
```

- **Rows:** a `plain` Button with no `hotkey`, labelled `/name`, then the command's description,
  dim and clipped with `…` to the room left. Sorted by name. Always one column, at any width:
  the descriptions need the room.
- **`…`:** a second `plain` Button at the right end of a row, only when the command has an
  `argument-hint`.
- **Section header:** `sectionTitle('USER')` on the left and a `plain` Button `✎ edit` (or `✓ done`
  in edit mode) on the right, as the SETTINGS row lays out its name and pill.
- **Edit mode:** shows every command in the section, including the ones that are off. Each has the
  pill the Prompt Upgrade switch uses (`● On` teal, `○ Off` dim). A press flips it at once and
  saves it. `✓ done` is only the way back: nothing waits for it. In edit mode, rows run nothing.
  Opening edit mode in one section closes it in the other.
- **When a section is drawn:** only when it found at least one command. A section whose commands
  are all off is still drawn, with its header (so `✎ edit` can turn them back on) and one dim line
  `all off`. Otherwise there would be no way back.
- **The launcher and `/arsenal`** now show when there is anything to show: a tool for LAUNCH, *or*
  a USER or PROJECT command found, even if every one of them is off (edit mode must stay
  reachable). 0.1.0 needed `better` or `report`.
- **Height:** docked, the pane takes the dock's height and the `rows` request is ignored (read in
  `PaneOpenArgs.rows`). Placed above the prompt, `openMenu` asks for as many rows as the menu has
  lines, computed by a pure function, because the fixed 14 no longer fits.

### Presses

| Press | Does |
|---|---|
| a row | `press($, name, '', true)`, the path LAUNCH rows take: close the menu, run bare, toast a failure |
| `…` | close the menu, then `$.prompt.read()`. Box empty: `$.prompt.fill({ text: '/name ' })`. Box holds a draft: leave it alone and toast "Clear the prompt box to fill /name." `isFilled: false`: toast "Could not fill the prompt box." |
| `✎ edit` / `✓ done` | set `editing` to the section, or to `null` |
| a pill in edit mode | flip the name in the section's off list, in state and in `$.store` |

The `…` never replaces a draft the person typed. Treating the draft as the command's arguments was
considered and turned down: it surprises the person.

### Finding the commands

A pure module `hooks/own.ts` (tested in `hooks/own.test.ts`) holds the parsing and sorting.
`register.tsx` does the reading.

1. **Where:** home is `$.env.get('USERPROFILE')`, else `$.env.get('HOME')`. Both names are
   literals, as `$.env.get` requires (read). This is a Windows machine, where `HOME` is often
   unset. **The project is the repo** (the person's choice, 2026-10-18), so it is worked out with
   two `$.process.run` calls run from `$.session.root()`. Use `root()` rather than `cwd()`
   because it follows `/cd` and worktree moves (read):
   - `git rev-parse --show-toplevel`: the folder to scan, which is this checkout's own top level.
     Each worktree has its own copy of `.claude/`, so a session in a worktree scans that copy.
   - `git rev-parse --path-format=absolute --git-common-dir`: the **project key**. Every worktree of
     one repo shares this `.git` folder, and so does every subfolder. A command turned off in the
     main checkout is therefore off in each of its worktrees too.
   - **Not a git repo** (a non-zero exit, git missing, or a rejection): `root()` is both the folder
     to scan and the key.
   - The PROJECT folder and the key are worked out **again on every scan** (session start and each
     time the menu opens), so a `/cd` or a worktree move mid-session takes the rows *and* the off
     list with it.
2. **Same folder:** if home and the project folder are the same path (compare with slashes made
   `/` and, on Windows, case folded), everything is USER and there is no PROJECT section.
3. **List** each folder with `$.fs.list` (a missing folder is an empty list, inside a `try`):
   - `skills/`: each entry of kind directory that holds a `SKILL.md`, **one level only**.
     `~/.claude/skills/synced/` has no `SKILL.md` at its top, so it is skipped by itself. Those are
     the claude.ai skills that the engine lists as `anthropic-skills:…`, not as the person's own.
   - `commands/`: each `*.md` at the top level. The name is the file name without `.md`.
     Subfolders are left out of 0.2.0 (the engine names them `dir:file`; see "Settled while
     building 0.2.0").
4. **Read** each file's frontmatter with `$.fs.read`. Only three keys matter: `name`,
   `argument-hint` and `user-invocable`. `own.ts` has a small parser: the block between a leading
   `---` line and the next one, `key: value` lines, the value with its surrounding quotes taken
   off, CRLF accepted, every other line ignored (a multi-line `description` must not break it).
   - The name is the skill's frontmatter `name`, else its folder's name.
   - `user-invocable: false` leaves it out.
   - A non-empty `argument-hint` means the row gets a `…`.
5. **Confirm** against `$.command.list()`: keep only names it lists with `source: 'user'`. The
   description shown is the one `list()` gives, the same line as the typeahead's. The folders say
   which section; the engine says what actually runs.
6. **Duplicates:** a skill and a command of the same name in one section are one row. A name in
   both USER and PROJECT is shown once, in **USER**: the global one is the one that runs (see
   "Settled while building 0.2.0").

**When:** at `session.start`, and again each time the menu opens, so a skill added mid-session
shows up without a restart. A scan reads a handful of small files, so it is not cached beyond the
state it writes.

### State and store

The contract (`types/index.d.ts`) gains:

```ts
/** One of the person's own commands, as a row shows it. */
export type OwnCommand = { name: string; description: string; takesArgs: boolean }

/** What the last scan found, by section, each sorted by name. */
export type ArsenalOwn = { user: OwnCommand[]; project: OwnCommand[] }

/** The names turned off in edit mode. `project` is keyed by the project folder. */
export type ArsenalOff = { user: string[]; project: Record<string, string[]> }

// in PluginState['arsenal']:
own: ArsenalOwn
off: ArsenalOff
/** The section in edit mode, if any. */
editing: 'user' | 'project' | null
/** The key into `off.project` for this session's repo, from the last scan. */
projectKey: string
```

- **Saved:** `off` lives in `$.store` under `off`, as `{ version: 1, user, project }`. `$.store`
  is per machine, so the home and work PCs keep separate lists without trying.
- **Per repo:** `off.project` is keyed by the project key from step 1 (the repo's shared `.git`
  folder, or `root()` outside git), normalised as in step 2 (slashes `/`; case folded on Windows).
  Turning `/deploy` off in one repo leaves another repo's `/deploy` on, and that holds across one
  repo's worktrees and subfolders. Keys of projects no longer used stay in the store. They are a
  few bytes and do no harm.
- **Off by name, not on by name:** a new command is on without anyone doing anything, and the name
  of a deleted command left in the list matches nothing.
- **Mirrored into `$.state`:** a `$.store.get` made while drawing does not subscribe the drawing,
  while a `$.state` read does. So `session.start` loads `off` into state. A pill press writes
  state (the drawing follows) and then `$.store.set`. A failed save is a toast; the state stands for
  the session.
- `editing` goes back to `null` when the pane closes (`ui.close`) and at `session.start`.

### Events (what changes)

| Event | 0.2.0 adds |
|---|---|
| `session.start` | load `off` from `$.store`, scan (PROJECT folder, `projectKey`, `own`), `editing` null |
| opening the menu (`openMenu`) | scan again (folder and key too) before `$.ui.open`, and ask for the menu's rows |
| `ui.close` | `editing` null |
| `ui.render` `Pane` | draws USER and PROJECT under LAUNCH |
| `ui.render` `AbovePrompt` | the launcher shows when `hasRows` counts own commands too |

### Testing

- **`own.test.ts`:** the frontmatter parser (quotes, CRLF, no frontmatter, a multi-line value
  elsewhere), the name rule (frontmatter vs folder), `user-invocable: false`, the confirm step
  (not listed, listed as `plugin`), home equal to the project folder, duplicates, the project key
  (slashes, case on Windows, a worktree's and the main checkout's common dir giving one key, the
  non-git fallback), sorting.
- **`menu.test.ts`:** rows left after `off`, clipping a description to a width, the pane's row
  count, `hasRows` with only own commands.
- **`render.test.ts`:**
  - an empty section is not drawn;
  - a section that is all off shows its header, `✎ edit` and `all off`;
  - `✎ edit` shows the pills, and a pill press flips state and calls `store.set`;
  - a row press closes the pane and runs the bare command;
  - `…` fills an empty box and toasts over a draft;
  - the launcher shows with own commands and no tools.
- **Live check:**
  - on the home PC, `/handoff` shows under USER with a `…`;
  - put a `hello.md` command in a scratch project's `.claude/commands/` and see PROJECT appear;
  - turn one off, `/reload-plugins` (or a new session), and it stays off;
  - add a worktree of that scratch project, open a session in it, and the command is still off;
  - turn it back on;
  - `…` on `/handoff` leaves `/handoff ` in the box with the cursor at its end.

### Settled while building 0.2.0

Settled on 2026-10-18 (Sonnet 5.5) with a throwaway probe mod, run as `/probe` headless
(`claude -p "/probe" --plugin-dir …`, with `MSYS_NO_PATHCONV=1` under Git Bash, or it rewrites
`/probe` into a path) from the subfolder `proj/sub/deep` of a scratch git repo that had a worktree.
The probe dumped `$.command.list()`, `$.session.root()` and the git calls. **Read** means from the
API types.

- **Does `$.command.list()` label the person's global and project commands `source: 'user'`?**
  **Yes, and plugin skills are not.** The list had 175 entries: 58 `builtin`, 95 `plugin`, 3 `mcp`,
  19 `user`. The `user` ones were the global `handoff`, the scratch project's five, **and** the
  claude.ai-synced skills (`docx`, `pdf`, `docs`, `chrome-browser`, …). So `source: 'user'` alone
  is not "the person's own": the folder scan is what leaves the synced ones out (they sit two
  levels down, in `skills/synced/<bucket>/`). Both halves of step 5 are needed.
- **Which name does the engine give a skill?** **Its frontmatter `name`.** A skill in `folder-name/`
  with `name: fancy-name` was listed as `fancy-name`. This is what step 4 says.
- **A name in both `~/.claude` and the project:** **the global one runs.** With a `zzdupe` command
  in both, `/zzdupe` ran the global body. `list()` shows both entries (each with its own
  description) and does not say which wins. So a name found in both is drawn in **USER only**, and
  PROJECT leaves it out. (The probe's global file was made and removed by hand, so nothing was
  left in `~/.claude`.)
- **Which folder does the engine load project commands from** when the session starts in a
  subfolder of a repo? **The repo's top level.** Started in `proj/sub/deep`, `list()` held the
  commands of `proj/.claude/`, though `root()` and `cwd()` were both the subfolder. So the
  `--show-toplevel` scan reads what the engine loaded, and `root()` is not the place.
- **`git rev-parse --path-format=absolute --git-common-dir`:** **works on the installed git
  (2.55)**, answering `…/proj/.git` with forward slashes. Without the flag the answer was
  `../../.git`, relative to the folder git ran in, so the fallback for an old git is to resolve it
  against `root()`. `--show-toplevel` also gave forward slashes, while `root()` and `cwd()` have
  backslashes: normalise before comparing.
- **Commands in subfolders** (`commands/git/sync.md`): **named `git:sync`**, with the folder as a
  colon-separated prefix. The naming is clear, so adding them is a small follow-up (scan one more
  level, name it `dir:file`). 0.2.0 still leaves them out.
- **`$.prompt.fill` from a pane press:** the types say it puts the text in the box by `mode`
  (`replace` by default) and answers `isFilled: false` "under a dialog or headless". Where the
  cursor ends is **not documented**, so it stays on the live check.
- **A `plain` Button with no `hotkey`** draws "the label alone" (read, `ButtonProps.plain`). The
  live check still looks at the paint.

### What building changed in this design (0.2.0)

- **LAUNCH is drawn only when it has rows.** 0.1.0 always drew the title, because a menu with no
  tool had no button. With own commands and neither tool, the menu is USER and PROJECT alone.
- **Links are tried.** A skill folder or a `.md` that `$.fs.list` reports as a link (`kind:
  'other'`, `isLink`) is read like any other, since the engine's list decides whether it is real.
  The directory kind is `'dir'`, not `'directory'`.
- **An older git is asked twice.** If `--path-format=absolute` is refused, `askGit` asks again for
  the plain `--git-common-dir`, and `projectPlace` reads that against `root()`.
- **The pane never asks for fewer than 14 rows.** `paneRows` is the line count plus 2 of slack,
  floored at 0.1.0's 14, so a menu with only the two tools asks for exactly what it did.
- **The store is read tolerantly.** `offFromStore` turns anything unexpected into an empty list
  for that part; it sorts and de-duplicates names and drops empty project lists.
- **Buttons are keyed `arsenal-<section>-<run|more|edit|pill>[-name]`** (`arsenal-user-run-handoff`,
  `arsenal-project-pill-seed-db`), unique across both sections.

**Verified** (2026-10-18): `claude plugin test arsenal` (96 pass), `claude plugin validate arsenal`,
and the real mod run headless beside a probe that read its state (`claude -p "/probe"
--plugin-dir arsenal --plugin-dir <probe>`) from `sub/deep` of a scratch repo. At `session.start`
it held USER = `handoff` (with `takesArgs`), PROJECT = the scratch repo's skills and commands
(`fancy-name`, `hello`), nothing from `skills/synced/`, the `user-invocable: false` skill and the
`dir:name` command left out, the project's `handoff` dropped for the global one, and `projectKey`
the repo's `.git`. So `$.command.list()` is ready by `session.start`.

**Not verified**: the paint (the live check below), where the cursor ends after `…`, and `tsc -p
arsenal` (no TypeScript compiler on the home PC when this was built).

### Shipping 0.2.0

A new version of a mod goes on a branch and through a PR (repo `CLAUDE.md`). The branch is
`arsenal-0.2.0`.

1. `plugin.json` version `0.2.0`.
2. `README.md`: the USER and PROJECT sections, edit mode, the `…`.
3. `SETUP.md`'s arsenal section: arsenal now shows rows even with neither prompt-upgrade nor
   work-report installed, as long as the person has commands of their own.
4. The marketplace entry's description, if it says the menu is only for the repo's tools.
5. PR titled like the earlier ones ("arsenal 0.2.0: …").

## 0.3.0: the launcher moves to the footer

Probed and built on 2026-10-18 (Sonnet 5.5) with the person watching a real terminal. Read means
read from the API types; **seen** means the person saw it.

### Why

0.1.0 put the launcher in the band because "nothing a mod draws can sit between the prompt box and
the statusLine", and the hint line (`PromptHint`) put the button on a row of its own at the very
bottom. The person then noticed that waypoints draws `◎ plan 44%` in the **footer** at the right
of the prompt, on the first row under the prompt box, level with claude-hud's first row. That slot
is `SessionMode`, a render site this design's survey had counted as a text-only label.

### What the probe found (a throwaway mod, `footer-probe`)

- **`SessionMode` takes a tree with a `Button`, and the button can be clicked.** Seen on the terminal:
  the button sat on the first row below the prompt box, same row as claude-hud's first row; five
  presses were counted.
- **The engine hands its footer over as one opaque node** (`{"type":"engine","ref":1}`), and
  `props.modes` is empty at that point (read from a dump of the hook). Labels other mods add
  (waypoints' plan) are already inside the node, so the hook wraps `await next(e)` and never rebuilds
  the row from `modes`. Seen: `[ ◆ Probe ▾ 5 ]◎ plan 0% · 0/3` with the button and waypoints' label
  both drawn.
- **No gap** between the two in the first draft. A `Text` holding one space after the button fixes it.
- **Colour.** `variant="primary"` draws in the surface's accent, which is purplish on the person's
  theme. `ButtonProps` still has no colour props, but a `plain` Button may hold a `Text` child
  (the 0.1.0 Settings pill does), and `Text.color` takes a theme key. `claude` is Claude's own
  orange in the person's theme, so the launcher is a `plain` Button holding
  `<Text color="claude">[ ◆ Arsenal ▾ ]</Text>`. A theme key follows the person's theme, which a
  hex would not.
- **Desktop** (`SessionMode` is raised on terminal and desktop, read from the types): the same hook
  draws a valid tree on `desktop` in the test kit, and a Desktop `Button` is a native button.
  **Not seen on a real Desktop session.** ctx's notes say Desktop has no band, which would have left
  the 0.1.0 launcher out of Desktop; the footer is the way in there.

### What changed

- `ui.render` `AbovePrompt` is gone. `ui.render` `SessionMode` replaces it: no rows → `next(e)`;
  else `await next(e)`, then a row of the launcher, one space, and that node.
- The survey rule went with it. `SessionMode` has no `hasSurvey`, and a survey does not take the
  footer.
- The button reads `[ ◆ Arsenal ▾ ]`, drawn by the `Text`; the Button's `label` stays
  `◆ Arsenal ▾` as the control's name, so the arrow logic and `/arsenal` are unchanged.
- Order in the footer: the launcher first, then everything the engine and other mods draw.
- Tests: 96 (was 96): the band-order and survey tests became "the launcher comes first on the
  row, a space before the engine's footer", "a plain button in Claude's orange" and "the
  launcher draws on the desktop as well".

### Not settled

- How a `plain` Button holding a `Text` is **hovered** on the terminal (the focus/pointer invert).
- A real Desktop session.
- Other mods that add a `SessionMode` hook above arsenal: waypoints appends to `modes` and
  does not draw a tree, so it works either way; a mod that draws its own tree there would replace
  the row below it. None here does.

## Alternatives turned down

- **For 0.2.0: scanning only `~/.claude`.** Most of the person's work commands may be a repo's own,
  so PROJECT came in. Folding the two into one list would hide where a command comes from.
- **For 0.2.0: every plugin skill.** Over 200 rows, most of them skills the model loads by itself
  ("Use this skill whenever…") that do nothing run bare.
- **For 0.2.0: "no argument hint" as the test for "launchable".** `/handoff` has a hint and runs
  fine bare. `pdf` has none and is useless bare. The person decides what shows, in edit mode.
- **For 0.2.0: a `✕` on every row, or `/arsenal hide <name>`.** The `✕` clutters every row and
  is easy to hit by mistake. Typing names goes against one press.
- **For 0.2.0: keying PROJECT's off list by the session's folder.** It needs no git call, but each
  worktree and subfolder would get its own list, so a command turned off would come back on in a
  new worktree, and edit mode would look as if it forgot.
- **For 0.2.0: one off list for USER and every project.** Turning a command off in one repo would
  turn off a same-named command in every repo.
- **For 0.2.0: arguments as choice buttons, or a text box in the pane.** The hints are free text
  (`[shipped|s|list|l|archive|a]` has aliases), and the API has no input widget. The prompt box
  already is one, so `…` fills it.
- **A statusLine entry.** It is text only, with no click, and claude-hud owns it.
- **The button on the hint line (`PromptHint`).** It works, but under a tall statusLine it is far
  from the prompt box, and it cannot share the engine's row (see "The live check").
- **The menu in the band.** It opens mid-screen, unlike the person's other mods' docked panes.
- **Model and effort pickers, Auto Model and a helper-agent model.** These were in the reference
  screenshot. The person never switches model or effort mid-session, and an automatic picker that
  chooses wrong costs money.
- **ctx, subagent-progress and agent-pulse in the menu.** They show status, and their bands are
  already where status belongs.
- **Writing prompt-upgrade's `auto` directly** (hooking its `state.set`). It would work, but it
  couples arsenal to prompt-upgrade's internals. The slash command is its public interface.
- **Reading effort by running `/effort`.** It would print into the transcript every time.
  `turn.step` gives it for free.
- **A `Pane` instead of the band.** A pane docks beside the transcript in fullscreen. The reference
  menu sits right above the button that opened it, and that is where the band is.
- **Other names:** quiver, grimoire, atelier, switchboard. `dock`, `bridge` and `codex` were
  avoided because Claude Code (or another vendor) already uses those words.
