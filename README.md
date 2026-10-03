# claude-mods

Personal [Claude Code mods](https://code.claude.com/docs): plugins of function hooks that draw panes, bands and footers inside Claude Code. This repo is also a plugin marketplace, so every computer installs the same mods the same way.

| Mod | What it does |
| --- | --- |
| [`ctx`](./ctx) | Context window details like the Desktop app's panel. `/ctx` opens a pane (docks beside the transcript in the fullscreen layout, from 110 columns; above the prompt otherwise) with a smooth eighth-block bar, an auto-compact marker, a per-turn trend sparkline with a turns-to-auto-compact estimate, and MCP / memory / skills / agents sections (press a memory file to open it); hover a bar segment or a row to light up its pair. A 📊 band above the prompt shows a mini bar, the fill (green, amber, red) and the last turn's growth; the button, or `x` while the band has focus, toggles the pane. `/ctx exact` (or `e` in the pane) counts with the token API. Desktop's footer shows `ctx 8%`. |

## Install (each computer)

```
claude plugin marketplace add afterever/claude-mods
claude plugin install ctx@afterever-mods
```

Before the repo is on GitHub, add it from its folder instead:

```
claude plugin marketplace add C:\github\claude-mods
claude plugin install ctx@afterever-mods
```

Pick up new versions with `claude plugin marketplace update afterever-mods` and then `claude plugin update ctx@afterever-mods` (restart Claude Code to apply).

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

Claude Code writes `ctx/.claude-plugin/types/` and `ctx/tsconfig.json` each time it loads a mod. They are regenerated and git-ignored.

Bump `version` in the mod's `plugin.json` when you change it, or installed copies will not pick the change up.

## Layout

```
.claude-plugin/marketplace.json   the marketplace listing
ctx/
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod
  hooks/fmt.ts, fmt.test.ts       pure formatting helpers and their tests
  hooks/render.test.ts            the pane, band and footer drawn on terminal and desktop
  types/index.d.ts                the mod's $.state contract
```
