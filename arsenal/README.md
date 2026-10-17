# arsenal

A Claude Code mod that puts the tool mods in this repo one press away. A button under the prompt, `◆ Arsenal ▾`, opens a framed menu above the prompt with a **Prompt Upgrade** switch and shortcuts to `/better` and `/report`. You no longer have to remember `/better history` or `/report week`.

> **Credit.** The idea comes from a YouTube video by Tristen O'Brien ([tristenobrien.ai](https://tristenobrien.ai/)), who also gave us the idea for prompt-upgrade. In it, a "Tristen's Tools ▼" button in the footer opens a menu of settings and shortcuts. arsenal is that menu for the tools in this repo, under a name that is not a person's. Why it is built the way it is: [DESIGN.md](./DESIGN.md).

```
╭──────────────────────────────────────────────────────────╮
│ ◆  A R S E N A L                        Opus 5.5 · High   │
│ ───────────────────────────────────────────────────────── │
│ ── S E T T I N G S                                        │
│ ○ Prompt Upgrade    upgrade every prompt first  [ ○ Off ] │
│ ── L A U N C H                                            │
│ ✦ Upgrade a prompt           ▤ Today's report             │
│ ◷ Prompt history             ▥ This week's report         │
│                              ⚙ Report settings            │
│                                                      ✕    │
╰──────────────────────────────────────────────────────────╯
```

## Use it

| Do | Result |
| --- | --- |
| Press `◆ Arsenal ▾` at the right end of the line under the prompt | Opens the menu. The button turns to `▴`; press it again to close. |
| `/arsenal` | The same toggle from the keyboard. It works while Claude is busy. |
| `✕` at the bottom right of the menu | Closes it. The engine's own `[-]` collapses it. |

### The rows

| Row | Runs |
| --- | --- |
| Prompt Upgrade switch (`p`) | `/better on` or `/better off`. The pill shows the real setting: `● On` or `○ Off`. |
| ✦ Upgrade a prompt (`u`) | `/better` |
| ◷ Prompt history (`h`) | `/better history` |
| ▤ Today's report (`t`) | `/report today` |
| ▥ This week's report (`w`) | `/report week` |
| ⚙ Report settings (`s`) | `/report settings` |

Click a row, or focus the menu (a click, or `ctrl+x tab`) and press its letter. A Launch row runs its command and closes the menu. The switch leaves the menu open so you can see the pill change.

- **Two columns** when the terminal gives the menu 64 cells or more: prompt-upgrade's rows on the left, work-report's on the right. Narrower, one column.
- **During a turn** a press is queued by the engine until Claude is idle. The menu stays open with `queued: /report today` under the rows, and closes once the command has run.
- **A failure** shows as a line under the rows, or as a toast if the menu had already closed.
- **The header** shows the model and effort of the last request (`Opus 5.5 · High`), or the model alone for a model without effort. It only reads them. arsenal never changes the model or the effort.

### Which rows show

arsenal reads the session's command list and keeps only the rows whose command exists. With only prompt-upgrade installed there is no work-report column, and the other way round. With neither, there is no button either. It needs `prompt-upgrade` and/or `work-report` to show anything.

## What it does not do

- **It is a remote control.** Every row ends in a slash command the tool already has. arsenal never writes another mod's state and never imports another mod's code. If you uninstall a tool, its rows disappear.
- **It leaves the status mods alone.** `ctx`, `subagent-progress` and `agent-pulse` already have their bands. When the menu is open it draws above them and they stay below it.
- **It has no model or effort picker.** There is no "auto model" and no helper-agent model setting.
- **It yields to surveys.** While Claude asks a question in the band, the menu steps aside.
- **It keeps nothing between sessions.** A new session starts with the menu closed.
- **It makes no model calls and sends nothing anywhere.**

## Install

```
claude plugin marketplace add afterever/claude-mods
claude plugin install arsenal@afterever-mods
```

Restart Claude Code afterwards. Install `prompt-upgrade` and `work-report` from the same marketplace for the rows to appear.

## Develop

```
claude --plugin-dir E:\github\claude-mods\arsenal
claude plugin validate E:\github\claude-mods\arsenal
claude plugin test E:\github\claude-mods\arsenal
```

`hooks/menu.ts` is the arithmetic and wording (model and effort labels, which rows, the columns) and `hooks/menu.test.ts` tests it. `hooks/register.tsx` is the hooks, and `hooks/render.test.ts` runs them in the engine's test kit on the terminal and the desktop surface.
