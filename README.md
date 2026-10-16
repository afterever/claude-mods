# claude-mods

Personal [Claude Code mods](https://code.claude.com/docs): plugins of function hooks that draw panes, bands and footers inside Claude Code. This repo is also a plugin marketplace, so every computer installs the same mods the same way.

| Mod | What it does |
| --- | --- |
| [`ctx`](./ctx) | Context window details in a pane and a band above the prompt: how full, how fast it is filling, what filled it, compacting on your terms, and what each of those costs. How to use it, and how to get the pane on the right: [ctx/README.md](./ctx/README.md). Why each feature exists: [ctx/DESIGN.md](./ctx/DESIGN.md). |
| [`subagent-progress`](./subagent-progress) | A progress bar above the prompt and a live agents panel for any subagent work, each subagent a crab whose costume follows its model and effort, closing into a green Done row. Fork of johnnyvizz's savvy-progress (renamed in 2.0.0); what changed: [subagent-progress/README.md](./subagent-progress/README.md). |
| [`prompt-upgrade`](./prompt-upgrade) | `/better` turns a rough prompt into a great one before it is sent: a pane asks up to three quick questions, rewrites the prompt and shows original and upgrade side by side, and nothing runs until you press Run. Optional automatic mode. Idea and spec from [tristenobrien.ai](https://tristenobrien.ai/); how to use it: [prompt-upgrade/README.md](./prompt-upgrade/README.md). |
| [`work-report`](./work-report) | `/report` shows what Claude has done for you: tasks finished, an estimate of the hours that saved you and what that time is worth, in a pane with Today, Week, Month and Year tabs. Counts only, kept in the mod's own store; no model calls. How to use it: [work-report/README.md](./work-report/README.md). |
| [`agent-pulse`](./agent-pulse) | A box above the prompt that says what Claude is doing right now, in plain English, alive with color and motion: a spinner per phase, a border that flashes when a call ends and breathes while Claude waits on you, a timeline of the turn, and a jellyfish on the desktop. Fork of Tzafrir Rehan's whats-agent-doing; what changed: [agent-pulse/README.md](./agent-pulse/README.md). Why: [agent-pulse/DESIGN.md](./agent-pulse/DESIGN.md). |

## Install (each computer)

```
claude plugin marketplace add afterever/claude-mods
claude plugin install ctx@afterever-mods
claude plugin install subagent-progress@afterever-mods
claude plugin install prompt-upgrade@afterever-mods
claude plugin install work-report@afterever-mods
claude plugin install agent-pulse@afterever-mods
```

That installs the five mods in this repo. The whole setup, with the third-party mods, the global `CLAUDE.md` line and the skins patch and skin, is in [SETUP.md](./SETUP.md).

Pick up new versions with `claude plugin marketplace update afterever-mods` and then `claude plugin update ctx@afterever-mods` (restart Claude Code to apply).

## Use ctx

`/ctx` opens the pane and the 📊 button above the prompt toggles it. The commands, the keys inside the pane, and what to do when the pane sits above the prompt instead of docking on the right (it needs the fullscreen layout) are in [ctx/README.md](./ctx/README.md).

## Develop

Edit a mod in place and load it from disk, which hot-reloads on save:

```
claude --plugin-dir C:\github\claude-mods\ctx
```

Check a mod before committing:

```
claude plugin validate C:\github\claude-mods
claude plugin test C:\github\claude-mods\ctx
```

Claude Code writes `<mod>/.claude-plugin/types/` and `<mod>/tsconfig.json` each time it loads a mod. They are regenerated and git-ignored.

Bump `version` in the mod's `plugin.json` when you change it, or installed copies will not pick the change up.

## Layout

```
.claude-plugin/marketplace.json   the marketplace listing
SETUP.md                          reproduce the whole mod setup on a new computer
ctx/
  README.md                       install, the fullscreen layout, commands and keys
  DESIGN.md                       why each feature exists and how it is built
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod
  hooks/fmt.ts, fmt.test.ts       pure formatting helpers and their tests
  hooks/usage.ts, usage.test.ts   tool-result sizes, usage counts, the project log
  hooks/compact.ts, compact.test.ts  keep instructions and the auto-compact warning
  hooks/cost.ts, cost.test.ts     per-turn spend, learned prices, carrying and compaction costs
  hooks/render.test.ts            the pane, band and footer drawn on terminal and desktop
  types/index.d.ts                the mod's $.state contract
subagent-progress/
  README.md                       what it does and what changed from savvy-progress
  LICENSE                         MIT, upstream's notice
  .claude-plugin/plugin.json      name, version
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: tools, panel, band, state
  hooks/auto.ts, auto.test.ts     the flow derived from spawns and completions
  hooks/crew.ts, crew.test.ts     which costume a model and effort wears
  hooks/render.test.ts            the panel and band drawn on terminal and desktop
  types/index.d.ts                the mod's state contract
prompt-upgrade/
  README.md                       commands, the four steps, automatic mode, credit
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: commands, automatic mode, model calls, state
  hooks/view.tsx                  the screens
  hooks/logic.ts, logic.test.ts   what is held, reading the model's answers, the prompts
  hooks/layout.ts, layout.test.ts widths, tracker, big numbers
  hooks/svg.ts, svg.test.ts       the three numbers as one drawing on the desktop
  hooks/flow.test.ts              the whole flow, with the model stubbed
  types/index.d.ts                the mod's state contract
work-report/
  README.md                       commands, what counts as a task, the estimate, the tabs
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: events, commands, the pane and the button
  hooks/view.tsx                  the pane
  hooks/kinds.ts, kinds.test.ts   sorting a task by its tools
  hooks/record.ts, record.test.ts which prompts count, claiming a turn
  hooks/dates.ts, dates.test.ts   local-noon day stepping, ranges, day of the year
  hooks/report.ts, report.test.ts totals, the estimate, the streak, chart bars
  hooks/layout.ts, layout.test.ts widths, big numerals, tiles, bars, the chart
  hooks/flow.test.ts              the whole flow, with the engine's events stubbed
  types/index.d.ts                the mod's state contract
agent-pulse/
  README.md                       what it shows, what changed from whats-agent-doing, settings
  DESIGN.md                       why each addition is built the way it is
  LICENSE                         MIT, upstream's notice and ours
  .claude-plugin/plugin.json      name, version, settings, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod: events, settings, timeline, flourishes, chime
  hooks/draw.tsx                  the box on the terminal and on the desktop
  hooks/pulse.tsx                 the terminal's animations (Client surface module)
  hooks/jelly.ts                  the jellyfish, strip and bars as SVG
  hooks/palette.ts, glyphs.ts     palettes, heat, agent colors; spinners, glyphs, meters
  hooks/activity-of.ts, text.ts   tool labels and text helpers (upstream's)
  tests/register.test.tsx         upstream's tests: a whole turn, history, approvals, agents
  tests/pulse.test.tsx            every animation level on terminal and desktop
  sounds/chime.wav                the opt-in approval chime
  media/                          the jellyfish and strip for the README
  types/index.d.ts                the mod's state contract
```
