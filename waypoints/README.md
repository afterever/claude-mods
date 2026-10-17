# Waypoints

**A progress bar for what Claude is working through: the task plan as a bar, with elapsed time and an ETA.**

Waypoints is a fork of Nate Herk's [goal-meter](https://github.com/nateherkai/claude-code-mods/tree/main/goal-meter) 1.0.0 (MIT, see [LICENSE](./LICENSE)), imported with its history, so the original commit keeps its author. Everything that makes the meter work is Nate's: the task tool Claude plans with, the band and footer, the ETA at the goal's own pace, the goal check's "not met yet" reason, and the pane with every chat's goal. This fork renames it and builds the plan request into the mod, so nothing has to be added to your global `CLAUDE.md`.

## What it shows

Claude plans the work as tasks sized S, M or L with the mod's own tool, `mcp__waypoints__tasks`, then marks each one started and done. Everything on screen comes from that list.

- **The band above the prompt:** the plan drawn as a **route**, a line of nodes and legs, each leg as long as its task is big (S, M or L). Finished legs are solid and shaded, the node a task starts from pulses while it runs, the last node is the destination `◎`. Under it: what is running and who runs it, the next task, and the goal check's latest "not met yet" reason. In the header: tasks done, the percentage and the ETA at this goal's own pace.
- **The footer:** `◎ goal 69% · ~15m`, in every view.
- **The pane:** `/waypoints` opens this chat's whole task trail (every task, how long each took, who is running which) and every other chat's goal from the last 12 hours, each with its own small route. It also **opens by itself** when a plan starts, without taking the keys from your prompt.
- **Claude Desktop:** the route is a drawn line instead of characters, with the same states and its own motion.

```
◎ Goal: Add band to Settings type…               3 of 6 · 50% · ~2m   all tasks g
●━━━━━━━━●━━━━●━━━━━━━━◉┄┄┄┄┄┄┄┄○┄┄┄┄○┄┄┄┄┄┄┄┄◎ +2
⠋ M  Tests: normalize, command, band on/off           ◆ reviewer · 1m
  next ○ S  README, version bump, marketplace.json
```

The ETA appears after two tasks are done. When a goal finishes the full band stays for 8 seconds, then collapses to one row; three minutes after the finish the band goes, and a pane that Waypoints opened closes with it (a pane you opened yourself stays). The mod makes no model calls of its own.

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

Subagents are told never to call `plan`, because it replaces the main agent's pending tasks; they can `start` and `done` tasks.

The standing line is the one thing the global `CLAUDE.md` bullet used to do. If you still have that bullet from goal-meter, delete it.

> **Needs function hooks, which are early access.** Where an organization manages Claude Code, the engine passes over `prompt.compose` in plugins you install, so the standing line does not run there; a `/goal` still asks for a plan.

## Use it

| Command | What it does |
| --- | --- |
| `/waypoints` | Opens the pane. Where the surface draws none, it prints the plan as text. |
| `/waypoints hide`, `show` | Hides or shows the band. The footer stays. |
| `/waypoints strict on`, `off` | On: file edits in a `/goal` are refused until Claude has planned. Off by default. |
| `/waypoints auto on`, `off` | Turns the standing line on or off. On by default; the choice is kept between sessions. |
| `/waypoints clear` | Stops tracking this chat's goal. |

In the band, the **all tasks** button (or `g`) opens the pane.

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
