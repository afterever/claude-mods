# Waypoints 2.0.1: test run, 2026-10-17

The checklist this run followed, with its results filled in. Tick each box as you go. Under each step: **Do** it, then compare with **See**. If it differs, write what
you saw on the **Result** line and move on; a failure on one step rarely blocks the next.

Waypoints **2.0.1** is the version to test, so a plain `claude` in a new terminal loads it. Check with
`claude plugin list` (it should say `waypoints@afterever-mods` 2.0.1). `/config` → Waypoints should show
three rows: Palette, Animation, Pane.

**Already checked (first run, on 2.0.0)**

- [x] `claude plugin list`: waypoints 2.0.0 and agent-pulse 1.1.0, both enabled.
- [x] `/config` shows Waypoints' three rows (Palette `follow`, Animation `follow`, Pane `auto`) next to
  Agent-Pulse's.
- [x] Step 1, partly: the pane opened by itself on the right with the cursor staying in the prompt, and the
  pane showed the task trail as expected.
- **Found on 2.0.0, fixed in 2.0.1:** on the terminal the band had **no route row** and the running node and
  spinner did not animate (the band took the terminal for Desktop). Everything that depends on the route or
  the animation is therefore re-tested below: steps 1 (band rows, pulse), 5, 6, 7 and 10.

**Setup used throughout**

- **Waypoints' Animation back on `follow`** (the first run left it on `off`).
- Agent-Pulse installed and enabled (steps 5 and 6 need it).
- A prompt that gets a plan out of Claude, for example:
  *"Make a 6-task plan with the Waypoints tool for tidying this repo's README, one task per section, then
  do the tasks one at a time."*
- Window width matters: **144+ columns** for the pane to open by itself.

---

## The two facts the build could not confirm

These decide whether `follow` is instant or waits for the 15 s tick. Do them during step 5.

- [ ] **A. The row key.** In `/config`, Agent-Pulse's Palette row is the one Waypoints follows. After you
  change it (step 5), does Waypoints recolour at all?
  - See: yes, within about 15 s. If it **never** recolours, the key is not `agent-pulse.palette`.
  - Result: not tested (step 5 skipped: following Agent-Pulse is not a priority).

- [ ] **B. The instant path.** When you change Agent-Pulse's palette, does Waypoints recolour **at once**
  (the `config.set` hook reached it) or only after up to 15 s (the tick caught it)?
  - See: either works; note which.
  - Result: not tested (step 5 skipped).

---

## The ten checks

### 1. Wide window: the pane opens by itself

- [ ] **Do:** at 144+ columns, send the planning prompt and **keep typing** in the prompt while Claude plans.
- **See:**
  - [x] The pane opens on the right, and your cursor **stays in the prompt** (it does not jump to the pane).
  - [x] The band shows **four** rows: header (`◎ Goal:` or `◎ Plan:`, `n of N · pct%`, `all tasks g`), the
    route, a running row with a spinner, and a dim `next ○` row. (2.0.0 drew no route row.)
  - [x] The running task's start node (`◉`) pulses. (Seen live in step 6, `subtle` and `full`.)
  - [ ] The band keeps the same height between tasks (a finished task shows dimmed in the running row).
    (Not looked at.)
  - [x] In the pane: each task is a row with `●` / `◉` / `○`, connector lines `┃` and `┆`, a duration bar
    `▅▅▅` for finished tasks, and `running 1m` for the current one.
- Result: passes on 2.0.1. The route row is back between header and running row. The header reads
  `g: all tasks` (the button sits before its label), not `all tasks g` as written here. While a turn has
  ended mid-plan the band adds a fifth row, `⏸ paused, waiting on you` (by design).

A prompt that exercises this without editing anything:
*"Make a 6-task plan with the Waypoints tool for reviewing this repo's README, one task per section, then do
the tasks one at a time. Read-only: don't edit anything."*

A pause note: `⏸ paused, waiting on you` shows whenever Claude's turn ends mid-plan (for instance while it
waits for you). That is by design, not a freeze.

### 2. Narrow window: the pane waits, `g` still opens it

- [x] **Do:** a fresh session at about 100 columns. Send the planning prompt. Then press `g` (or type
  `/waypoints`).
- **See:** no pane appears by itself and no toast is shown; `g` opens it. Widen the window past 144 columns
  in a plan that is still running: the waiting pane may appear.
- Result: passes. At about 100 columns the pane stayed shut with no toast, the full route fit one row, and
  `g` opened the pane. The widening case was not tested.

### 3. Closing the pane sticks for that plan

- [ ] **Do:** with a plan running and the pane open, close it with **Esc** (prompt empty). Let the plan
  carry on, or add tasks. Then start a **different** plan (a new `/goal`, or after this one finishes).
- **See:** the pane **stays closed** for the rest of the first plan. The next plan opens it again.
- Result: first half passes: after closing the pane it stayed closed while a task was added and the plan
  carried on. Second half (the next plan opens it again) skipped. Note for a retest: a plan only finishes
  when the turn ends, so a second `plan` call **in the same turn** lands on the same plan (7 done + 3 new =
  10 tasks, not a different plan). For a different plan, end the turn after the first one finishes.

### 4. `Pane: off`

- [ ] **Do:** `/config` → Waypoints → Pane → `off`. Start a new plan.
- **See:** nothing opens by itself; the band still draws. `g` and `/waypoints` still open the pane.
  (Changing a setting reloads the mod; the running plan should come back from its file.)
- Result: skipped.

  Put it back to `auto` before step 5.

### 5. Follow Agent-Pulse

- [ ] **Do:** with a plan on screen: `/config` → Agent-Pulse → Palette, pick another (for example `neon`).
- **See:** the Waypoints route and header numbers recolour to match. Note how fast (facts A and B above).
- [ ] **Do:** `/config` → Waypoints → Palette → `ember` (explicit), then change Agent-Pulse's palette again.
- **See:** Waypoints **no longer** follows (stays `ember`).
- [ ] **Do:** set Waypoints' Palette back to `follow`, then disable Agent-Pulse (`/plugin`) and start a new
  session.
- **See:** with Agent-Pulse off, `follow` falls back to `ember` / `subtle`.
- Result: skipped (following Agent-Pulse is not a priority).

### 6. Animation levels

- [x] **Do:** with a running task, set Animation to each of `off`, `subtle`, `full` (Waypoints' own row, so it
  stops following). Watch the band for a few seconds each.
- **See:**
  - `off`: nothing moves (still `◉`, no spinner).
  - `subtle`: the spinner and the running node cycle colour.
  - `full`: the same, plus the node swells `◉ → ◎ → ◉`.
- Result: passes at all three levels. The band also stayed live (spinner, no `⏸` row) while a background
  subagent ran and the main turn had ended.

### 7. Finishing a plan

- [x] **Do:** with Animation `full`, let a plan finish (mark the last task done and let the turn end).
- **See, in order:**
  1. A toast `Plan done in …`.
  2. The route plays a **one-time sparkle sweep** left to right and ends on `✦`.
  3. The full band (header `done ✓ in …`, route, last-finished row) stays about **8 seconds**, then
     collapses to **one row**: `✓ Plan: … · N tasks · done in …   all tasks g`.
  4. About **3 minutes after the finish** the band disappears, and a pane that Waypoints opened by itself
     **closes**. (A pane you opened by hand stays.)
- [x] **Also:** at Animation `subtle` or `off` the route goes solid with `✦` and no sweep.
- Result: passes. At `full`: toast, one sweep, `✦`. At `subtle` (a second, live run): toast, solid `✦`, no
  sweep, and the full band held about 8 s before collapsing to one row
  (`✓ Plan: … · N tasks · done in …   g: all tasks`). About 3 minutes after the finish the band went. The
  pane stayed, which is by design here: it had been used by hand, so it counts as the person's. A pane
  Waypoints opened by itself and nobody touched was not tested for the close.

### 8. Claude Desktop

- [ ] **Do:** open the same session in the Desktop app (or start a plan there).
- **See:**
  - The route is a drawn line (circles and lines), not characters.
  - The running node glows softly; at `full` a small light travels along the running leg.
  - The animation does **not restart every 15 seconds** (no visible hitch or reset).
  - At the finish, `full` sweeps once and twinkles three stars at the last node; it does not repeat.
  - The running row shows a still `◉`, not a spinner.
  - With the OS "reduce motion" setting on, nothing moves.
- Result: ______

### 9. Recording Mode masks titles

- [ ] **Do:** turn Recording Mode on (however you normally do). Look at the band and the pane.
- **See:** task titles, `◆ <agent>` names, the goal check reason, and other chats' titles are all masked.
  On Desktop, the route's accessible text is only numbers (`2 of 4 tasks done, task 3 running`).
- Result: ______

### 10. A long plan in a narrow window

- [x] **Do:** at about 80 columns, plan 20+ tasks (*"Plan 24 tiny S tasks to rename each file in this
  folder"*).
- **See:** the route turns into **one glyph per task** (`●●●◉○○○…`), no legs, no wrapping, and ends in `…`
  if it is still too long. The header and the rows do not wrap.
- Result: passes (a 34-task plan: 10 left over from earlier plans plus 24 new). One glyph per task, ends in
  `…`, and neither the header nor the running row wraps. At about 100 columns the same plan still drew the
  full route on one row.

---

## Also worth a glance

- [ ] **Plan title (fixed in 2.0.2, to re-check):** a plan started without `/goal` was named after its
  **first task** (`◎ Plan: Review README intro`) because `serveTool` in `hooks/register.mjs` used
  `condition: first.title`. 2.0.2 adds an optional `goal` field to the tool's `plan` action, which the
  standing line asks Claude to fill with one line; the title falls back to the first task. Re-check on
  2.0.2: a plan to review the README should read `◎ Plan: <the goal line>`, in the band, the pane, the
  toast and the one-row collapse.
- [x] **Footer:** still shows `◎ plan 44% · ~2m` (or `◎ goal …`) in every view. (Seen: `plan 17%`,
  `plan 67% · ~2m`, `plan done ✓`.)
- [x] **ETA:** appears in the header (`· ~2m`) only after two tasks are done. (Seen at 4 of 6.)
- [ ] **A running task past twice the plan's pace:** its time (`· 4m`) turns amber.
- [x] **A plan that grew** (Claude adds tasks): a dim `+k` after the route.
- [ ] **Subagents:** a task started with a subagent name shows `◆ name` in that agent's colour (the same
  colour Agent-Pulse gives it).
- [ ] **Goal check not met:** a coloured `Goal check: not met yet: …` row at the bottom of the band.
- [x] **Paused / interrupted:** `⏸ paused, waiting on you` or `interrupted` appears when it applies.
  (`paused` seen; `interrupted` not tried.)
- [ ] **Other chats** in the pane (with a second session running a plan): each has its own small route,
  `pct% · ~ETA`, and `done ✓` or `stopped` when finished.
- [ ] **`/waypoints hide`** hides the band (footer stays); **`show`** brings it back; **`/waypoints clear`**
  stops tracking.
- [ ] **Old 1.1 chats**: a chat still running 1.1 shows up in "Other chats" without errors.

---

## If something looks wrong

Run `claude --debug` and look for lines beginning `waypoints:` (for example *the pane did not open*, with
the reason). Note the step, the window width, the Animation and Palette settings, and what you saw instead.
