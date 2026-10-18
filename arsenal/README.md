# arsenal

A Claude Code mod that puts the tool mods in this repo, and your own skills and commands, one press away. A `◆ Arsenal ▾` button, the last row right above the prompt box, opens a menu pane docked on the right with a **Prompt Upgrade** switch, shortcuts to `/better` and `/report`, and a **USER** and a **PROJECT** section listing the skills and commands you wrote. You no longer have to remember `/better history` or `/report week`, or what you named your own commands.

> **Credit.** The idea comes from a YouTube video by Tristen O'Brien ([tristenobrien.ai](https://tristenobrien.ai/)), who also gave us the idea for prompt-upgrade. In it, a "Tristen's Tools ▼" button in the footer opens a menu of settings and shortcuts. arsenal is that menu for the tools in this repo, under a name that is not a person's. Why it is built the way it is: [DESIGN.md](./DESIGN.md).

```
  (the other mods' bands)                       ┌ Arsenal ─────────────────────────┐
                            [ ◆ Arsenal ▴ ]     │ ◆  A R S E N A L  Opus 5.5 · High │
 ────────────────────────────────────────────   │ ──────────────────────────────── │
 > your prompt                                  │ ── S E T T I N G S               │
 ────────────────────────────────────────────   │ ○ Prompt Upgrade        ○ Off    │
                                                │   upgrade every prompt first     │
                                                │ ── L A U N C H                   │
                                                │ u: ✦ Upgrade a prompt            │
                                                │ h: ◷ Prompt history              │
                                                │ t: ▤ Today's report              │
                                                │ w: ▥ This week's report          │
                                                │ s: ⚙ Report settings             │
                                                │ ── U S E R              ✎ edit   │
                                                │ /handoff  Use when the u…   …    │
                                                │ /standup  Yesterday's work       │
                                                │ ── P R O J E C T        ✎ edit   │
                                                │ /seed-db  Reset the local d…     │
                                                └──────────────────────────────────┘
```

## Use it

| Do | Result |
| --- | --- |
| Press `◆ Arsenal ▾`, the last row above the prompt box | Opens the menu pane, docked on the right in fullscreen (above the prompt otherwise). The button turns to `▴`; press it again to close. |
| `/arsenal` | The same toggle from the keyboard. It works while Claude is busy. |
| Esc, or the pane's close mark | Closes it, and the button turns back to `▾`. |

### The rows

| Row | Runs |
| --- | --- |
| Prompt Upgrade switch (`p`) | `/better on` or `/better off`. The pill shows the real setting: `● On` or `○ Off`. |
| ✦ Upgrade a prompt (`u`) | `/better` |
| ◷ Prompt history (`h`) | `/better history` |
| ▤ Today's report (`t`) | `/report today` |
| ▥ This week's report (`w`) | `/report week` |
| ⚙ Report settings (`s`) | `/report settings` |

Click a row, or focus the pane and press its letter.

- **A Launch row** closes the Arsenal pane, then runs its command, so the tool's own pane takes its place. During a turn, the engine runs the command once Claude is idle.
- **The switch** leaves the pane open so you can watch the pill change. The line at the bottom says `sent: /better on`, then `ran: /better on`.
- **A failure** shows on that bottom line, or as a toast if the pane had already closed.
- **Two columns** from 64 cells: drag the dock wider and the work-report rows move to a column of their own.
- **The header** shows the model and effort of the last request (`Opus 5.5 · High`), or the model alone for a model without effort. It only reads them. arsenal never changes the model or the effort.

### Which rows show

arsenal reads the session's command list and keeps only the rows whose command exists. With only prompt-upgrade installed there are no work-report rows, and the other way round. With neither tool and no commands of your own, there is no button either.

## Your own commands

Under LAUNCH, two sections list what you wrote yourself:

- **USER** is `~/.claude/skills/<name>/SKILL.md` and `~/.claude/commands/<name>.md`.
- **PROJECT** is the same two folders in the current repo (its top level, from any subfolder or worktree).

A section with nothing in it is not drawn. Plugins' skills and commands, built-ins, MCP prompts, the claude.ai-synced skills and commands in subfolders are not listed, and neither is a skill with `user-invocable: false`. A name that is in both places is shown under USER, because that is the one `/name` runs. arsenal keeps only what the engine itself lists as yours, so a row is never a file that did nothing when pressed.

| Do | Result |
| --- | --- |
| Press a row | Closes the pane and runs the command bare, as if you had typed `/name`. |
| Press the `…` at the end of a row | Closes the pane and puts `/name ` in the prompt box for you to finish. Only commands with an `argument-hint` have one. A draft already in the box is never written over: you get a toast instead. |
| Press `✎ edit` on a section's header | Shows every command in the section with a `● On` / `○ Off` pill. A press flips it at once and saves it. `✓ done` goes back. One section is in edit mode at a time, and closing the pane leaves it. |

Everything is on at first. What you turn **off** is saved on this machine (so a home and a work PC keep separate lists), and a command you add later shows up by itself. PROJECT's list belongs to the repo: a command turned off in a repo stays off in each of its worktrees and subfolders, and does not touch a same-named command in another repo. A section whose commands are all off still shows its header, so `✎ edit` can turn them back on. The folders are read again each time the menu opens.

These rows have no hotkeys. LAUNCH keeps its own.

## What it does not do

- **It is a remote control.** Every row ends in a slash command that already exists. arsenal never writes another mod's state or your skill and command files, and never imports another mod's code. If you uninstall a tool, its rows disappear.
- **It leaves the status mods alone.** `ctx`, `subagent-progress` and `agent-pulse` keep their bands. The button is drawn after them, as the band's last row.
- **It has no model or effort picker.** There is no "auto model" and no helper-agent model setting.
- **It yields to surveys.** While Claude asks a question in the band, the button steps aside.
- **It keeps one thing between sessions: which of your own commands you turned off.** A new session starts with the menu closed.
- **It makes no model calls and sends nothing anywhere.**

## Install

```
claude plugin marketplace add afterever/claude-mods
claude plugin install arsenal@afterever-mods
```

Restart Claude Code afterwards. Install `prompt-upgrade` and `work-report` from the same marketplace for the LAUNCH rows to appear; USER and PROJECT need nothing else.

## Develop

```
claude --plugin-dir E:\github\claude-mods\arsenal
claude plugin validate E:\github\claude-mods\arsenal
claude plugin test E:\github\claude-mods\arsenal
```

`hooks/menu.ts` is the arithmetic and wording (model and effort labels, which rows, the columns, off lists, row layout) and `hooks/menu.test.ts` tests it. `hooks/own.ts` is the pure part of finding your own commands (frontmatter, names, the project key) and `hooks/own.test.ts` tests it. `hooks/register.tsx` is the hooks, including the folder and git reads, and `hooks/render.test.ts` runs them in the engine's test kit on the terminal and the desktop surface.

A band mod that should stay above the button draws its own rows first and the tree of the mods beneath it (`await next(e)`) after them, as every band mod in this repo does. DESIGN.md explains why under "Staying the band's last row".
