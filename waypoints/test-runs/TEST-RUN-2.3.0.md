# Waypoints 2.3.0: test run, 2026-10-26

What this run checked: the 2.3.0 row that says `◆ waiting on <what>` when a turn ends with background work still
running, instead of `⏸ paused, waiting on you`. The unit tests (132 pass) and a headless `claude -p` probe could
not show the row on screen, so this run drove real plans in the Windows Terminal and looked at the band. The
earlier run is [TEST-RUN-2.0.2.md](./TEST-RUN-2.0.2.md).

**Setup:** waypoints **2.3.0** installed (`claude plugin list`), sessions started after the update (`CLAUDE_CODE_ENTRYPOINT=cli`),
a window of 100+ columns. To see what the engine really sends, a temporary line in the installed copy of
`register.mjs` (not in the repo, since reverted) wrote every `classic.Stop` input to a log file.

---

## The checks

### 1. Installed version

- [x] `claude plugin list` shows `waypoints@afterever-mods` **2.3.0**, enabled, user scope.
- Result: passes. The installed `draw.mjs` has both rows (`◆ waiting on` and `⏸ paused, waiting on you`).

### 2. A background shell (T2)

- [x] **Do:** *"Make a 2-task plan, start task 1, run `sleep 60` with the Bash tool using `run_in_background` and a
  description of `Sleep 60 probe`, end your turn."*
- **See:** a dim `◆ waiting on Sleep 60 probe` while it runs; the row goes away when the command ends and wakes
  the session.
- Result: passes in a fresh session. The log shows the real interactive `Stop` input:
  `background_tasks: [{"type":"shell","status":"running","description":"Sleep 60 probe","command":"sleep 60"}]`,
  and the `Stop` of the turn the finished command woke carried `[]`. After 60 s the session woke by itself.

### 3. A background agent (T1)

- [x] **Do:** a 2-task plan, then one background haiku agent (`run_in_background`, description `Read hooks`)
  that reads every file in `waypoints/hooks`, and end the turn.
- **See:** the dim `◆ waiting on Read hooks` until the agent reports.
- Result: passes.

### 4. Two tasks at once (T3)

- [x] **Do:** in one message, a background subagent (`Read hooks again`) and a background Bash `sleep 60`.
- **See:** the dim `◆ waiting on 2 background tasks`.
- Result: passes, in a fresh terminal. The `Stop` input held both: one `subagent` and one `shell`. The next `Stop`
  (the agent had finished) held only the shell, then `[]`.

### 5. Nothing running keeps the old row (T4)

- [x] **Do:** a 2-task plan with task 1 running and neither finished, then a plain-text question and no tool.
- **See:** the bright `⏸ paused, waiting on you` and no `◆ waiting on …`.
- Result: passes. The last `Stop` carried `background_tasks: []`.

---

## Not covered

- **T5** (a task killed by hand from `/tasks`; the documented gap), **T6** (`AskUserQuestion` with a plan open in
  the Terminal) and **T7** (a Monitor). Not run.
- **Claude Desktop.** The band is drawn there only while a turn runs, so the row cannot show.
- **Whether the row appears at once or after a redraw** was not timed; it was seen while the work ran.

## Found along the way (not a 2.3.0 bug)

- **The row needs a plan that is still running.** The notable row is drawn only while the plan's status is
  `running`. A plan whose tasks are all done shows the green done band for `FULL_MS` and then one row, with no
  waiting row. My first T3 and T4 prompts left out "make a plan", and the first T4 ran on a finished plan, so
  they showed nothing. That is by design, not a defect.
- **One miss that is not explained.** In the first test session (a plan with two tasks running at once, then one
  running), the row did not show during a background `sleep 90`. In fresh sessions it showed every time. Two
  untested explanations: with two running tasks the band has 6 rows and `draw.mjs` trims `next`, then the
  notable row, before the second `now` row when `maxRows` is short; and in the second look only about 30 s of the
  sleep was left. The session had no debug log, so neither is confirmed. If it comes back with two running tasks,
  the fix would be to let the waiting row outrank a second `now` row.
- **A subagent cannot run a bare `sleep`.** In this setup Bash refuses a standalone `sleep 90` and points to a
  background command or Monitor. A background agent told to `sleep` just ends early; give it real work to do.
