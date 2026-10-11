# claude-mods

Personal [Claude Code mods](https://code.claude.com/docs): plugins of function hooks that draw panes, bands and footers inside Claude Code. This repo is also a plugin marketplace, so every computer installs the same mods the same way.

| Mod | What it does |
| --- | --- |
| [`ctx`](./ctx) | Context window details in a pane and a band above the prompt: how full, how fast it is filling, what filled it, compacting on your terms, and what each of those costs. How to use it, and how to get the pane on the right: [ctx/README.md](./ctx/README.md). Why each feature exists: [ctx/DESIGN.md](./ctx/DESIGN.md). |
| [`subagent-progress`](./subagent-progress) | A progress bar above the prompt and a live agents panel for any subagent work, each subagent a crab whose costume follows its model and effort, closing into a green Done row. Fork of johnnyvizz's savvy-progress (renamed in 2.0.0); what changed: [subagent-progress/README.md](./subagent-progress/README.md). |

## Install (each computer)

```
claude plugin marketplace add afterever/claude-mods
claude plugin install ctx@afterever-mods
claude plugin install subagent-progress@afterever-mods
```

That installs the two mods in this repo. The whole setup, with the third-party mods, the global `CLAUDE.md` line and the skins patch and skin, is in [SETUP.md](./SETUP.md).

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
```
