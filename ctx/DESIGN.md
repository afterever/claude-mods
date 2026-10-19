# ctx: design notes

This document explains why `ctx` is built the way it is. [README.md](./README.md) covers installing and using it; this covers the reasoning behind each feature, the alternatives that were turned down, and the numbers chosen. It is written for whoever changes the mod next, including a future Claude session.

## The problem

Claude Code's context window is the budget every session spends. When it fills, the engine compacts the conversation: it replaces the history with a summary, and whatever the summary leaves out is gone. `/context` shows a breakdown, but only when you ask, only as a snapshot, and with no sense of how fast the window is filling or what filled it.

`ctx` answers four questions, in order of how often they come up:

1. **How full is it?** At a glance, without typing anything (the band, the bar).
2. **How fast is it filling, and when will it compact?** (The trend, the warning.)
3. **What filled it?** Both the per-turn cost (heaviest results) and the fixed cost paid every turn (unused overhead).
4. **When it compacts, what survives?** (Guided compact, autokeep.)

Each feature below maps to one of these questions. A feature that answered none of them was not added.

From 0.6.0 the same questions are also answered in dollars. Cost is not a fifth question: every request sends the whole window again, so cost is the price of the window itself. The rule that keeps this in scope is **ctx prices context decisions, not the session**. A dollar figure belongs here only if it changes a decision about the window (compact now, turn a server off, compact before resuming). Daily and weekly totals are billing history, and `/cost` and status lines show them, so ctx has none. The session figures it draws are readings of a budget being spent: the session total (0.6.1, in the pane as the denominator for the last turn's dollars; since 0.7.0 also in the band on an account with no rate-limit windows) and the plan's pace (0.7.0). The rule is not allowed to lean on what else the person has installed: it once did ("the status line already shows them"), which was true only where a status line like claude-hud was set up.

From 0.7.0 the rule widens by one budget. A session spends from two accounts, the context window and the plan's rate limits (the five-hour and seven-day windows on a subscription), and the same decisions run both down: a bloated window makes every request dearer, so it eats the limit faster, and compacting, switching an idle server off or finishing a long task before resuming slow both. ctx now draws a **live gauge of each budget** and still has **no billing history**: no daily or weekly totals, no per-model breakdown, no report. A figure belongs here if it is a live reading of a budget the session is spending from. The reason the old rule leaned on, that a status line already shows these figures, never held where claude-hud is not set up, and that includes Claude Desktop.

## Principles

These came out of the review of 0.1.0 and held for every later release.

- **Honest numbers over pretty ones.** A figure the pane shows must mean what it says. Deferred MCP schemas are not counted as "in context" (0.2.0). An exact count is not overwritten by an estimate a second later (0.2.0). Token figures that are estimates carry a `~`.
- **Never act unasked.** The mod observes everything and changes nothing on its own. Compacting only happens when the person presses `c` or types `/ctx compact`. Rewriting every compaction's instructions (autokeep) is off until turned on. Idle MCP servers get a suggestion, never an automatic disable.
- **Pushed, not polled.** Refresh on the engine's own events (`session.measure`, `tool.call`, `session.compact`), never on a timer that counts. The only timer redraws "updated 12s ago" and does no work.
- **Survive a hot reload.** Anything a drawing reads lives in `$.state` atoms, which the host keeps across reloads. Module variables hold only what is safe to lose (an in-flight counter, a pending flag).
- **One glance, then detail on demand.** The band is one line. The pane opens sections only when asked (`m`, `f`, `s`, `a`, `h`, `d`).
- **Same mod on every surface.** The render tests draw the pane and band on both the terminal and Desktop. Desktop draws the band too (seen live, 2026-10-18), so a feature is designed as a band feature first. The notes up to 0.6.2 say Desktop has no band; that was wrong.

## Architecture

### Files

| File | What it holds | Why separate |
| --- | --- | --- |
| `hooks/register.tsx` | Hooks, atoms, drawing | The only file that touches `$` |
| `hooks/fmt.ts` | Number formats, the bar, sparkline, trend, the file opener's command | Pure functions, unit-tested without an engine |
| `hooks/usage.ts` | Tool labels, token estimates, usage counts, the project log | Pure; the logic behind 0.4.0 |
| `hooks/compact.ts` | Keep instructions, warning levels and text | Pure; the logic behind 0.5.0 |
| `hooks/cost.ts` | Per-turn spend, the price fit, carrying and compaction costs, the band suffix | Pure; the logic behind 0.6.0 |
| `types/index.d.ts` | The `$.state` contract | `claude plugin validate` checks every state key against it |

Keeping the logic pure is what made four releases in one day safe: every rule with a number in it (the pace floor, the drop ratio, calibration) has a unit test that runs in milliseconds.

### Where state lives

| Kind | Survives | Used for |
| --- | --- | --- |
| `$.state` atoms | Hot reloads, not new sessions | Everything a drawing reads: `snap`, `history`, `eaters`, `usage`, `mode`, `warned`, `spend`, `costOn`… |
| `$.store` | New sessions | Whether the pane was open, autokeep, cost and footer on/off, each project's MCP usage log, the price samples (`costSamples`) |
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
| `session.measure` | Records the API's figure, the cost ledger and (0.7.0) the plan's rate-limit windows, learns characters per token, warns, recounts, writes the project log |
| `turn.start` | Freezes the last turn's spend; a clean one becomes a price sample |
| `turn.step` | Observes each model request's token counts (main loop and subagents); never touches the stream |
| `turn.complete` | Closes the main-loop turn; counts a subagent's run |
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

### 0.6.0: what the context costs

The trend says the window grows 8k a turn. 0.6.0 says what that costs, and what compacting would save. Everything is split into two kinds of figure, and the pane never mixes them up:

- **Measured** (shown plainly): what the last turn cost, its requests, its cache hit rate, a cache miss, what a compaction cost. These come straight from the engine.
- **Estimated** (shown with `~`): what keeping, rewriting or compacting the window will cost, and a subagent's share of a turn. These need prices, which ctx learns.

**Where the numbers come from.** Checked against the engine's types (build 2.1.288):
- `turn.step`'s result carries each request's four token counts as the API reported them (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) and the model's API id. It fires for the main loop and for subagents, which carry `agentId`.
- `session.measure` carries `cost.usd`, the session's ledger, the same total `/cost` and the status line show. It includes subagents and compactions.
- `session.compact`'s result carries `tokensAfter` and the summarizer's counts.
- What the engine does not give a mod: a price per token, or whether the cache is still warm. Only the built-in model-switch hooks get those.

**The last turn's cost is the ledger's growth.** The ledger as it stood at `turn.start` is the turn's base. Every `session.measure` that moves the ledger updates the running turn to `ledger − base`, and the next `turn.start` freezes it. Nothing depends on whether the ledger settles before or after `turn.complete`: the turn stays open to new measurements until the next one begins. The figure includes subagents and any tool's own model call, because the ledger does.

**Prices are learned, not looked up.** Hardcoding a price table was turned down because prices change, and the obvious shortcut is wrong. Cache reads are 0.1× input on most models, but 0.05× on Opus 5.5 and 0.025× on Fable 5.1, so a fixed ratio would have doubled every carrying cost on this user's own model. Instead:
- The ledger is computed from the same token counts at fixed prices, so a clean turn satisfies `usd = a·(input + 5·output) + b·read + c·write` exactly. Output is 5× input on every current model, which is the one ratio assumed.
- `fitRates` solves for `a`, `b` and `c` by least squares over the last 12 clean turns of that model. Three independent turns give the exact prices.
- A **clean turn** is main loop only, one model, no subagent, no compaction. That is the same selectivity `calibrate` uses for characters per token.
- A turn the fit misses by more than 5% (a WebFetch's own small-model call billed inside it, say) is dropped, worst first, as long as at least half the turns are kept.
- The result must also make sense: a read cheaper than input, a write at least input's price. Otherwise there are no rates and no estimates.
- Samples go to `$.store`, so the next session starts with its prices known.

**The band suffix** follows the last turn's token change: `+$1.84·6r·⑂~$0.31·●12% hit`. Each piece shows only when it says something:
- The dollars always, in red past 3× the session's median turn.
- `·6r` (requests in the turn), dimmed, at 120 columns and wider.
- `⑂~$0.31`, the subagent share, only when a subagent ran. It is the turn's dollars less what the main loop's counts explain at the learned prices, so it carries `~`.
- `●12% hit` only below 90% (amber, red below 50%). A high hit rate is the normal case and would be noise.

As the band narrows, pieces drop from the right: requests and the subagent share go first (below 120 columns), then the cache marker (below 100). The dollars go last.

**The pane** adds, under the trend:
- `carrying ~$0.08/request · ~$0.49/turn · ~$58.5 until auto-compact`. Carrying cost is the window re-read from the cache once. Per turn multiplies by the session's average requests per turn. Until auto-compact adds up the remaining turns while the window keeps growing at its pace.
- `last turn +$1.84 (6 requests · 1 subagent ~$0.31 · cache 98% hit)`.
- `● cache miss: a request wrote 231k fresh · ~$1.85`, when a main-loop request wrote at least 20k tokens and more than half its prompt afresh.
- **Cold starts are not misses.** The session's first request, and the first after a compaction, write the prompt afresh by nature. They are counted in the session's misses (the rewrite costs, and idle overhead prices it), but no miss line and no band `●` is shown for them. A cache that is warm except at the start is the normal case.
- `compact now saves ~$0.12/request · ~$0.37 once · pays back in ~4 requests`, and `at auto in ~68 turns · waiting costs ~$76 more`. The one-off cost is the summarizer reading the window, writing the summary, and the smaller window cached afresh. The window afterwards is what the last compaction left, or else everything but the messages plus an 8k summary. Auto-compact will run anyway, so the real choice is *now or later*, and the second line prices *later*. The lines appear only once the window is more than twice its compacted size.

**Cache expiry is inferred from what the session saw, not guessed.** The engine doesn't tell a mod the cache's lifetime. Each main-loop request records the idle gap before it:
- A hit after more than five idle minutes means the hour-long cache.
- A miss after four or more idle minutes (with no such hit) means the five-minute cache.

With that evidence, and idle time past the lifetime, the pane shows `⚠ cache likely expired · idle 1h 5m`, what the next request will cost to re-write the window, and what it would cost after compacting. That's the one moment a dollar figure argues for compacting right away. With no evidence, only the after-the-fact miss line shows. Deriving the lifetime from the price fit was turned down: it would stack two estimates, and a mix of cache lifetimes would quietly break it. A compaction starts the idle record over: the prefix changed, so the write after it says nothing about the cache's lifetime. That matters because the pane's own advice is to compact after an idle break, and the write that follows would otherwise teach the five-minute lifetime wrongly.

**Idle overhead in dollars.** Each project-log line now records its session's main-loop requests and cache misses. An idle server's cost is its tokens × (requests × read price + misses × write price), over the sessions in its idle streak that logged both, this session included. Lines from before 0.6.0 have neither, and are left out rather than guessed. The figure sits dimmed under the token row: an idle server's main cost is room in the window, and a warm cache makes carrying it cheap.

**After a compaction** the toast adds what it cost (the ledger's growth across it) and the carrying cost before and after: `Compacted 602k → ~36.5k (−565.5k) · summary $0.69 · now ~$0.007/request (was ~$0.12)`. A compaction during a turn marks that turn unclean.

**`/ctx cost on|off`** (`p`) hides every dollar figure. It is on by default and remembered, like autokeep. The counting goes on regardless, so turning it back on shows figures straight away.

**The `turn.step` hook is observe-only.** It sits in the stream of every model response, so it does `yield* next(e)` and reads the result afterwards, inside a try/catch. It never touches a chunk, and nothing in it can throw into the response.

### 0.6.1: a denominator and a count

Two figures the pane showed without a reference point, and one cosmetic tightening. No new state, no new events.

- **Session total, in the pane only.** `session $14.20 · last turn was 13% of it` is the first line of the cost block. 0.6.0 left the session total out because claude-hud already showed it, but that assumed a setup: Claude Code's default terminal footer shows no cost, and `/cost` only answers when asked. The total earns its place as the denominator for figures the pane already prints (`last turn +$1.84`, `~$58.5 until auto-compact`, `waiting costs ~$76 more`), which mean little without knowing what the session has spent. It stays out of the band on a subscription, whose band shows the plan's pace instead, and out of the Desktop footer, which keeps to one number; since 0.7.0 an account with no rate-limit windows gets it in the band. It is the ledger ctx already records (`spend.ledger`), the same figure as `/cost`, subagents and compactions included. `/ctx cost off` hides it with every other dollar figure. A share under 1% reads `<1%`, and the share never passes 100%.
- **Turn count, on the trend line.** `trend ▁▁▇█ · 23 turns`. The sparkline can't be counted by eye: the band draws at most 10 glyphs, 48 readings are kept, and a repeated reading adds nothing. The number is the engine's own `$.session.turns()`, read when the pane draws. The 15-second tick redraws the pane, so a count that trails by a turn corrects itself. The total only: a "since compaction" count was considered and left out. The sparkline gives up the label's columns, so the line doesn't wrap in a narrow dock. A failed call hides the count and nothing else.
- **The fill text is tighter.** `65.1k / 1M 7%` became `65.1k/1M·7%`, two columns saved. The `·` is the cost suffix's separator, and also the bar's free-space glyph. It is told apart by being dim, sitting after the label, and the percent beside it being bold and colored. The pane's header draws the same component, so it matches.

### 0.6.2: two cosmetic touches

- **The session total is green.** In `session $0.84 · last turn was 35% of it` only the amount is drawn in the theme's `success` color; the label and the share stay dim. It is the figure the line is about, and the rest of the cost block is dim. The line is three sibling `Text`s and not a nested one, since a child can't undo its parent's dim.
- **The pane ends with `ctx v0.6.2`.** The host gives a hooks module no way to read its own manifest: `node:fs` is refused, and so is a JSON import (only code files load). So `hooks/version.ts` holds a copy, and no test can compare it with `plugin.json`. Bump both on every release; the pre-release checklist below compares them.

### 0.7.0: the plan's pace

**The problem.** claude-hud shows how fast the plan's limits are being spent: `⏳ 25% (3h 40m/+3%) 🐾 22% (4d 16h/-11%)`, the percent used, the time left in the window, and how far ahead of or behind an even spend that is. Claude Desktop has no claude-hud, and it is where the work moved. The data is not the engine's secret: `$.session.usage().rateLimits` (and `session.measure`'s `rateLimits`, raised when a window moves a whole point) hold each window as `{ kind: 'five_hour' | 'seven_day' | 'spend_limit', percentUsed, resetsAt }`. A probe mod (`pace-probe`, throwaway) read it on the terminal and drew the HUD's numbers.

**Where it lives: the band, right-aligned, in ctx.** The band is a `space-between` row, the fill group on the left and the 📊 toggle on the right, and on a wide screen the middle is empty. The pace is a third child between them, so it costs no row. The alternatives, and why not:

- **The footer** (`SessionMode`), where the probe drew it. It shares the first footer row with claude-hud, Arsenal's launcher and Waypoints' plan label, and was judged too small for all of them.
- **A separate `pace` mod.** A mod cannot draw into another mod's row, so it would be a third band row under ctx and agent-pulse, or the crowded footer.
- **Arsenal's pane.** It is a remote control, and its pane is not always open; a gauge that has to be opened is not a gauge.
- **A Desktop footer for the pace.** Not needed: Desktop draws the band (see Principles). The footer keeps its one number, the fill.

**What it shows, by the kind of account.**

| Account | The band's pace section |
| --- | --- |
| Subscription: `rateLimits` has `five_hour` and/or `seven_day` | the pace, below |
| No such windows, and the ledger exists (an API or enterprise account billed by use) | `session $14.2` (the label drops below the full step), the amount in `success` like the pane's |
| A gateway `spend_limit` window and no other | `spend 34%` (the percent only; the label drops below the full step): the window's length is not given, so there is no pace to compute. **Untested**, no such account here |
| Neither (before the first reply, or no ledger) | nothing, and no placeholder |

Both windows always show when both exist; the HUD's `sevenDayThreshold` that hides the weekly window while it is comfortable is not copied. `/ctx cost off` hides the session total with every other dollar figure and leaves the pace, which is a percent and not a dollar. The session total is in the band only for an account that has no windows to show. 0.6.1 had kept it out, because the band is one line where the turn's dollars already compete for width and a status line would repeat it; on an API account it is the one reading of the budget being spent, and it takes the room the pace would have had.

**The format is the HUD's**, with the 🐾 opening the section once and a dim `·` between the windows:

```
🐾 25% (3h 40m/-2%) · 22% (4d 16h/-11%)
```

- **Time left** is the HUD's `formatDuration`: minutes rounded up, `45m` under an hour, `3h 40m` under a day (`3h` on the hour), `4d 16h` from a day up (`4d` on the day).
- **The delta** is the user's HUD Patch 3, read from its code (`claude-hud-modifications.md`). The share of the window gone is `(now − (resetsAt − window)) / window × 100`, **rounded to a whole percent and clamped to 0–100**, and the delta is `round(used − gone)`, `+` at 0 or more and `-` below. It is rounded twice, the share first and then the difference. The HUD's own sample, 82% used with 100 of 168 hours left, prints `+42%` where truncating the exact difference (41.5) would print `+41`. The windows are 5 hours and 7 days.
- **The colors are the HUD's, as the user's HUD draws them.** The *delta* is colored by its value: below 0 (under an even spend) `success`, 0 to 15 `warning`, above 15 `error`. The *percent* is colored by how much of the window is used: 90% or more `error`, 75% or more `warning`, else `success`. `success` stands in for the HUD's blue, which the theme does not have, and it reads like the green fill percent beside it; if it does not look right it is a one-line change in a later release. The HUD's own projection grade (`usagePace`) is switched off in that setup, so there is no `▲` marker and ctx does not copy it. The 🐾, the countdown and the `·` stay dim.
- **A window past its reset, or with no `resetsAt`, shows the percent alone,** as the HUD does: with no time to print it has no pace to print either.

**It shrinks in three steps**, by the band's width, and then gives way to the fill group, which has the priority:

| Step | Shows | From (columns) |
| --- | --- | --- |
| Full | `🐾 25% (3h 40m/-2%) · 22% (4d 16h/-11%)` | 130 |
| No countdown | `🐾 25% (-2%) · 22% (-11%)` | 100 |
| Deltas only | `🐾 -2% · -11%` | 80 |
| Hidden | nothing | below 80 |

The columns are a starting point and are to be tuned by looking at a real terminal at each width. **Desktop passes the band no `bodyColumns`** (the band falls back to 80), and Desktop has room, so on `desktop` the pace is always the full step. The decision reads `e.surface`, and does not trust the 80.

**It needs a clock.** The data only moves when a response lands, but `3h 40m` and the delta move every minute. ctx's one ticker runs only while the pane is open, redrawing "updated 12s ago". The pace gets its own 60-second tick, started at `session.start` and cancelled on unload, that only bumps an atom the band reads. It does no work, which keeps "pushed, not polled" intact: the numbers come from the engine's push, and the tick only redraws what the clock changes.

**The arithmetic is a pure module**, `hooks/pace.ts` (windows, time left, delta, the grade, the steps), tested without an engine like `fmt.ts` and `cost.ts`. `register.tsx` reads `rateLimits`, keeps them in a `$.state` atom so a hot reload keeps them, and draws.

**Out of scope on purpose:** a pane section for the windows (the band is the whole feature), history of past windows, a forecast of when a limit runs out, and the HUD's other usage options (bars, remaining-percent mode, reset as wall-clock time).

### 0.8.0: the look

**The problem.** In two days `agent-pulse`, `waypoints` 2.0 and `subagent-progress` 2.1 got a shared look: a palette whose colours shade from a core to a glow, motion in steps (`off` / `subtle` / `full`), one-shot sparkles and sweeps, and SVG on Desktop. ctx, in the same band, still draws flat theme keys, and the person finds it plain next to them. Its bar is the worst of it. On a 1M window at 8% everything used fits in about 1.3 of the band's 16 cells, so the eighth-block bar draws `▎▎▍` slivers in four colours, each over the next one's background, followed by 13 dots. It reads as scraps, not as a gauge.

**What the person decided**

- The category split in the band's bar stays: it is useful.
- **Each category in use gets at least one whole cell** in the band's bar, which stays an honest 0→max gauge otherwise (chosen over zooming the split to fill the bar, and over a split chip next to a separate gauge).
- **The colours come from the palette, following agent-pulse**, as waypoints and subagent-progress do. The engine's category colours are theme keys (`promptBorder`, `permission`, `inactive`…), which cannot be mixed, so they cannot shade or shimmer.
- **Four effects, each meaning something:** a turn's growth glows, the bar breathes as auto-compact nears, a compaction sweeps, and Desktop gets an SVG bar.
- **The pane gets the same treatment**, not just the band.
- **No character.** A mascot felt like too much. The bar becomes a small seascape instead, **Tide**: free space is open water, the used categories are the shore building out into it, and a compaction is the water rushing back in over what was shore. The jellyfish (Claude) and the crabs (subagents) get a sea to live in, with no third character beside them.

**Principles**, borrowed from `agent-pulse/DESIGN.md` and held here too:

- **Every effect carries meaning.** The water is the room left. The glow is what the last turn ate. The breathing is "auto-compact is near". The wave is "room came back". Nothing moves just to be busy.
- **The text stays text.** The fill (`81.9k/1M·8%`), the badge, the pace and every pane row stay hook-drawn `Text`, so they truncate and the tests can read them.
- **No layout shifts.** The band's bar is a fixed width for its band (16 cells, 8 under 70 columns; 0.8.1 grows it on a wide band, see below), whatever it draws.
- **Honest numbers first.** The look changes no figure. The one distortion, the minimum cell, is in the band only, and the pane's bar stays exact.

#### Settings and `follow`

`userConfig` gains `palette` (`follow`, `ember`, `claude`, `neon`, `mono`) and `animation` (`follow`, `off`, `subtle`, `full`), both defaulting to `follow`, worded like waypoints' two. `follow` takes agent-pulse's value from the `$.config.list()` rows `agent-pulse.palette` and `agent-pulse.animation` (confirmed live for waypoints), with `ember` and `subtle` when agent-pulse is not installed. Resolve at `session.start` and in a `config.set` hook for those keys, then `$.ui.invalidate('ui.render')`. The fallback is ctx's existing ticks (the pane's 15 s, the pace's 60 s); ctx adds no timer for this.

`hooks/palette.ts` is a **copy** of agent-pulse's `palette.ts` (palettes, `paletteOf`, `levelOf`, `mix`, `shadeOf`, `shimmerOf`, `agentColorOf`) plus `resolveLook`, with a comment at the top that it must be kept in step. A test pins a few values, as waypoints' does.

#### Colours

Each category takes a phase colour, so a palette means the same thing across the four bands. **(builder's call: the mapping)**

| Category | Phase |
| --- | --- |
| Messages | `tool` (Claude's coral in ember: the category that grows) |
| System prompt | `requesting` |
| System tools | `composing` |
| MCP tools | `agent` |
| Memory files | `writing` |
| Skills | `thinking` |
| Custom agents, and any category name not listed | the palette's `agents` list by name, skipping a colour already taken |
| Free space (the water) | `compacting` core, dimmed; the foam is its glow |
| Autocompact buffer | stays `░`, dim, in the water's colour |

In `ember` and `neon` the listed categories must get distinct hex colours, and a test checks it. Each category's own cells shade core→glow from left to right. A one-cell category is its core.

**`claude` and `mono` draw today's colours:** the engine's theme keys and `·` for free space, with no shading and no water, so choosing `claude` gets 0.7's colours back. The band's bar still uses the whole cells, at least one each, on every palette: the slivers are not coming back. **(builder's call: the person did not choose this, so say it in the README.)** The effects still play there, in the palette's `sparkle` and `heat` colours.

The fill text's green/amber/red (`fillColor`) and the pace's colours (claude-hud's rule, 0.7.0) stay as they are. They are readings with a colour code of their own.

#### The band's bar (terminal)

- **Whole cells, at least one each.** The band no longer uses eighth blocks. Every used category with tokens > 0 gets at least one `█`, and so does the buffer when present. The rest is shared out by largest remainder, and **the extra cells come off the largest used category while it keeps one, and only then off the free space**, so the bar never grows past its width and the fill keeps its true length wherever it can: at 45% the bar is 7 used cells, as the person's chosen preview showed, not 10. Only when the window holds fewer cells than it has categories (a nearly empty 1M window) does the fill overstate. If the minimums don't fit (a narrow 8-cell bar with many categories), the smallest categories lose their minimum first and fold into the cell of their neighbour on the left. The pure function goes in `fmt.ts` beside `barRuns` (for example `bandCells(snap, width)`).
- **Tide.** Free cells are `~` in the water colour, and the first free cell (the water's edge) is foam, `≈`. ASCII `~` and `≈` (U+2248) only: `∼` (U+223C) is ambiguous-width and some terminals and locales draw it two cells wide, which would push the 📊 out of place.

| Level | Water |
| --- | --- |
| `off` | still: `████≈~~~~~~~~~~░` |
| `subtle` | the foam laps: the edge cell steps between `≈` and `~`, and between core and glow, about once a second |
| `full` | the foam laps, and the water drifts: a brighter `~` moves along the free cells, a step every ~600 ms **(builder's call: the timings, tuned by eye)** |

- **The whole bar is one `Client`** (`hooks/tide.tsx`) with a fixed width. It takes the cells (glyph, colour, background) and the effect props below, and runs its motion on the surface's frame clock, so the hooks never run per frame. The `ctx` word at the band's left is a second, 3-cell `Client`, so it can breathe.

#### The effects

| Effect | Trigger | What it draws | Levels |
| --- | --- | --- | --- |
| **Growth glow** | `session.measure` with the API's figure up from the last one (no drop) | for about 1.5 s the cells between the last used cell before and after shimmer through the palette's `sparkle`; if the growth moved no cell, the last used cell glows | `subtle`, `full` |
| **Breathing** | `warnLevel` is `near` (amber, `heat[0]`) or `imminent` (red, `heat[2]`) | the `ctx` word and the foam (the last used cell in `claude` / `mono`) breathe from the dimmed colour up to the full one, about a 2 s cycle, for as long as the warning stands | `subtle`, `full`; `off` draws them still in the hot colour, as today |
| **Compaction sweep** | a compaction lands (`afterCompaction`, or a drop past `DROP_RATIO` on `session.measure`) | a wave runs from the old edge back to the new one over about 1.2 s; the cells it passes turn from shore to water, foam at its crest | `full` |

- A sweep wins over a growth glow, and breathing continues underneath both.
- One-shot effects carry the id of their event (for example the history length at that reading), so a redraw (the 15 s and 60 s ticks) never replays them. The `Client` plays an id once and then rests.
- The hooks pass what each effect needs as props. The `Client` holds only its frame.

#### The pane

- **The big bar stays exact**, eighth blocks included. With hex colours the partial cell on a boundary blends the two categories cleanly at 48 columns. It gets the Tide water and the same three effects, through the same `Client`. Its width follows `bodyColumns`, so its props change when the dock is dragged narrower; that's fine for a `Client`, which is fixed within one render.
- **Swatches** (`■`) take their category's palette colour, so the swatch, the bar run and the row still match.
- **The trend sparkline** shades along its length from Messages' dimmed core to its glow. Compaction marks take the water colour (today `permission`, blue). The newest point keeps the fill colour (green/amber/red). At `subtle` and `full` it pulses gently while a main-loop turn is running (`turn.start` to `turn.complete`) through a 1-cell `Client`.
- **Section gauges** shade in their own category's colours: MCP tools in MCP's, Memory in memory's, Skills, Agents, Slash commands in theirs. Heaviest results and Unused so far use `tool` and `idle`. Today they are all flat `claude`.
- **Heat** takes the palette's `heat` scale where fixed theme keys are used today: a heaviest result over 15k (`heat[2]`) or over 5k (`heat[0]`), `idle 5+ sessions` (`heat[0]`), `~N turns to auto-compact` at 10 or fewer (`heat[0]`) and 3 or fewer (`heat[2]`), and the auto-compact warning line.
- **Unchanged:** the buttons and the footer row, the compact marker `▲` line (dim), the cost block and its colours, and the hover link between a bar run and its row (see "To confirm live" below).

#### Desktop

`e.surface !== 'terminal'` (`Svg` draws empty on the terminal; see `agent-pulse/DESIGN.md`).

- **The band's bar is an `Svg` pill** about the width of 16 terminal cells (~130 px, 10–12 px high) **(builder's call)**, following the band's own rule of at least one cell each (a minimum segment width of ~8 px). Used segments are rects with a `linearGradient` core→glow. Free space is water: a soft gradient in the water colour with a wave line along its top that drifts by a CSS `@keyframes` translate (`subtle`, `full`), plus a few faint glints (`full`). The buffer is a hatched `pattern`. A thin glowing tick marks the auto-compact point.
- **Effects in CSS:** the growth glow is a one-shot animation on the added span, the breathing animates the tick's and the edge's glow amber or red, and the compaction is a wave sweeping over the freed span (`full`). Every SVG has `@media (prefers-reduced-motion: reduce)`.
- **The SVG source must not change between redraws** unless the data did (agent-pulse's rule: a new source restarts its animations). No time and nothing per-second goes in it; one-shots carry their event's id in a class or element id, so they play once.
- **The pane's bar on Desktop stays hook-drawn `Text`**, not an SVG: the person chose the hover link to the category rows over the SVG look, and `SvgProps` has no hover scope. *(Reversed in 0.8.1: it overran the pane, see below.)* It is the terminal pane's exact bar in palette hex with Tide's `~` water and `≈` foam, drawn still (Desktop has no `Client`). The growth glow and the compaction sweep play there by hook redraws at ~12 fps for their 1.5 s only, and the breathing goes on the warning line's `⚠` through a CSS-animated 1-glyph `Svg` (or still, in the hot colour, if that proves awkward). Only the band's bar is an SVG on Desktop.
- The Desktop footer's `ctx N%` is unchanged.

#### Code layout (builder's call)

| File | Holds |
| --- | --- |
| `hooks/palette.ts` | The copy of agent-pulse's palettes and helpers, `resolveLook`, the category → colour map, the water colours |
| `hooks/fmt.ts` | `bandCells` (whole cells, at least one each); the exact `barRuns` gains hex colours from the map |
| `hooks/tide.ts` | Pure: the water glyphs per level and frame, the growth and sweep spans, which effect wins |
| `hooks/tide.tsx` | The `Client`s: the bar, the breathing word, the 1-cell pulse |
| `hooks/svg.ts` | Pure: the Desktop bar's SVG source from the cells, palette and level |
| `hooks/register.tsx` | Resolves the look, records the effect ids (atoms, so a hot reload keeps them), draws |
| `.claude-plugin/plugin.json` | `userConfig.palette`, `userConfig.animation`; version 0.8.0 |

Unit tests: `bandCells` (the width never changes, everything in use gets a cell, order kept, the narrow fallback), the water glyphs at each level, the growth and sweep spans, palette distinctness, `resolveLook`. Render tests: the band draws the bar `Client` on the terminal and an `Svg` on Desktop, `claude` draws whole cells in the engine's theme keys with `·` free space, `off` passes no motion, a one-shot's id doesn't change on a tick redraw.

#### To confirm live, before building on it

- **Does a `Client`'s `Text` keep a `hover` scope?** If not, the band loses its bar's hover (acceptable: in the band it only inverts the run) but the pane must keep the link to its rows. Then the pane's bar stays hook-drawn `Text`, its one-shots play by hook redraws at ~12 fps for their 1.5 s only, and the pane's breathing moves to a 1-cell `Client` on the warning line's `⚠`.
- **Does a `Client` keep its state when its props change**, or does it remount and restart its effect on every band redraw? subagent-progress had the same question for its crabs.
- `~` and `≈` are one cell wide in Windows Terminal and in Desktop's band font.

#### Out of scope, and what would make it a failure

- No character, sprite or mascot.
- No new figures, and no change to a number, a threshold or the pace's colours.
- Nothing that moves without a reason: water that churns at `subtle`, or a glow on every redraw, would fail this even if it works.
- No change in the band's width or height, and no `Client` around text that has to truncate.

### 0.8.1: the bar's scale

Seen live on 0.8.0, on the person's laptop, in both apps. Three things came out of it, none of them a new figure.

**The terminal's bar overstated a near-empty window.** `ctx ██████~~~~~~~~~░ 50.4k/1M·5%` drew 37% of the bar for 5%. This is the minimum cell the person chose in 0.8.0 (each category in use gets one whole cell): six categories on a 1M window are six cells whatever they hold, and 16 cells make that 37%. The design noted the overstatement for "fewer cells than categories" and accepted it; seen on a real window it read as a wrong number. Three fixes were weighed. A true fill, folding the smallest categories into a neighbour until there is room, is the most honest and loses the split on a near-empty window. One colour below a threshold is simple and jumps at the threshold. **A longer bar on a wide band was chosen**: `bandBarWidth(columns, warning)` in `fmt.ts` gives 8 under 70 columns, 16 to 129, 24 from 130, 32 from 160, so the same six cells are 19% of 32. It still overstates a near-empty window, only less (the person chose this over the honest-fill option, knowing it). The steps come from the band's worst case, not a measurement: the fill, the 10-glyph trend, the delta, the cost suffix and the pace take about 107 columns beside the bar at 130, so a 32-cell bar only fits from 160. **A standing auto-compact warning keeps the bar at 16**, because the badge and the carrying cost then need the room. Desktop passes the band no `bodyColumns`, so its pill stays at the 80-column step, 16 cells.

**Desktop's pane bar overran the pane and wrapped.** 0.8.0 drew it as `Text`, `width` cells wide, on the belief that a cell is a cell. On Desktop the block glyphs (`█`) fall back to a font of their own width, wider than `~`, so 48 cells did not fit a pane that holds 48 of the code font's, and the last `~~` wrapped under the bar. A `Text` bar cannot be sized in cells on Desktop. The pane's bar is now an `Svg` drawn by the same `bandSvg` as the band's pill, at 2 px a cell (`PANE_CELL_PX`), so it fills the pane to the pixel and carries the `▲ auto-compact` marker as a caret and words under it (the marker's spaces were font-dependent too). Its width is the narrower of `e.viewport.columns` and `bodyColumns` (either may be missing; Desktop hands the band no `bodyColumns`) at 8 px a column, less 16, between 120 and 560 px. **This gives up the hover link between the bar and its category rows on Desktop**, which 0.8.0 had chosen over the SVG look; the terminal keeps it. At 2 px a cell the minimum cell is 2 px, so the overstatement is gone there.

**The band's trend takes the pane's colours.** `Spark` is given `shade` and `mark` in the band too: Messages' core to glow along the glyphs, compactions in the water's colour, the newest point in the fill's colour. `claude` and `mono` keep theme keys, as in the pane.

**The pane is titled `Context`**, not `Context window` (the tab, the band's placeholder before the first reading, and the pane header's fallback when the model is unknown).

*Not seen live yet:* the Desktop pane's Svg fit (8 px a column and the 16 px margin are first guesses read off one screenshot; the viewport's column count on Desktop is the engine's, unchecked), and the 24 and 32-cell bars at their band widths.

### 0.8.2: a longer bar on a very wide band

Seen live on 0.8.1: the Desktop pane was right, and the terminal's 32-cell bar looked short on a very wide screen, with a gap of a hundred columns between the cost suffix and the pace at the right edge. `bandBarWidth` gains two steps, **48 cells from 200 columns and 64 from 240**, on the same arithmetic as 0.8.1: the fill, the 10-glyph trend, the delta, the cost suffix and the pace take about 107 columns beside the bar, and a standing warning's badge and carrying cost about 33 more, so 48 cells need 155 columns (188 with a warning) and 64 need 171 (204). The warning no longer caps the bar at 16 from 200 columns, where the row has room for both; below 200 it still does. A near-empty window still overstates (six cells are 9% of 64), only less. The steps are 8 / 16 / 24 / 32 / 48 / 64 at 70 / 130 / 160 / 200 / 240 columns. *Not seen live:* the 48 and 64-cell bars at their widths.

## Testing

- **Unit tests** (`fmt.test.ts`, `usage.test.ts`, `compact.test.ts`, `cost.test.ts`) cover every rule with a number in it. The price fit is tested against Opus 5.5's list prices. It has to recover them exactly from clean turns, and when a mispriced turn is mixed in. With 1% noise and a small extra charge on most turns, it has to come within 5% (it lands within about 1%). When a behaviour was found wrong, a test pinning the right behaviour came first (the pace floor's `warnLevel(120_000, 967_000, 9)` → `none`).
- **Render tests** (`render.test.ts`) run the real hooks in the engine's test kit, with the world beneath them mocked: the clock, the store, `session.usage`, `tool.call`, `session.compact`, and from 0.6.0 the turn events and a cost ledger that bills each request at list prices. They draw the pane, band and footer on both terminal and Desktop and check what is drawn, what is toasted and what is written to the store.
- **What the kit cannot check:** paint (exact colors on screen, line wrapping) and live engine behaviour (whether `/ctx compact` mid-turn is accepted, whether the hook hears the mod's own compaction). These are listed below.

Before every release: `claude plugin test ctx`, `claude plugin validate .`, and `tsc` with the tsconfig the types file describes. Also check that `version` in `.claude-plugin/plugin.json` equals `VERSION` in `hooks/version.ts`.

## Known limits and open questions

- **0.8.0's look, seen live on 2026-10-18** in a new Windows session on the installed 0.8.0: the person judged it "looking perfect", so the first-guess timings (1 s lap, 600 ms drift, 1.5 s glow, 1.2 s sweep, 2 s breath) and the `~` / `≈` glyphs stay. Not checked one by one: the pane's hover link through the `Client`, and Claude Desktop's SVG pill.
- **Not yet seen live:** `/ctx compact` compacting in a real session, and autokeep's instructions reaching a real auto-compaction. Running `/ctx compact` between turns should show exactly one "Compacted" toast.
- **Mid-turn compaction:** `/ctx` runs immediately, so a compact during a turn may be skipped by the engine. The toast says so.
- **Desktop:** the call that launches programs is CLI-only, so opening a memory file there shows "Couldn't open".
- **The Desktop footer `ctx N%` never showed, up to 0.7.0.** It appended a label to `modes`, and Desktop does not draw those: with Waypoints' plan running (step 3 of 5, its band on screen and its `◎ plan` label appended to `modes` the same way) the footer held only `Auto`, `◆ Arsenal ▾` and the model. Desktop draws what a hook puts in a tree, as Arsenal's launcher shows. 0.7.1 wraps the engine's footer in a tree and puts `ctx N%` first, the way Arsenal does. Seen live on Desktop (2026-10-18): `ctx 9%` shows next to Arsenal's launcher. Waypoints' footer label has the same gap on Desktop (its band carries the plan there).
- **The footer is off by default since 0.7.2 (`/ctx footer on`).** With the band always shown it repeated the same percent. It would earn its place only while the band is collapsed, but the engine's collapse (ctrl+x ctrl+a, `[-]`) is not in the `AbovePrompt` props or any other hook input, and ctx's 📊 only opens the pane, so ctx cannot tell when the band is gone; a switch is the honest answer. Kept in the store (`footer`) like `cost` and `autokeep`.
- **Pace, seen live on 2026-10-18 (0.7.0).** On the terminal, full width: `🐾 39% (3h 8m/+2%) · 24% (4d 15h/-10%)` at the band's right edge; very narrow, the deltas only: `🐾 +1% · -10%`. On Desktop the band shows the pace in full, with the percent green, a small delta over pace yellow and a delta under pace green. The person judged it working by eye, so the colors (`success` standing in for the HUD's blue) and the 130 / 100 / 80 width steps stay as they are. Not yet seen: a `spend_limit` window and an API account's session total in the band (untested on a real account), and the work PC.
- **`rateLimits` is what the last response reported.** Before a session's first reply it is empty, and between replies the percent can be a few minutes old while the countdown is current. The delta is computed from both, so it drifts from the HUD's by the staleness of the percent.
- **Token estimates** for single results are characters divided by a learned ratio. They improve as the session goes on but stay approximate, hence the `~`.
- **Idle streaks are tracked for MCP servers only.** Skills and agents are counted per session, not across sessions.
- **History is per session.** A new session's trend starts empty and shows from the second turn.
- **Ledger timing is assumed, not seen live.** A turn's dollars are the ledger's growth from one `turn.start` to the next. If the engine moved the ledger for a turn only after the next turn had started, that cost would land in the later turn. The kit can't show the live order, so check it in a real session: one turn's `+$` should match `/cost`'s change across it.
- **Prices need three clean turns of one model.** Until then (in a project's first session, or after a model switch) only the measured figures show. Turns that spawn subagents never teach prices.
- **Other billed calls inside a turn** (a tool's own model call, server tools with per-use fees) count toward that turn's dollars, as they should. The fit drops such turns as samples.
- **Cache lifetime needs evidence.** "Likely expired" shows only after the session has seen a long gap followed by a hit or a miss. A miss for another reason (a model switch, a changed tool list) after a long gap can teach the five-minute lifetime wrongly. A later hit after a long gap corrects it.
- **Idle overhead prices old sessions at today's rates**, the current model's. Sessions logged before 0.6.0 are left out.
- **The turn count is seen live in a fresh session only.** It matched the prompts answered (2 after two prompts), so it does not count the turn in flight. Whether `session.turns()` counts a resumed conversation's earlier turns is still unchecked. The `·` beside the percent reads cleanly on screen.
- **Fast mode bills the same model id at twice the price.** Fast-mode turns mixed with standard ones fit no single set of prices, so the fit drops them as outliers or, past half the samples, gives no rates at all. Forward-looking figures then stay hidden; the measured ones still show.

## Release history

| Version | Theme |
| --- | --- |
| 0.1.0 | Pane and band, like the Desktop panel |
| 0.2.0 | Honest numbers (exact mode, deferred MCP, width), eighth-block bar, hover linking, push refresh |
| 0.3.0 | Per-turn trend and turns to auto-compact; memory files open from the pane |
| 0.4.0 | Heaviest results; unused overhead with per-project idle streaks |
| 0.5.0 | Auto-compact warning; guided compact; autokeep |
| 0.6.0 | What the context costs: last-turn dollars from the ledger, learned prices, carrying cost, compaction payback, cache expiry, idle overhead in dollars |
| 0.6.1 | Reference points: the session total (pane) as the turn's denominator, a turn count beside the trend, a tighter fill text in the band |
| 0.6.2 | Cosmetic: the session total in green, the mod's version at the foot of the pane |
| 0.7.0 | The plan's pace in the band (the HUD's format and color rule) for subscriptions, the session total for API accounts; the scope rule widened to both budgets |
| 0.7.1 | Fix: the Desktop footer's `ctx N%` is a tree around the engine's footer, since Desktop does not draw the labels in `modes` |
| 0.7.2 | The Desktop footer is a switch, `/ctx footer on`, off by default: the band already shows the fill, and ctx cannot see the band collapsed |
| 0.8.0 | The look: palette colours that follow agent-pulse, whole cells in the band, Tide water, growth glow, breathing near auto-compact, compaction sweep, an SVG bar on Desktop |
| 0.8.1 | The bar's scale: a longer band bar on a wide band (24, 32 cells), an SVG bar in Desktop's pane at the pane's width, the band's trend in the pane's colours, the pane titled `Context` |
| 0.8.2 | A longer band bar on a very wide band: 48 cells from 200 columns, 64 from 240 |
