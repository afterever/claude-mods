# Setting up my Claude Code mods on a new computer

One file to reproduce this laptop's Claude Code mod setup elsewhere: which mods to install, the
one line of global `CLAUDE.md` they rely on, and the `/skin` setting and skin that are not in any
repository. Each mod has its own section; when the setup changes, change the section, do not add a
file.

## Quick start

Paste this into Claude Code on the new computer:

> Read `SETUP.md` in the `afterever/claude-mods` repository and set up my Claude Code mods exactly
> as it says: add the marketplaces and install the plugins, add the Goal meter bullet to my global
> `~/.claude/CLAUDE.md` (update in place if it is already there), run `/skin words claude`, and
> rebuild the `cupertino` skin. Show me the diff before changing any file, and run the
> checks at the end.

## Mods at a glance

| Mod | Source | Tested | What it is |
| --- | --- | --- | --- |
| `ctx` | `afterever/claude-mods` (this repo) | 0.6.2 | Context window pane and band, compacting on your terms |
| `subagent-progress` | `afterever/claude-mods` (this repo) | 2.0.1 | Progress bar and live panel for subagent work |
| `prompt-upgrade` | `afterever/claude-mods` (this repo) | 0.1.0 | `/better` turns a rough prompt into a great one before it is sent |
| `work-report` | `afterever/claude-mods` (this repo) | 0.2.0 | `/report` shows what Claude has done for you: tasks, hours saved, what that is worth |
| `goal-meter` | `nateherkai/claude-code-mods` | 1.0.0 | Task plan shown as a progress bar while a `/goal` runs |
| `skins` | `hellosverre/claude-skins` | 0.5.6 | Colour scheme and words for the transcript |
| `cache-keeper` | `nateherkai/claude-code-mods` | 1.0.0 | Adds the `session-handoff` skill |
| `agent-pulse` | `afterever/claude-mods` (this repo) | 1.1.0 | Box above the prompt naming the step Claude is on, in color and motion, with a step history |
| `arsenal` | `afterever/claude-mods` (this repo) | 0.1.0 | Footer button that opens a menu: Prompt Upgrade switch and shortcuts to `/better` and `/report` |

## Install

```
claude plugin marketplace add afterever/claude-mods
claude plugin marketplace add nateherkai/claude-code-mods
claude plugin marketplace add hellosverre/claude-skins

claude plugin install ctx@afterever-mods
claude plugin install subagent-progress@afterever-mods
claude plugin install prompt-upgrade@afterever-mods
claude plugin install work-report@afterever-mods
claude plugin install agent-pulse@afterever-mods
claude plugin install arsenal@afterever-mods
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

## prompt-upgrade

My own mod, built from the Prompt Upgrade idea and spec of the author of AI Made Easy
([tristenobrien.ai](https://tristenobrien.ai/)): `/better` asks up to three quick questions,
rewrites a rough prompt and shows the original and the upgrade side by side. Nothing is sent until
you press Run. Written against 0.1.0. Nothing to configure.

- **It costs tokens only when used:** each upgrade makes two model calls (`haiku` picks the
  questions, `sonnet` writes the rewrite). `/better on` makes every typed prompt go through the pane
  first; it starts off and is remembered between sessions.
- What it does and the commands: [prompt-upgrade/README.md](./prompt-upgrade/README.md).

## work-report

My own mod: `/report` opens a pane with Today, Week, Month and Year tabs showing the tasks Claude
finished, an estimate of the hours that saved and what they are worth. Written against 0.2.0.
Nothing to configure, but the figures are estimates from settings you can change.

- **Set the estimate once:** `/report settings` lists the minutes each kind of task saves and the
  hourly rate; `/report settings rate 75` changes one.
- **It makes no model calls and sends nothing anywhere.** Counts are kept in the mod's own store on
  this computer. The store belongs to the installed copy, so a `--plugin-dir` run keeps a separate
  count.
- **A chip above the prompt** shows today's count and opens the pane. Other bands above the prompt
  stack under it.
- What it counts, how a task is sorted and how the pane narrows:
  [work-report/README.md](./work-report/README.md).

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

`skins` is third-party, written against 0.5.6. Two things on top of it are mine and live nowhere
else: one setting, `/skin words claude`, and a made skin called `cupertino`. Set the words, then
build the skin.

### Setting: `/skin words claude` keeps Claude Code's own words

**Why.** A made skin can set `spinner` and `done` words, capped at 12 words of 24 characters.
Claude Code's own pool is 185 spinner words and 8 done words, so a skin can never carry them all.
Since 0.5.5 the plugin has a global setting for it: `/skin words claude` makes the spinner and the
turn footer show Claude Code's own word whatever the skin says. `/skin words skin` is the default
and draws the skin's words. Saved skins keep their words either way.

```
/skin words claude
```

- **It replaces my old local patch** to `resolveSkin` in `hooks/custom.ts`. That patch is not
  needed and must not be applied: upstream took the request (issue #37, merged as
  [hellosverre/claude-skins#45](https://github.com/hellosverre/claude-skins/pull/45)) as this
  setting instead. A machine that still has the patched cache loses it on
  `claude plugin update skins@hellosverre-mods`, which replaces the cache directory wholesale.
- **Nothing to patch after an update.** The setting lives with the plugin's other `/skin`
  preferences, not in the cache directory.
- **It applies to every skin, built-in ones too.** `/skin list` shows the current value.

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
| search | `#FF6165` | Red, increased contrast | Glob / Grep |
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

Words: none set. With `/skin words claude` Claude Code's own 185 spinner and 8 done words show,
so the skin's words are never drawn.

**Rebuild.**

```
mcp__skins__design  action=save  name=cupertino  base=noir
  palette={"user":"#0091FF","fg":"#FFFFFF","muted":"#8E8E93","surface":"#2C2C2E","zebra":"#1C1C1E",
           "ok":"#30D158","err":"#FF4245","warn":"#FF6A00","read":"#3CD3FE","write":"#FF9230",
           "run":"#FFD600","search":"#FF6165","web":"#6D7CFF","mcp":"#B78A66","other":"#AEAEB2"}
```

`save` also applies the skin and overwrites a skin of the same name. `/skin list` then shows
`cupertino` as `●`.

**Applying changes.** A palette save takes effect immediately in the running session, no
restart.

**Decisions worth remembering.**

- **`warn` is the only non-Apple value.** Apple's system colours have no orange-red, and `run`
  (yellow), `write` (orange) and `err` (red) already sit around it. `#FF6A00` maximises the minimum
  CIE76 distance: 21 from `write`, 34 from `err`. The Apple-sourced alternative that is clearly
  distinct is the increased-contrast pink `#FF8AC4`, rejected as odd for "interrupted".
- **`search` is the increased-contrast red, close to `err`.** Apple's Purple (`#DB34F2`) rendered
  as magenta, so `search` took the lighter red `#FF6165`. It is 16 CIE76 from `err` (`#FF4245`),
  the tightest gap in the palette; the default reds are 5 to 9 away and unusable. Revert to
  `#DB34F2` if Grep rows and failed calls get confused.
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

## agent-pulse

My fork of Tzafrir Rehan's `whats-agent-doing` 0.4.3, imported with its history and renamed: a
box above the prompt that names the step Claude is on in plain English and how long it has been on
it, with color, motion and small charts added on the terminal and the desktop app's Code tab, and a
jellyfish on the desktop. Written against 1.1.0. What changed:
[agent-pulse/README.md](./agent-pulse/README.md); why: [agent-pulse/DESIGN.md](./agent-pulse/DESIGN.md).

**Do not install `whats-agent-doing` next to it,** or two boxes show. Remove it first with
`claude plugin uninstall whats-agent-doing@tzafrir`, and the `tzafrir` marketplace with it.

- **Set it in `/config`:** type `Animation` to find its three rows. Mine are **Animation `full`**,
  Palette `ember` (the default since 1.1.0), Sound `off`. `subtle` is the default and calmer; `off` keeps the colors and
  charts but stills everything.
- **Expand the history:** click the triangle, or focus the box with `ctrl+x tab` and press Enter.
  Collapse the whole band with `ctrl+x ctrl+a`.
- **It only displays.** No network, files or model calls, so it costs no tokens, and it never
  answers a permission prompt, only shows that one is waiting (and chimes, if Sound is on).
- **Both it and `subagent-progress` show background agents,** so an agent appears in two places:
  the crabs are the subagents, the jellyfish is Claude.
- **Needs function hooks,** which are early access: it loads in a terminal or the desktop app's
  Code tab, not in Claude chat or Cowork, and its API may change between releases.

## arsenal

My own mod, from an idea in a video by the author of AI Made Easy ([tristenobrien.ai](https://tristenobrien.ai/)):
a `◆ Arsenal ▾` button at the right end of the line under the prompt opens a framed menu above the
prompt, with a Prompt Upgrade on/off switch and one-press shortcuts to `/better` and `/report`.
`/arsenal` toggles it from the keyboard. Written against 0.1.0. Nothing to configure.

- **It needs `prompt-upgrade` and/or `work-report` installed to show anything.** It lists the
  session's commands and keeps only the rows whose command exists; with neither tool there is no
  button. Install those two first, or restart Claude Code after installing them.
- **It is a remote control.** Every row runs a slash command the tool already has, and it never
  writes another mod's state. It shows the model and effort in its header and never changes them.
- **It makes no model calls and keeps nothing between sessions.**
- What it does, the keys and the rows: [arsenal/README.md](./arsenal/README.md); why:
  [arsenal/DESIGN.md](./arsenal/DESIGN.md).

## Check it worked

- `claude plugin list` shows the nine plugins above.
- `/ctx` opens the context pane, and the band shows above the prompt.
- Run a few subagents: the progress bar fills and ends in a green Done row; `/agents-info` toggles
  the panel.
- `/skin list` shows `words claude`, and `cupertino` as `●`.
- In use, the spinner shows a Claude Code pool word (Clauding, Reticulating...) and the turn
  footer an original done word (Baked, Brewed, Sautéed...).
- A multi-step request makes Claude call `mcp__goal-meter__tasks` with `plan` first.
- `/better` opens a pane that asks for a rough prompt; `/report` opens the Work Report pane, and a
  `Work report` chip shows above the prompt.
- A `◆ Arsenal ▾` button shows at the right end of the line under the prompt; pressing it (or
  `/arsenal`) opens a menu with the Prompt Upgrade switch and the Launch rows, and the bands of
  `ctx`, `agent-pulse` and `subagent-progress` stay under it.
- While Claude works, a box above the prompt names the current step with a spinning glyph and a
  timer, its border flashing as calls end; the triangle expands the history.

## Keeping this file current

- Change a mod's setup, change its section here, in the same commit.
- Record the version a section was written against, and re-check it after the mod updates.
- Mods that belong to this repository keep their design notes in their own folder; this file only
  holds what it takes to reproduce the setup.
- Keep it public-safe: no home paths, emails or secrets, and only the specific `CLAUDE.md` lines
  meant to be shared, never the whole file.
