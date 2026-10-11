# Setting up my Claude Code mods on a new computer

One file to reproduce this laptop's Claude Code mod setup elsewhere: which mods to install, the
one line of global `CLAUDE.md` they rely on, and the local patch and skin that are not in any
repository. Each mod has its own section; when the setup changes, change the section, do not add a
file.

## Quick start

Paste this into Claude Code on the new computer:

> Read `SETUP.md` in the `afterever/claude-mods` repository and set up my Claude Code mods exactly
> as it says: add the marketplaces and install the plugins, add the Goal meter bullet to my global
> `~/.claude/CLAUDE.md` (update in place if it is already there), apply the skins patch, and
> rebuild the `cupertino` skin. Show me the diff before changing any file, and run the
> checks at the end.

## Mods at a glance

| Mod | Source | Tested | What it is |
| --- | --- | --- | --- |
| `ctx` | `afterever/claude-mods` (this repo) | 0.6.2 | Context window pane and band, compacting on your terms |
| `subagent-progress` | `afterever/claude-mods` (this repo) | 2.0.0 | Progress bar and live panel for subagent work |
| `goal-meter` | `nateherkai/claude-code-mods` | 1.0.0 | Task plan shown as a progress bar while a `/goal` runs |
| `skins` | `hellosverre/claude-skins` | 0.5.1 | Colour scheme and words for the transcript |
| `cache-keeper` | `nateherkai/claude-code-mods` | 1.0.0 | Adds the `session-handoff` skill |

## Install

```
claude plugin marketplace add afterever/claude-mods
claude plugin marketplace add nateherkai/claude-code-mods
claude plugin marketplace add hellosverre/claude-skins

claude plugin install ctx@afterever-mods
claude plugin install subagent-progress@afterever-mods
claude plugin install goal-meter@nateherk-mods
claude plugin install cache-keeper@nateherk-mods
claude plugin install skins@hellosverre-mods
```

Restart Claude Code afterwards: an installed plugin is not hot-reloaded. Pick up new versions of
the mods in this repo with `claude plugin marketplace update afterever-mods` and then
`claude plugin update <name>@afterever-mods`.

## ctx

My own mod: context window details in a pane and a band above the prompt. Nothing to configure
after installing, except that the pane docks to the right only in the fullscreen layout:
[ctx/README.md](./ctx/README.md#get-the-pane-on-the-right-use-the-fullscreen-layout). What it does
and the commands: [ctx/README.md](./ctx/README.md#use-it). Why each feature exists:
[ctx/DESIGN.md](./ctx/DESIGN.md).

## subagent-progress

My fork of johnnyvizz's `savvy-progress`, renamed in 2.0.0: a progress bar above the prompt and a
live agents panel, each subagent a crab whose costume follows its model and effort. Nothing to
configure. What it does and what changed: [subagent-progress/README.md](./subagent-progress/README.md).

**Do not install `savvy-progress` next to it.** Both register `/agents-info`.

## goal-meter

`goal-meter` gives Claude one tool, `mcp__goal-meter__tasks`, that holds the task plan the bar
shows. It only fills in if Claude is told to use it, which is one bullet in the global
`~/.claude/CLAUDE.md` (Windows: `C:\Users\<user>\.claude\CLAUDE.md`).

Add this under the other global instructions:

```markdown
- **Goal meter:** For multi-step work (3+ steps), load `mcp__goal-meter__tasks` via ToolSearch and call action `plan` before starting, then `start`/`done` each task as you go. Skip it for small single-step requests. Subagents should not call `plan` (it would replace the main agent's pending tasks).
```

- **Trigger:** work of 3 or more steps. Small single-step requests skip it.
- **Flow:** load the tool, call `plan` first with every task, then `start` and `done` each task.
- **Subagents:** they must not call `plan`, because it replaces the main agent's pending tasks.
- **Edit the file, do not re-create it.** Keep the user's other global instructions as they are.
  If the file is a hard link, write into it in place; an editor that replaces the file breaks the
  link.
- **If a "Goal meter" bullet is already there,** update it in place instead of adding a second one.

## skins

`skins` is third-party. Two things on top of it are mine and live nowhere else: a one-line patch
to its code, and a made skin called `cupertino`. Apply the patch first, restart, then build the
skin.

### Patch 1: empty spinner and done lists mean "use Claude Code's own words"

**Why.** A made skin can set `spinner` and `done` words, capped at 12 words of 24 characters.
Claude Code's own pool is 185 spinner words and 8 done words, so a skin can never carry them all.
The render code already supports "no words": `pick(active.skin.spinner, e.props.word) ?? e.props.word`
returns the original word for an empty list. But `resolveSkin` refuses to leave a list empty and
substitutes the base skin's words ("Thinking", "Done"...). The patch lets an empty list stay empty.

**Where.** `hooks/custom.ts` in the installed plugin, function `resolveSkin`, near line 75:

```
~/.claude/plugins/cache/hellosverre-mods/skins/<version>/hooks/custom.ts
```

**Change.**

```diff
-    spinner: made.spinner.length > 0 ? made.spinner : base.spinner,
-    done: made.done.length > 0 ? made.done : base.done,
+    // LOCAL PATCH: an empty list stays empty so register.tsx falls back to Claude Code's own words.
+    spinner: made.spinner,
+    done: made.done,
```

- **Written against skins 0.5.1.** On another version, check that the two original lines match
  before replacing them, and that `register.tsx` still falls back with `?? e.props.word`.
- **It does not survive an update.** `claude plugin update skins@hellosverre-mods` replaces the
  cache directory wholesale, so apply it again after every update.
- **Restart Claude Code after patching.**
- **Side effect.** It applies to every made skin: one saved without words shows Claude Code's own
  words instead of its base skin's. Built-in skins are unaffected, since they are returned before
  this code.
- **Revert** by reinstalling: `claude plugin uninstall skins@hellosverre-mods`, then install again.

### The `cupertino` skin

A macOS/iOS dark-mode colour scheme on the `noir` base. A made skin is stored in the skins
plugin's own store, **not in git**, so rebuild it from the table below.

**Palette.** Source: Apple Human Interface Guidelines, *Color*, system colours, dark, default
contrast (iOS table), read on 2026-10-10 from
`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/color.json`. The page
is JS-rendered and the swatch values exist only as image alt text (for example `R-255, G-66,
B-69`), so a plain page fetch returns just the title.

| slot | hex | Apple source | used for |
|---|---|---|---|
| user | `#0091FF` | Blue | accent: rail, prompt marker, spinner |
| read | `#3CD3FE` | Cyan | Read |
| write | `#FF9230` | Orange | Edit / Write |
| run | `#FFD600` | Yellow | Bash / PowerShell |
| search | `#DB34F2` | Purple | Glob / Grep |
| web | `#6D7CFF` | Indigo | WebFetch / WebSearch |
| mcp | `#B78A66` | Brown | MCP tools |
| ok | `#30D158` | Green | finished call |
| err | `#FF4245` | Red | failed call |
| **warn** | `#FF6A00` | *none* | interrupted call |
| fg | `#FFFFFF` | label (white) | body text |
| muted | `#8E8E93` | systemGray | secondary text |
| surface | `#2C2C2E` | systemGray5 | table header band |
| zebra | `#1C1C1E` | systemGray6 | alternate table rows |
| other | `#AEAEB2` | systemGray, increased contrast | anything else |

Words: `spinner: []` and `done: []`, so Claude Code's own 185 spinner and 8 done words show. This
is what Patch 1 is for.

**Rebuild.** Pass `[]` explicitly: omitting the fields keeps the previous words. `[]` passes
validation because `every` on an empty array is true and the schema has no `minItems`.

```
mcp__skins__design  action=save  name=cupertino  base=noir  spinner=[]  done=[]
  palette={"user":"#0091FF","fg":"#FFFFFF","muted":"#8E8E93","surface":"#2C2C2E","zebra":"#1C1C1E",
           "ok":"#30D158","err":"#FF4245","warn":"#FF6A00","read":"#3CD3FE","write":"#FF9230",
           "run":"#FFD600","search":"#DB34F2","web":"#6D7CFF","mcp":"#B78A66","other":"#AEAEB2"}
```

`save` also applies the skin and overwrites a skin of the same name. `/skin list` then shows
`cupertino` as `●`.

**Applying changes.** A palette save takes effect immediately in the running session, no
restart. Only the Patch 1 code change needs a restart.

**Decisions worth remembering.**

- **`warn` is the only non-Apple value.** Apple's system colours have no orange-red, and `run`
  (yellow), `write` (orange) and `err` (red) already sit around it. `#FF6A00` maximises the minimum
  CIE76 distance: 21 from `write`, 34 from `err`. The Apple-sourced alternative that is clearly
  distinct is the increased-contrast pink `#FF8AC4`, rejected as odd for "interrupted".
- **`run` stays yellow** (Terminal/Xcode convention) and `warn` moved, chosen over giving `run` a
  mint or teal, which land 14-29 from `read`.
- **Unverified:** the HIG page lists no numbers for `label`, `secondaryLabel` or `tertiaryLabel`,
  and no numeric macOS table. `fg` and `muted` are judged against the gray scale only. Apple says
  these values change between releases.
- **`zebra` `#1C1C1E`** is a step off a pure black background. On a `#1E1E1E`-style terminal
  background it is nearly invisible; `tables` is `off`, so it is not seen.

## cache-keeper

Third-party, installed as is. It adds the `session-handoff` skill, which writes a structured
end-of-session summary. Nothing to configure.

## Check it worked

- `claude plugin list` shows the five plugins above.
- `/ctx` opens the context pane, and the band shows above the prompt.
- Run a few subagents: the progress bar fills and ends in a green Done row; `/agents-info` toggles
  the panel.
- `mcp__skins__design {"action":"show"}` reports `"spinner":[]` and `"done":[]` for `cupertino`. If
  it still lists noir's words, the unpatched `custom.ts` is the one loaded: patch and restart.
- In use, the spinner shows a Claude Code pool word (Clauding, Reticulating...) and the turn
  footer an original done word (Baked, Brewed, Sautéed...).
- A multi-step request makes Claude call `mcp__goal-meter__tasks` with `plan` first.

## Keeping this file current

- Change a mod's setup, change its section here, in the same commit.
- Record the version a section was written against, and re-check it after the mod updates.
- Mods that belong to this repository keep their design notes in their own folder; this file only
  holds what it takes to reproduce the setup.
- Keep it public-safe: no home paths, emails or secrets, and only the specific `CLAUDE.md` lines
  meant to be shared, never the whole file.
