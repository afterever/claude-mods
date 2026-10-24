# arsenal

A Claude Code mod that puts the tool mods in this repo, and your own skills and commands, one press away. A `[ ◆ Arsenal ▾ ]` button in Claude's orange, in the footer on the first row under the prompt box, opens a menu pane docked on the right with a **Prompt Upgrade** switch, a **Sound notifications** switch and sound picker, shortcuts to `/prompt-upgrade` and `/work-report`, and a **USER** and a **PROJECT** section listing the skills and commands you wrote. You no longer have to remember `/prompt-upgrade history` or `/work-report week`, or what you named your own commands, and you can look away while Claude works: a sound tells you when it is done or needs you.

> **Credit.** The idea comes from a YouTube video by Tristen O'Brien ([tristenobrien.ai](https://tristenobrien.ai/)), who also gave us the idea for prompt-upgrade. In it, a "Tristen's Tools ▼" button in the footer opens a menu of settings and shortcuts. arsenal is that menu for the tools in this repo, under a name that is not a person's. The sound notifications are an idea from [angomedia/claude-mods](https://github.com/angomedia/claude-mods) (their done-chime, MIT); the code here is written fresh for Windows. Why it is built the way it is: [DESIGN.md](./DESIGN.md).

```
  (the other mods' bands)                       ┌ Arsenal ─────────────────────────┐
                                                │ ◆  A R S E N A L  Opus 5.5 · High │
 ────────────────────────────────────────────   │ ──────────────────────────────── │
 > your prompt                                  │ ── S E T T I N G S               │
 ────────────────────────────────────────────   │ ○ Prompt Upgrade        ○ Off    │
 [ ◆ Arsenal ▴ ] ◎ plan 44% · ~2m               │   upgrade every prompt first     │
                                                │ ● Sound notifications   ● On     │
                                                │   reply done · asked a question  │
                                                │ ♪ Sound       Windows Notify ▸   │
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
| Press `[ ◆ Arsenal ▾ ]`, in the footer on the first row under the prompt box | Opens the menu pane, docked on the right in fullscreen (above the prompt otherwise). The button turns to `▴`; press it again to close. |
| `/arsenal` | The same toggle from the keyboard. It works while Claude is busy. |
| Esc, or the pane's close mark | Closes it, and the button turns back to `▾`. |

### The rows

| Row | Runs |
| --- | --- |
| Prompt Upgrade switch (`p`) | `/prompt-upgrade on` or `/prompt-upgrade off`. The pill shows the real setting: `● On` or `○ Off`. |
| Sound notifications switch (`c`) | Turns the sounds on or off, as `/chime on` and `/chime off` do. |
| ♪ Sound (`o`) | Only while the sounds are on. Picks the next sound in the list and plays it. |
| ✦ Upgrade a prompt (`u`) | `/prompt-upgrade` |
| ◷ Prompt history (`h`) | `/prompt-upgrade history` |
| ▤ Today's report (`t`) | `/work-report today` |
| ▥ This week's report (`w`) | `/work-report week` |
| ⚙ Report settings (`s`) | `/work-report settings` |

Click a row, or focus the pane and press its letter.

- **A Launch row** closes the Arsenal pane, then runs its command, so the tool's own pane takes its place. During a turn, the engine runs the command once Claude is idle.
- **The switch** leaves the pane open so you can watch the pill change. The line at the bottom says `sent: /prompt-upgrade on`, then `ran: /prompt-upgrade on`.
- **A failure** shows on that bottom line, or as a toast if the pane had already closed.
- **Two columns** from 64 cells: drag the dock wider and the work-report rows move to a column of their own.
- **The header** shows the model and effort of the last request (`Opus 5.5 · High`), or the model alone for a model without effort. It only reads them. arsenal never changes the model or the effort.

### Which rows show

arsenal reads the session's command list and keeps only the tools' rows whose command exists. With only prompt-upgrade installed there are no work-report rows, and the other way round. The Sound notifications rows need no tool, so the button and SETTINGS are always there.

## Sound notifications

Off until you turn them on: press the switch (`c`), or `/chime on`. Then:

- **A reply is done:** the picked sound plays (only for Claude's own turn, not a subagent's, and not one you stopped).
- **Claude asks you something** (a question dialog) **or needs a permission OK:** a second, fixed sound plays, so you can tell them apart.

The ♪ Sound row (`o`) goes down the list: your own sounds first, then the system's (`Windows Notify Messaging`, `Windows Notify System Generic`, `Windows Message Nudge`, `Windows Ding`, `Windows Background`; on a Mac `Glass`, `Ping`, `Pop`, `Hero`, `Tink`). Each press plays the sound it lands on.

**Your own sounds.** Put `.wav` files in `~/.claude/arsenal/sounds/` (`C:\Users\<you>\.claude\arsenal\sounds\`). Each file name, without `.wav`, is a choice in the list, and the folder is read again every time the menu opens. A file called `question.wav` there is the question sound instead of the system's, and is not a choice in the list. If the sound you picked is deleted, the default plays.

**Apple's original sounds** are not in this repo, because they are Apple's. Copy them from a Mac and convert them once, because Windows cannot play `.caf` or `.aiff`: `afconvert -f WAVE -d LEI16 in.caf out.wav`. iMessage's tones are in `/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/AlertTones/` (`ReceivedMessage.caf` for a new message), and the alert sounds in `/System/Library/Sounds/` (`Glass.aiff`). Only `.wav` works so far.

| Command | Does |
| --- | --- |
| `/chime` | Says whether the sounds are on, which sound is picked, and the names to pick from. |
| `/chime on`, `/chime off` | The switch, from the keyboard. They work while Claude is busy. |
| `/chime sound <name>` | Picks a sound by name (any case) and plays it. |
| `/chime test` | Plays the picked sound, even while the sounds are off. |

The switch and the sound are saved on this machine. Sounds play through PowerShell on Windows and `afplay` on a Mac; on Linux nothing plays.

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

- **It is a remote control, with one thing of its own: the sound notifications.** Every other row ends in a slash command that already exists. arsenal never writes another mod's state or your skill and command files, and never imports another mod's code. If you uninstall a tool, its rows disappear.
- **It leaves the status mods alone.** `ctx`, `subagent-progress` and `agent-pulse` keep their bands. The button is not in the band at all; it sits in the footer, before the labels other mods add there, such as waypoints' plan.
- **It has no model or effort picker.** There is no "auto model" and no helper-agent model setting.
- **It keeps two things between sessions: which of your own commands you turned off, and the sound notifications' switch and sound.** A new session starts with the menu closed.
- **It makes no model calls and sends nothing anywhere.**

## Install

```
claude plugin marketplace add afterever/claude-mods
claude plugin install arsenal@afterever-mods
```

Restart Claude Code afterwards. Install `prompt-upgrade` and `work-report` from the same marketplace for the LAUNCH rows to appear; the sound notifications, USER and PROJECT need nothing else.

## Develop

```
claude --plugin-dir E:\github\claude-mods\arsenal
claude plugin validate E:\github\claude-mods\arsenal
claude plugin test E:\github\claude-mods\arsenal
```

`hooks/menu.ts` is the arithmetic and wording (model and effort labels, which rows, the columns, off lists, row layout) and `hooks/menu.test.ts` tests it. `hooks/own.ts` is the pure part of finding your own commands (frontmatter, names, the project key) and `hooks/own.test.ts` tests it. `hooks/chime.ts` is the pure part of the sound notifications (the sound list, the player's command line, the saved setting, `/chime`'s arguments) and `hooks/chime.test.ts` tests it. `hooks/register.tsx` is the hooks, including the folder and git reads, and `hooks/render.test.ts` runs them in the engine's test kit on the terminal and the desktop surface.

The button is a `SessionMode` hook: it wraps the engine's footer (`await next(e)`), which already holds the labels other mods added, and draws itself first with one space between. A mod that draws its own tree in that slot would replace the row below it, so add a label to `modes` instead, as waypoints does. DESIGN.md has the probe under "0.3.0: the launcher moves to the footer".
