# Waypoints 2.0.2: test run, 2026-10-17

What this run checked: the 2.0.2 fix that names a plan after its goal instead of its first task. The earlier run
is [TEST-RUN-2.0.1.md](./TEST-RUN-2.0.1.md). The unit tests (80 pass) cannot say whether Claude actually fills
the new `goal` field in a real session, so this run drove real plans and looked at the screen.

**Setup:** waypoints **2.0.2** installed (`claude plugin list`), a session started after the update, a window of
144+ columns, Palette and Animation on `follow`, Pane on `auto`.

---

## The checks

### 1. Installed version

- [x] `claude plugin list` shows `waypoints@afterever-mods` **2.0.2**, enabled, user scope.
- Result: passes. The tool schema loaded in the session already carried the `goal` field.

### 2. Claude fills `goal` on a plan outside `/goal`

- [x] **Do:** *"Make a 6-task plan with the Waypoints tool for reviewing this repo's README, one task per
  section, then do the tasks one at a time. Read-only: don't edit anything."*
- **See:** the chat's state file in `~/.claude/mods-data/waypoints/` has `kind: "plan"` and a `title` that is
  the goal line, not task 1.
- Result: passes. `title` and `condition` were `Review the README for stale claims`; task 1 was `Review
  intro`. Claude passed `goal` on all three plans made in this session (the standing line asks for it).
  Three is too small a sample to say how often Claude leaves it out; see "Not covered".

### 3. The band and the pane show the goal line

- [x] **Do:** look while a task runs.
- **See:** the band header reads `◎ Plan: <goal line>` and the pane heading is the same line.
- Result: passes, on a second plan whose tasks a subagent ran (about three minutes, so there was time to look):
  - band: `Check the waypoints README against its code`, not the first task;
  - pane: `Plan: Check the waypoints README against its code`, then `0 of 2 · 0% · 1m elapsed · ETA after 2 tasks
    finish`;
  - running row: `Compare README claims with the hooks   ◆ reviewer · running 1m`, so the agent name from `by`
    shows;
  - the band kept the same height. This also closes two items left open in the 2.0.1 run (the `◆ <agent>` name
    and "same height between tasks").

### 4. Finishing a plan

- [x] **Do:** let the plan finish (end the turn).
- **See:** the toast `Plan done in …: <goal line>`, then the one-row collapse
  `✓ Plan: <goal line> · N tasks · done in …`.
- Result: passes. The collapsed row read `✓ Plan: Review the README for stale claims` and the toast appeared
  after both plans. The toast is brief and was not read in full either time, so its exact wording is not
  confirmed; the toast text is built from the same title as the band.

### 5. Other chats in the pane

- [ ] **Do:** from a second session, look at **Other chats**: its row should use the goal line too.
- Result: not tested (needs a second session).

### 6. `/goal <condition>` keeps its title

- [x] **Do:** `/goal Find the longest file in waypoints/hooks and report its name and line count. Read-only,
  edit nothing`, while Claude passes its own, different `goal` on the `plan` call (`Measure the waypoints hook
  files`).
- **See:** the title stays the condition you typed.
- Result: passes. Band: `◎ Goal: Find the longest file in waypoints/hooks and report its name and line count.
  Read-only, edit nothing`, with the route and the running row. State file: `kind: "goal"`, `title` equal to
  `condition`; Claude's own `goal` line did not replace it. The pane heading for a `/goal` was not looked at.

### 7. Two `plan` calls in one turn

- Not run. Expected, per the handoff: both land on the same plan, so the second `goal` does not retitle it.

---

## Not covered

- **How often Claude fills `goal`.** 3 of 3 here, but in a session where the model writing the plans is the one
  that wrote the standing line's wording. A different model or a long session would be a fairer test. If Claude
  leaves it out most of the time, strengthen `standing` in `hooks/plan.mjs`.
- **Step 5** (Other chats), the **toast's full text**, and the **`/goal` pane heading**.
- Still open from 2.0.1: the next plan reopening a closed pane, `Pane: off`, Claude Desktop, Recording Mode.

## Found along the way (not a 2.0.2 bug)

- **Questions cover the band.** `AskUserQuestion` draws over the band, so it cannot be used while the band is
  being checked. Hold a task open with real work instead (a subagent worked well).
- **A README review** by a subagent found claims in `waypoints/README.md` that the code contradicts, not yet
  fixed:
  - `/waypoints clear` only marks a running goal stopped; the band keeps showing "stopped" for 3 minutes.
  - `/waypoints strict` and `auto` turn on for any argument other than `off`, typos included.
  - "Subagents are told never to call `plan`" is only wording in the standing line; nothing enforces it.
  - The pane lists at most 15 other chats while its heading counts all of them.
  - Strict mode blocks only Edit, Write, NotebookEdit and MultiEdit, for the main agent, in a `/goal` only.
