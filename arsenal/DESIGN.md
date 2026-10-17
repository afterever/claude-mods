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
  menu. When the menu is open it draws above their bands and keeps them below it
  (`await next(e)`), so it hides none of them.
- **Quiet when closed.** All it shows when closed is one button at the right end of the hint line.

## Where it draws (verified)

```
 ╭─ ◆  A R S E N A L ───────────── … ─╮ [-]   ← (1) AbovePrompt band: the menu
 │  …                                  │
 ╰─────────────────────────────────────╯
   (ctx / agent-pulse / subagent-progress bands, drawn by next(e), stay here)
 ──────────────────────────────────────────
 > the prompt box
 ──────────────────────────────────────────
 ? for shortcuts                  [◆ Arsenal ▾]  ← (2) PromptHint: the footer button
 Opus 5.5 · ctx 34% · …                          ← (3) statusLine (claude-hud): NOT ours
```

- **The `statusLine` is not the place.** It is a shell command set in `settings.json` (claude-hud
  owns it here), it only prints text, and it has no click handlers.
- **The footer button is a `ui.render` hook on `PromptHint`.** The hook takes the engine's own
  line from `await next(e)` and puts it in a row with a `Button` at the right end. **Verified:**
  the engine accepts this tree, the engine's pills (`? for shortcuts`, the agents pill) stay
  live, and a mouse click on the button presses it.
- **The menu is a `ui.render` hook on `AbovePrompt`.** In the reference screenshot the `[-]` at the
  top right is the mark the engine draws beside this band, so his menu was a band too. The
  engine adds `[-]` (collapse) by itself.

## The menu

```
╭──────────────────────────────────────────────────────────╮
│ ◆  A R S E N A L                        Opus 5.5 · High   │
│ ───────────────────────────────────────────────────────── │
│ ── S E T T I N G S                                        │
│ ○ Prompt Upgrade    upgrade every prompt first  [ ○ Off ] │
│ ── L A U N C H                                            │
│ ✦ Upgrade a prompt           ▤ Today's report             │
│ ◷ Prompt history             ▥ This week's report         │
│                              ⚙ Report settings            │
│                                                      ✕    │
╰──────────────────────────────────────────────────────────╯
```

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
- The `turn.step` hook must only read: `return next(e)` unchanged, so it never alters the request.

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
- `$.command.run` is "queued and run once the session is idle". A press during a turn therefore
  waits for the turn to end. Show it in the menu's note line (`queued: /report today`) instead of
  doing nothing visible.

### Which rows show

At `session.start`, read `$.command.list()` (**verified**: it returns all 212 names, `better` and
`report` among them) and keep only the rows whose command exists. A section left with no rows is
not drawn. If no rows are left at all, the footer button is not drawn either.

### Opening and closing

- The footer button toggles the menu: label `◆ Arsenal ▾` when closed, `◆ Arsenal ▴` when open,
  `variant="primary"` (try the orange of the reference with `backgroundColor`; see the ButtonProps
  doc).
- `/arsenal` toggles it too, for the keyboard (register in `session.start`, answer in a
  `command.run` hook with `{ command: 'arsenal' }`, `immediate: true` so it works mid-turn).
- Each Launch item closes the menu after running. A `✕` button (`role="dismiss"`) closes it. The
  engine's `[-]` collapses it.
- Hotkeys while the band is focused (ctrl+x tab or a click): `p` Prompt Upgrade toggle, `u`
  upgrade, `h` history, `t` today, `w` week, `s` settings. Keep the hotkeys away from other mods'
  band buttons (subagent-progress uses `a`). Grep the other mods for `hotkey=` before choosing.
- Yield when `e.props.hasSurvey`: return `next(e)` untouched.
- `isOpen` is session state, not saved in `$.store`. A new session starts with the menu closed.

## Architecture

### Files

```
arsenal/
  .claude-plugin/plugin.json   name, version 0.1.0, description, author afterever, MIT, types
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           the hooks: session.start, turn.step, command.run, two ui.render
  hooks/menu.ts                pure: rows from the command list, labels, layout columns
  hooks/menu.test.ts           unit tests of menu.ts
  hooks/render.test.ts         the hooks in the engine's test kit (see Testing)
  types/index.d.ts             the $.state contract
  tsconfig.json                { "extends": "./.claude-plugin/types/tsconfig.json" }
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
      /** One line under the menu: what the last press ran or queued, or why it failed. */
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
| `session.start` | register `/arsenal`, read `$.command.list()` into `tools`, read `$.session.model()` into `running`, set `isOpen` false |
| `turn.step` | main loop only: update `running` from `e.model` / `e.effort`; `return next(e)` unchanged |
| `command.run` `{ command: 'arsenal' }` | toggle `isOpen`, answer `{ text: '' }` or a short line |
| `ui.render` `PromptHint` | `await next(e)`, then a row: that line, then the button at the right end |
| `ui.render` `AbovePrompt` | closed or `hasSurvey` → `next(e)`; open → the menu, with `await next(e)` under it |

Draw the same on `desktop` (both components are raised on terminal and desktop). There is no
`Svg` version for 0.1.0.

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
  - when closed, the band is the plugins-beneath tree and nothing else, and the footer has the
    button;
  - when open, the menu is drawn above `next(e)`'s tree;
  - `hasSurvey` yields;
  - a Launch press calls `command.run` with the right command and args and closes the menu;
  - the Prompt Upgrade pill follows `prompt-upgrade.auto`;
  - `turn.step` with an `agentId` changes nothing, and without one updates the header;
  - `turn.step` passes `e` on unchanged.
- **Live check** (`claude --plugin-dir arsenal`): open and close the menu from the button, with
  `/arsenal` and with `✕`. Toggle Prompt Upgrade and watch the pill follow. Run every Launch item.
  Press during a turn and see the "queued" note. Check that the agent-pulse, subagent-progress
  and ctx bands still show under the open menu. Make the terminal narrow and see one column.

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

## Open questions to settle while building

- What exactly does `$.session.model()` return: an alias (`opus`), an id or a display name?
  `modelLabel` has to handle whichever it is.
- Does a `dependencies` entry for an uninstalled plugin block loading? (See "Reading another mod's
  state".)
- Does a `Button` in `PromptHint` accept `backgroundColor`, or only `variant`? The orange pill may
  have to be `variant="primary"`.
- Does a Launch item that opens a pane (`/better`, `/report …`) work when the session is narrow?
  Those mods toast "needs room" themselves, so arsenal should not repeat that.

## Alternatives turned down

- **A statusLine entry.** It is text only, with no click, and claude-hud owns it.
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
