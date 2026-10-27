# Waypoints 2.3.1: test run, 2026-10-26

What this run checked (a finished plan, a stopped plan, the auto-opened pane, and a hidden band): the 2.3.1 fix that makes a finished (or stopped) plan leave the screen 30 seconds after it
ends, band and footer label together, with nothing else to trigger a redraw. The unit tests (133 pass) used a mock
clock, so this run drove real plans in the Windows Terminal and looked at the screen. The earlier run is
[TEST-RUN-2.3.0.md](./TEST-RUN-2.3.0.md).

**Setup:** waypoints **2.3.1** installed (`claude plugin list`), the installed `register.mjs` holding `RECENT_MS = 30000`
and `expireAfter`, a session started after the update, a window of 100+ columns. The person watched the screen and
touched no key during each check; the times below are from their reading, not a stopwatch log.

---

## The checks

### 1. Installed version

- [x] `claude plugin list` shows `waypoints@afterever-mods` **2.3.1**, enabled, user scope.
- Result: passes. The installed `register.mjs` has the 30-second constant and `expireAfter` (its definition and the
  calls in `stopGoal` and `finishGoal`).

### 2. A plan that finishes (C1)

- [x] **Do:** a 2-task plan titled `finish test`, task 1 started and done, task 2 started and done, then the turn
  ended with one sentence and no keypress.
- **See:** the green done band, then the one-row summary, the footer label `◎ plan done ✓`, and at about 30 s the
  row and the label gone together.
- Result: passes. The band and the footer label both went at about 30 s, by themselves, with no keypress.

### 3. A plan that is stopped (C2)

- [x] **Do:** a 3-task plan titled `stop test` with task 1 running, the turn ended, then `/waypoints clear`.
- **See:** the band collapses at once to `◎ Plan: stop test   stopped`, the footer reads `◎ plan stopped`, and both go
  at about 30 s with no keypress (the `stopGoal` path).
- Result: passes, exactly as described.

### 4. The pane that Waypoints opened (C3)

- [x] **Do:** with `/waypoints` not typed in the session, a 2-task plan titled `pane test`, both tasks done, no keypress.
- **See:** the pane opens by itself when the plan starts and closes at about 30 s after the finish.
- Result: passes. The pane opened, and closed at about 30 s.

### 5. A hidden band (C4)

- [x] **Do:** a 2-task plan with task 1 running, then `/waypoints hide`, then both tasks done, no keypress.
- **See:** no band and no summary row at any point; the footer label `◎ plan done ✓` shows and goes at about 30 s.
- Result: passes. The band stayed hidden, the footer showed, and went at about 30 s.
- **A first attempt was a bad test, not a bug.** `/waypoints hide` and then a *new* plan showed the band, the footer and
  the pane, all three, and they went at 30 s. A new goal or plan sets `hidden = false` on purpose (`startGoal` and
  `serveTool` in `register.mjs`; the README says "A new goal or plan shows it again"). The person prefers it that
  way: calling Waypoints again is a reason to show it. Hiding is tested only on a plan that is already running.

---

## Not covered

- **A pane the person opened** staying open at 30 s (`auto.test.ts` only).
- **The exact second.** "About 30 s" is what was seen by eye, not a measured gap to the 0.2 s margin.
- **Claude Desktop.** The band is drawn there only while a turn runs, so the 30-second exit is not visible there.
