# ctx: design notes

This document explains why `ctx` is built the way it is. [README.md](../README.md) covers installing it; this covers the reasoning behind each feature, the alternatives that were turned down, and the numbers chosen. It is written for whoever changes the mod next, including a future Claude session.

## The problem

Claude Code's context window is the budget every session spends. When it fills, the engine compacts the conversation: it replaces the history with a summary, and whatever the summary leaves out is gone. `/context` shows a breakdown, but only when you ask, only as a snapshot, and with no sense of how fast the window is filling or what filled it.

`ctx` answers four questions, in order of how often they come up:

1. **How full is it?** At a glance, without typing anything (the band, the bar).
2. **How fast is it filling, and when will it compact?** (The trend, the warning.)
3. **What filled it?** Both the per-turn cost (heaviest results) and the fixed cost paid every turn (unused overhead).
4. **When it compacts, what survives?** (Guided compact, autokeep.)

Each feature below maps to one of these questions. A feature that answered none of them was not added.

## Principles

These came out of the review of 0.1.0 and held for every later release.

- **Honest numbers over pretty ones.** A figure the pane shows must mean what it says. Deferred MCP schemas are not counted as "in context" (0.2.0). An exact count is not overwritten by an estimate a second later (0.2.0). Token figures that are estimates carry a `~`.
- **Never act unasked.** The mod observes everything and changes nothing on its own. Compacting only happens when the person presses `c` or types `/ctx compact`. Rewriting every compaction's instructions (autokeep) is off until turned on. Idle MCP servers get a suggestion, never an automatic disable.
- **Pushed, not polled.** Refresh on the engine's own events (`session.measure`, `tool.call`, `session.compact`), never on a timer that counts. The only timer redraws "updated 12s ago" and does no work.
- **Survive a hot reload.** Anything a drawing reads lives in `$.state` atoms, which the host keeps across reloads. Module variables hold only what is safe to lose (an in-flight counter, a pending flag).
- **One glance, then detail on demand.** The band is one line. The pane opens sections only when asked (`m`, `f`, `s`, `a`, `h`, `d`).
- **Same mod on every surface.** The render tests draw the pane and band on both the terminal and Desktop. Desktop gets the footer because it has no band.

## Architecture

### Files

| File | What it holds | Why separate |
| --- | --- | --- |
| `hooks/register.tsx` | Hooks, atoms, drawing | The only file that touches `$` |
| `hooks/fmt.ts` | Number formats, the bar, sparkline, trend, the file opener's command | Pure functions, unit-tested without an engine |
| `hooks/usage.ts` | Tool labels, token estimates, usage counts, the project log | Pure; the logic behind 0.4.0 |
| `hooks/compact.ts` | Keep instructions, warning levels and text | Pure; the logic behind 0.5.0 |
| `types/index.d.ts` | The `$.state` contract | `claude plugin validate` checks every state key against it |

Keeping the logic pure is what made four releases in one day safe: every rule with a number in it (the pace floor, the drop ratio, calibration) has a unit test that runs in milliseconds.

### Where state lives

| Kind | Survives | Used for |
| --- | --- | --- |
| `$.state` atoms | Hot reloads, not new sessions | Everything a drawing reads: `snap`, `history`, `eaters`, `usage`, `mode`, `warned`… |
| `$.store` | New sessions | Whether the pane was open, autokeep on/off, each project's MCP usage log |
| Module variables | Nothing | `turnChars`, `pendingMark`, `selfCompact`, the last-count-wins counters |

`mode` (exact or quick) is deliberately session state, not store: an exact count costs a token-count API call per change, so it should not quietly carry over into tomorrow's session.

### Two sources of truth for "how full"

- **The breakdown** (`$.session.usage({ breakdown })`): per category, as `/context` shows it. Either estimated locally (quick) or counted with the token API (exact).
- **The API's figure** (`e.context.tokens` on `session.measure`): the input tokens of the last response, as the engine reported them.

The bar, the rows and the sections use the breakdown, because only it has categories. The trend, the warning and the per-turn growth use the API's figure, because it is consistent: switching between exact and quick changes the breakdown's numbers for the same conversation, and a trend built on those would show jumps that never happened.

### Events

| Event | What ctx does |
| --- | --- |
| `session.start` | Registers `/ctx`, counts once, loads the project log and autokeep, reopens the pane if it was open |
| `session.measure` | Records the API's figure, learns characters per token, warns, recounts, writes the project log |
| `tool.call` | Wraps every call: records usage (server, skill, agent), result size, edited files |
| `prompt.submit` | Remembers the last three requests (not slash commands) |
| `session.compact` | With autokeep on, adds the keep instructions; afterwards marks, toasts and resets |
| `command.run` | `/ctx` and its arguments |
| `ui.render` | The band (`AbovePrompt`), the pane (`Pane`), the Desktop footer (`SessionMode`) |
| `ui.close` | A close by the person turns the toggle off; an unload does not |

## Features, by release

### 0.1.0: the pane and the band

The starting point: `/ctx` opens a pane that docks beside the transcript (from 110 columns in the fullscreen layout, above the prompt otherwise), and a 📊 band above the prompt toggles it. It mirrors the Desktop app's context panel, so the same information is one keypress away in the terminal.

### 0.2.0: fixing what was misleading, then making it beautiful

A review of 0.1.0 found three bugs, each of which made a number lie.

- **Exact counts were overwritten.** `/ctx full` ran a token-API count, then `setVisible` immediately ran a quick count over it, and the 30-second timer did the same again. The "counted with the token API" label almost never showed. *Fix:* the chosen detail level is state (`mode`), and every refresh counts at that level until the person switches back.
- **MCP totals included deferred schemas.** Tools that load on demand are listed with token counts but are not in the window until searched for. With dozens of connected servers, the header showed a large number that was not being paid. *Fix:* each tool's `isLoaded` splits the total into in-window and deferred, per server.
- **The bar wrapped in a narrowed dock.** `Math.max(50, bodyColumns)` floored the width; dragging the dock below 50 columns wrapped the bar onto two lines. *Fix:* the measured body width is the ceiling, not the floor.

Smaller fixes in the same spirit:
- **Overlapping counts:** a slow exact count could land after a newer quick one and overwrite it. Each count takes a sequence number, and an older one never overwrites a newer one.
- **Failed counts:** they used to fail silently, leaving a frozen number. Now the last snapshot is kept and marked `⚠ stale`.
- **The pane waited** on the count before opening. It now opens first, and the count fills it in.
- **Polling:** the 30-second timer was replaced by `session.measure`, which the engine pushes whenever the fill moves.
- **The `ctx N%` footer** was drawn on the terminal too, repeating the band. It is now Desktop only.

The visual work followed one rule: every detail must carry information.

- **Eighth-block bar.** Each cell can be split into 8 horizontal steps with `▏▎▍▌▋▊▉`, so the bar is 8× more precise than whole cells. Where one category ends mid-cell, the partial block is drawn in that category's color over a background of the next category's color, so a single cell shows the boundary. A category holding anything gets at least 2 eighths, so it never vanishes.
- **Bar order** follows `/context`: used categories, then free space (`·`), then the compaction buffer (`░`) against the right edge, where it actually sits.
- **Hover linking.** Each bar run and its category row share a hover group (`scope`). Pointing at either lights the other. The surface applies hovers itself, with no hook and no redraw, so this costs nothing at runtime.
- **Auto-compact marker** (`▲`) under the bar at the threshold, its label shortened or dropped on a narrow bar rather than overflowing.
- **Fill color** green below 50%, amber to 80%, red above, using theme keys so it follows the person's light or dark theme.
- **Section gauges** (6 cells) show each section's share of what is used. Agents and slash commands got rows because the breakdown had them and the pane did not show them. Skills show `included/total` and a `+N more` line rather than cutting the list off silently.

### 0.3.0: rate, not just level

A fill level alone cannot answer "when will this compact?". 0.3.0 added the rate.

- **The trend** records the API's figure after each turn (up to 48 readings), skipping repeats.
- **The sparkline is scaled to its own low and high**, not to the window. On a 1M window, growing from 20k to 36k is under 2% and would look flat; scaled to its own range the climb is obvious. The countdown gives the absolute picture.
- **The pace** is the average growth over the last 6 turns *since the last drop*. A compaction or `/clear` resets it instead of dragging it negative. Six turns smooths out one large file read without hiding a change of habit.
- **Turns to auto-compact** is the remaining headroom divided by the pace.

**Memory files open from the pane.** Memory files (CLAUDE.md and friends) are paid for every turn, so they are worth reading and trimming. Each row is a button that opens the file with its default app: `Start-Process` on Windows, `open` on macOS, `xdg-open` elsewhere. `$EDITOR` is deliberately ignored: a terminal editor launched from a hook has no terminal to draw in and would hang. The path is quoted for PowerShell by doubling single quotes, which has its own unit test.

### 0.4.0: what is using the context

The trend shows *that* the window jumped by 22k; 0.4.0 shows *why*.

**Heaviest results.** One `tool.call` hook wraps every call. After `next(e)`, the result's `text` is exactly what the model reads, so its length is that call's cost.
- **Main conversation only.** A subagent's results stay in its own window, so they are not charged to yours.
- **Characters per token are learned.** Four characters per token is a rough start. After each turn, the turn's result characters are compared with how much the window grew. The figure only learns from turns that were mostly tool results (growth of at least 2,000 tokens, and result characters accounting for at least half of it), moves a third of the way per sample, and stays between 2.5 and 6. Talk-heavy turns would otherwise teach it the wrong ratio.
- **The list keeps the 8 heaviest**, each over 2,000 characters, with the turn it landed in. Sizes from 5k are amber and from 15k red. Any single result over about 15k tokens gets a toast as it lands, which is the moment the habit can still change (read a range, add `| head`, narrow the grep).
- **A drop to under 70% of the previous reading** means a compaction or `/clear`. What was listed is gone from the window, so the list empties.

**Unused so far.** The breakdown already says what each MCP server, skill and agent costs just by being loaded. The same `tool.call` hook counts what is actually used: `mcp__<server>__*` calls, the `Skill` tool, and `Agent` subagent types.
- **Server keys come from wire names.** A tool named `mcp__claude_ai_Notion__notion-fetch` belongs to `claude_ai_Notion`. The breakdown's display name can differ, so the key is taken from the tool names on both sides.
- **The project log** (`$.store`, keyed by the session's working folder) keeps the last 30 sessions: which servers each had loaded and which it called. A hot reload reruns `session.start`, so the session's own line is left out when the log is loaded.
- **The idle streak** counts sessions in a row, newest back, that had the server loaded and never called it. A session without the server neither counts nor breaks the run. At 5 or more idle sessions, the pane suggests turning the server off in `/mcp`. It never turns anything off itself.

Fixed overhead is paid on every turn of every session. A 3k server nobody uses costs 3k × every turn, which is why this section exists even though it only ever suggests.

### 0.5.0: compacting on your terms

Auto-compaction's worst failure is losing the thread: the summary drops which files were being changed and what was just asked. 0.5.0 gives warning first, then control.

**The warning.**
- **Two levels.** *Near* fires at 10 turns left at the current pace, or 85% of the threshold. *Imminent* fires at 3 turns left, or 95%.
- **The pace floor.** The turns-left rule only counts once the window is at least 40% of the way to the threshold (60% for imminent). Without it, two readings make one step the whole pace: a single 100k `git log` at 12% full predicted "9 turns left" and warned. The fill rules (85%, 95%) stand regardless.
- **Once per step.** Each level toasts once as it is reached, and a compaction re-arms both. A warning that repeats every turn gets ignored.
- **Where it shows.** A toast, the band's `ctx` label and a `⚠ ~N turns` badge in amber or red, and a line in the pane. Below 100 columns the badge takes the sparkline's place, so the band stays one line.

**Guided compact.** `/ctx compact [focus]` (or `c`) calls `$.session.compact` with instructions to keep:
- the focus the person typed, if any;
- the files the session changed (successful `Edit`, `Write` and `NotebookEdit` calls, the last 12);
- the last 3 requests, clipped to one line each. Slash commands are left out because they are not requests about the work.

**Autokeep.** `/ctx autokeep on` (or `k`) adds the same instructions to every compaction of the main conversation, auto-compact included.
- **Off by default, remembered once on.** It changes the engine's behaviour, so the person opts in.
- **Never twice.** The instructions start with `[ctx keep]`, and a compaction already carrying the mark is passed on unchanged.
- **Only real compactions.** Subagent compactions and `precompute` are left alone, and a compaction is only rewritten when it carries its messages, as the engine's do.

**After any compaction:** a toast (`Compacted 412k → ~38k (−374k)`), the next reading lit in blue on the sparkline, and the heaviest results and warnings start over.

**Running the follow-up exactly once.** In the test kit, the mod's own `session.compact` hook did not hear the compaction the mod itself started, so `compactNow` runs the follow-up itself. In case a live session does raise the hook, a `selfCompact` flag stops the hook from running it a second time.

## Testing

- **Unit tests** (`fmt.test.ts`, `usage.test.ts`, `compact.test.ts`) cover every rule with a number in it. When a behaviour was found wrong, a test pinning the right behaviour came first (the pace floor's `warnLevel(120_000, 967_000, 9)` → `none`).
- **Render tests** (`render.test.ts`) run the real hooks in the engine's test kit, with the world beneath them mocked: the clock, the store, `session.usage`, `tool.call`, `session.compact`. They draw the pane, band and footer on both terminal and Desktop and check what is drawn, what is toasted and what is written to the store.
- **What the kit cannot check:** paint (exact colors on screen, line wrapping) and live engine behaviour (whether `/ctx compact` mid-turn is accepted, whether the hook hears the mod's own compaction). These are listed below.

Before every release: `claude plugin test ctx`, `claude plugin validate .`, and `tsc` with the tsconfig the types file describes.

## Known limits and open questions

- **Not yet seen live:** `/ctx compact` compacting in a real session, and autokeep's instructions reaching a real auto-compaction. Running `/ctx compact` between turns should show exactly one "Compacted" toast.
- **Mid-turn compaction:** `/ctx` runs immediately, so a compact during a turn may be skipped by the engine. The toast says so.
- **Desktop:** the call that launches programs is CLI-only, so opening a memory file there shows "Couldn't open".
- **Token estimates** for single results are characters divided by a learned ratio. They improve as the session goes on but stay approximate, hence the `~`.
- **Idle streaks are tracked for MCP servers only.** Skills and agents are counted per session, not across sessions.
- **History is per session.** A new session's trend starts empty and shows from the second turn.

## Release history

| Version | Theme |
| --- | --- |
| 0.1.0 | Pane and band, like the Desktop panel |
| 0.2.0 | Honest numbers (exact mode, deferred MCP, width), eighth-block bar, hover linking, push refresh |
| 0.3.0 | Per-turn trend and turns to auto-compact; memory files open from the pane |
| 0.4.0 | Heaviest results; unused overhead with per-project idle streaks |
| 0.5.0 | Auto-compact warning; guided compact; autokeep |
