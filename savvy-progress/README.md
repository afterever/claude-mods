# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Forked from johnnyvizz's [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) 1.2.0 (MIT, see [LICENSE](./LICENSE)), made to show any subagent work, with or without the savvy-flow skill.

- **Progress bar**: the flow's title, phase, finished agents out of started, and a button with the crew size that opens the panel (`a` presses it while the band holds the focus). It appears when a subagent of any type starts, or when something reports progress (savvy-flow does). When the work ends it turns into a green **Done** row that stays until you dismiss it with ✕.
- **Agents panel** (`/agents-info` toggles it): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. It opens by itself whenever a new batch of subagent work starts. **Collapse** shrinks it to one line per agent. Working crabs walk, and each savvy tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them.

## What this fork changes

Upstream shows the bar only for `savvy-*` workers or an explicit `progress` report. Here:

- Any subagent (`Explore`, `general-purpose`, a custom one, ...) opens an **auto flow** titled "Subagents". Its counters come from spawns and completions, in `hooks/auto.ts`: every start adds to the total, every finish adds to done, and once every agent of the batch has finished the row closes. Only the batch's own agents count, so an agent left "running" by an interrupted earlier batch cannot hold it open.
- The panel auto-opens when each batch starts (and for `savvy-*` workers as before). Close it mid-batch and it stays closed until the next batch; `/agents-info` or the crew button reopens it any time.
- A new batch of work starts with a clean list; agents still running stay.
- An orchestrated flow (the `progress` tool, or a `savvy-*` worker) is never touched by this: its counters stay the orchestrator's. Once an explicit report arrives it takes the flow over.

## Changes

### 1.4.0: terminal look

The desktop drawings are unchanged; this release is the terminal's text rendering.

- **The progress bar checks the surface before drawing SVG.** The terminal's element table answers `'Svg' in ui` too, which sent the band down its desktop path; the plugin test kit drew it as `×N ✕` alone. On the terminal it now always draws its text row: title, bar, phase, percent and crew.
- **Time and cost lead each agent's stats line**: `1:20 · ≈$0.42 · ctx 12% · 120k`, then the step count and its note. A line cut at the pane's edge loses the note, not the cost and time. The panel's totals read the same way.
- **Shorter panel**: no blank line after each agent or planned task, and no trailing `◷` on planned rows (they sit under "Planned" already).
- **Compact is one line per agent**: status, name, a small bar where the pane is 40 columns or wider, time and cost. Its **Finished** fold works as in the full view.
- **Finer bars**: one bar for the panel and the band, filled in eighths of a cell (`▏▎▍▌▋▊▉`), so a 6-cell bar moves in about 2% steps. It needs a font with block elements, as Cascadia and Nerd Fonts have.
- **Theme colours**: done and failed agents, the Done row and the `▣` use the theme keys `success`, `error` and `claude`, so they follow the theme and skin. Tier colours stay as they are.
- **Done row**: `✓` in place of `●` once the work ends.
- **Crew button hotkey**: `a`, drawn `a: ×N`.
- **Band widths are measured**: the bar gives up the cells a longer phase label needs (`Tasks 1 running`, or the Russian labels), so the row no longer wraps at 80 columns.
- `hooks/render.test.ts`: the pane and the band drawn on the terminal at several widths, and the band's SVG on desktop (12 tests).

### 1.3.0: any subagent work

The fork itself; see [What this fork changes](#what-this-fork-changes).

## Tools it adds

- `mcp__savvy-progress__progress`: an orchestrator reports the plan, phase and accepted tasks.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows its context fill in grey instead.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`), not a bill.

## Settings

`language`: `auto` (default), `en` or `ru`. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

## Install

```
/plugin install savvy-progress --marketplace afterever/claude-mods
```

Install instructions for the whole repository are in the [repository README](../README.md). This mod registers the same tool names, command and state as upstream's `savvy-progress@claude-kit`, so install only one of them.
