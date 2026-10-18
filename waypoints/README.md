# Waypoints

**A progress bar for what Claude is working through: the task plan as a bar, with elapsed time and an ETA.**

Waypoints is a fork of Nate Herk's [goal-meter](https://github.com/nateherkai/claude-code-mods/tree/main/goal-meter) 1.0.0 (MIT, see [LICENSE](./LICENSE)), imported with its history, so the original commit keeps its author. Everything that makes the meter work is Nate's: the task tool Claude plans with, the band and footer, the ETA at the goal's own pace, the goal check's "not met yet" reason, and the pane with every chat's goal. This fork renames it and builds the plan request into the mod, so nothing has to be added to your global `CLAUDE.md`.

## What it shows

Claude plans the work as tasks sized S, M or L with the mod's own tool, `mcp__waypoints__tasks`, then marks each one started and done. Everything on screen comes from that list.

- **The band above the prompt:** the plan drawn as a **route**, a line of nodes and legs, each leg as long as its task is big (S, M or L). Finished legs are solid and shaded, the node a task starts from pulses while it runs, the last node is the destination `◎` (a `✦` once the plan is done). A long plan in a narrow window drops the legs and draws one glyph per task. Under it: what is running and who runs it, the next task, and the goal check's latest "not met yet" reason. In the header: tasks done, the percentage and the ETA at this goal's own pace.
- **The footer:** `◎ goal 69% · ~15m`, whether or not the band shows. On Claude Desktop, where the band already draws the plan, it appears in the footer only while the band is hidden with `/waypoints hide`.
- **The pane:** `/waypoints` opens this chat's whole task trail (every task, how long each took, who is running which) and your other chats' goals from the last 12 hours (the newest 15; the heading counts them all), each with its own small route. It also **opens by itself** when a goal's first plan starts, without taking the keys from your prompt, unless you closed the pane during that goal.
- **Claude Desktop:** the route is a drawn line instead of characters, with the same states and its own motion. Any surface that is not the terminal gets the drawn line.

```
◎ Goal: Add band to Settings type…               3 of 6 · 50% · ~2m   all tasks g
●━━━━━━━━●━━━━●━━━━━━━━◉┄┄┄┄┄┄┄┄○┄┄┄┄○┄┄┄┄┄┄┄┄◎ +2
⠋ M  Tests: normalize, command, band on/off           ◆ reviewer · 1m
  next ○ S  README, version bump, marketplace.json
```

The ETA appears after two tasks are done. When a goal finishes the full band stays for 8 seconds, then collapses to one row; three minutes after the finish the band goes, and a pane that Waypoints opened closes with it, within about 15 seconds (a pane you opened yourself stays). The mod makes no model calls of its own.

## Settings

In `/config`, under Waypoints:

| Setting | Values | Default |
| --- | --- | --- |
| Palette | `follow`, `ember`, `claude`, `neon`, `mono` | `follow` |
| Animation | `follow`, `off`, `subtle`, `full` | `follow` |
| Pane | `auto`, `off` | `auto` |

`follow` takes [Agent-Pulse](../agent-pulse)'s own palette or animation, so the two bands never disagree, and falls back to `ember` / `subtle` when Agent-Pulse is not installed. Pick a value to stop following. Colour and shape show at every animation level; `off` keeps everything still, `subtle` pulses the running task, `full` also breathes the node and sweeps the route when the plan finishes. `Pane: off` opens the pane only when you ask (`/waypoints` or `g`). A window narrower than 144 columns leaves an unasked pane waiting until it widens; `g` and `/waypoints` open it at any width.

## When Claude plans

| Work | What asks for a plan |
| --- | --- |
| A `/goal` | The mod adds a note to the command asking for a plan. If four tool calls pass with no plan, it reminds Claude once. |
| Any other work of 3 or more steps | A standing line in the system prompt (new in 1.1.0). A plan made this way shows the same, named after the one-line `goal` Claude gives it (its first task if it gives none) and labelled *Plan* where a goal is labelled *Goal*. |
| A small, single-step request | Nothing: the line tells Claude to skip it. |

The standing line tells subagents never to call `plan`, because it replaces the main agent's pending tasks; they can `start` and `done` tasks. It is a request, not a rule: the tool does not refuse a subagent's `plan`. The line is also left out of bare, print and teammate sessions, and while `/waypoints auto` is off.

The standing line is the one thing the global `CLAUDE.md` bullet used to do. If you still have that bullet from goal-meter, delete it.

> **Needs function hooks, which are early access.** Where an organization manages Claude Code, the engine passes over `prompt.compose` in plugins you install, so the standing line does not run there; a `/goal` still asks for a plan.

## Use it

| Command | What it does |
| --- | --- |
| `/waypoints` | Opens the pane (so does any word it does not know). Where the surface draws none, it prints the plan as text. |
| `/waypoints hide`, `show` | Hides or shows the band. The footer stays. A new goal or plan shows it again. |
| `/waypoints strict on`, `off` | On: Claude's `Edit`, `Write`, `NotebookEdit` and `MultiEdit` calls in a `/goal` are refused until it has planned. `Bash`, subagents and plans made outside a `/goal` are not held back. Off by default; the choice is kept between sessions. |
| `/waypoints auto on`, `off` | Turns the standing line on or off. On by default; the choice is kept between sessions. |
| `/waypoints clear` | Marks this chat's running goal as stopped; the band keeps showing `stopped` for three minutes. A finished goal is left as it is. |

For `strict` and `auto`, anything but `off` turns the setting on. `/goal clear` (or `stop`, `off`, `cancel`, `end`, `none`, `reset`) stops the goal in the same way. If Claude Code will not give the mod the name `/waypoints`, it registers `/waypoints-mod` instead.

In the band, the **all tasks** button (or `g`) opens the pane. `g` is a button in the band, so it only works while the band shows; `/waypoints` always does.

## What changed in 2.0.3

Fixed: on Claude Desktop the footer's `◎ plan 44%` never showed, so `/waypoints hide` left no sign of a running plan. Desktop does not draw the labels a mod adds to the footer, only what it draws as a tree, so there the label is now a tree around the engine's footer. It shows only while the band is hidden, because the band already shows the plan; the terminal is unchanged.

## What changed in 2.0.2

Fixed: a plan made without `/goal` was named after its first task, so a plan to review the README showed as "Plan: Review README intro". The `plan` action now takes an optional `goal`, one line naming what the whole plan achieves, and the standing line asks Claude for it. The title, the toast and the pane use it; without one the plan is still named after its first task.

## What changed in 2.0.1

Fixed: on the terminal the route row was missing and the running node did not pulse, because the band took the terminal for Desktop. It now goes by the surface the engine names.

## What changed in 2.0

Only how it looks and when the pane opens; what Claude is told and the tool it plans with are the same as in 1.1, and the data files are unchanged, so chats still on 1.1 appear in your pane.

- The one-row bar is now the route; the stats row moved into the pane.
- The pane shows every task as a trail with duration bars, instead of a window of six rows with `+n more`.
- The pane opens when a plan starts (`Pane` setting) and closes with the band.
- Fixed hex palettes copied from Agent-Pulse replace the theme keys 1.1 drew in (`cyan`, `green`), which a skin can remap, so the colours no longer depend on your theme unless you pick `claude` or `mono`.
- The band stays three minutes after a finish instead of ten.

## What changed from goal-meter

| | goal-meter 1.0.0 | Waypoints |
| --- | --- | --- |
| Plugin | `goal-meter` | `waypoints` |
| Tool | `mcp__goal-meter__tasks` | `mcp__waypoints__tasks` |
| Command | `/goals` | `/waypoints` |
| State folder | `~/.claude/mods-data/goal-meter/` | `~/.claude/mods-data/waypoints/` |
| Plans outside `/goal` | Only with a line in the global `CLAUDE.md` | A standing line in the system prompt, `/waypoints auto off` to remove it |

Switching: uninstall `goal-meter@nateherk-mods`, install `waypoints@afterever-mods`, delete the goal-meter bullet from the global `CLAUDE.md`, and open a new chat. Goals saved by goal-meter are not carried over; they only last a day anyway.

## Files

State is one JSON file per chat in `~/.claude/mods-data/waypoints/`, written so the pane can list other chats. When Recording Mode's flag is on, titles and notes are masked before they are drawn.
