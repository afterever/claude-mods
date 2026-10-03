# claude-mods

Personal [Claude Code mods](https://code.claude.com/docs): plugins of function hooks that draw panes, bands and footers inside Claude Code. This repo is also a plugin marketplace, so every computer installs the same mods the same way.

| Mod | What it does |
| --- | --- |
| [`ctx`](./ctx) | Context window details in a pane and a band above the prompt: how full, how fast it is filling, what filled it, and compacting on your terms. Why each feature exists: [ctx/DESIGN.md](./ctx/DESIGN.md). |

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

## Use ctx

| Command or key | Does |
| --- | --- |
| `/ctx`, or 📊 / `x` on the band | Open or close the pane |
| `/ctx exact`, `/ctx quick` (`e` in the pane) | Count with the token API, or estimate locally (the default) |
| `/ctx compact [focus]` (`c`) | Compact now, keeping your focus, edited files and latest requests |
| `/ctx autokeep on|off` (`k`) | Add the same to every compaction, auto-compact included (off by default) |
| `m` `f` `s` `a` `h` `d` in the pane | Open MCP tools, memory files, skills, agents, heaviest results, unused so far |
| `r` in the pane | Count again |

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
  DESIGN.md                       why each feature exists and how it is built
  .claude-plugin/plugin.json      name, version, state contract
  hooks/hooks.json                points at register.tsx
  hooks/register.tsx              the mod
  hooks/fmt.ts, fmt.test.ts       pure formatting helpers and their tests
  hooks/usage.ts, usage.test.ts   tool-result sizes, usage counts, the project log
  hooks/compact.ts, compact.test.ts  keep instructions and the auto-compact warning
  hooks/render.test.ts            the pane, band and footer drawn on terminal and desktop
  types/index.d.ts                the mod's $.state contract
```
