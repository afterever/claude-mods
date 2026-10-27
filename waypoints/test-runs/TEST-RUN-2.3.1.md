# Waypoints 2.3.1: test run, 2026-10-26

What this run checked: the 2.3.1 fix that makes a finished (or stopped) plan leave the screen 30 seconds after it
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

---

## Not covered

- **The pane (C3)** closing at about 30 s when Waypoints opened it, and staying open when the person opened it.
  Covered by the unit test in `auto.test.ts` only.
- **A hidden band (C4):** `/waypoints hide`, then a finished plan, where the footer label alone should go at 30 s.
  Covered by the unit test only.
- **The exact second.** "About 30 s" is what was seen by eye, not a measured gap to the 0.2 s margin.
- **Claude Desktop.** The band is drawn there only while a turn runs, so the 30-second exit is not visible there.
