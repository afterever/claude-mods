# Waypoints 2.1.0: Options Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/waypoints`' options few and clear: `strict` gone (always on), `hide`/`show` confirm with a toast, the pane's help row shows state, "Other chats" covers 1 hour, and old data files can be pruned.

**Architecture:** All behaviour stays in `waypoints/hooks/register.mjs` (hooks, commands) and `draw.mjs` (the pane). The new pruning rules and the delete command's argv are pure functions in a new `prune.mjs`, so they are tested without the engine. `$.fs` has no delete, so prune runs the host's own delete through `$.process.run(argv)` (no shell, no dialog): `cmd /d /c del /f /q <paths>` on Windows, `rm -f -- <paths>` elsewhere. (Changed after Task 1: the person chose "direct, no dialog" over the Bash tool and its permission dialog; the probe proved the Windows form deletes, a name with a space included.)

**Tech Stack:** Plain ES modules (`.mjs`), tests in TypeScript on `claude-code/testing`, run with `claude plugin test waypoints`.

**Spec:** Approved in chat on 2026-10-18 (session "options"); no separate file. The approved spec is copied below and is the source for every task.

## Spec (as approved)

| Command | Behaviour after 2.1.0 |
|---|---|
| `/waypoints` (or any unknown word) | Opens the pane; in `-p` prints the plan as text. Unchanged |
| `/waypoints hide` / `show` | Unchanged behaviour, **plus a toast** |
| `/waypoints auto on\|off` | **Unchanged** in every way (name, behaviour, default on, toast, "anything but `off` is on") |
| `/waypoints clear`, `/goal clear` | Stop this chat's running goal or plan. Unchanged |
| `/waypoints strict …` | **Removed.** Now an unknown word, so it opens the pane. No special note or toast |
| `/waypoints prune` | **New.** Deletes old data files directly (`$.process.run`, no dialog), then toasts the count |

- Strict is always on: in a running `/goal` with no plan yet, the main agent's `Edit`, `Write`, `NotebookEdit`, `MultiEdit` calls are refused. It steps aside when the plan tool failed to register (`toolFailed`). A saved `settings.strict` from 2.0 is ignored.
- "Other chats" lists the last **1 hour** (was 12 hours).
- The pane's last row is one line with state. When the data folder holds more than 100 `.json` files, one more dim row above it gives the count, the full folder path, and `/waypoints prune`.
- Docs: the word `strict` leaves the README and DESIGN.md except one line in "What changed in 2.1.0". Old `test-runs/*.md` files stay as they are (they record past tests).

## Global Constraints

- Version `2.1.0` in `waypoints/.claude-plugin/plugin.json` and in the `waypoints` row of `SETUP.md`.
- Toast copy, exact: `Waypoints band hidden · /waypoints show brings it back`, `Waypoints band shown`, `Pruned N old files` (`Pruned 1 old file` for one), `Nothing to prune`, `Prune did not run: <reason>`, `Prune did not run: delete old files by hand in <dir>` (a Windows path cmd cannot take). `/waypoints` in these is `/${commandName}` (it can be `/waypoints-mod`).
- Help row copy, exact: `auto: on · /waypoints hide|show · clear (stop the goal) · look & pane: /config → Waypoints` (`auto: off` when off).
- File note copy, exact: `<N> old files in <dir> · /waypoints prune, or delete them while no plan is running`, shown only when N > 100.
- Empty "Other chats" copy, exact: `No other chat has a goal in the last hour.`
- Prune never deletes this chat's file, never a running goal's file touched in the last 24 hours, and lists every file by full path (no wildcards). At most 200 files per run (my call).
- Git: branch `waypoints-options`, PR to `master`; the person merges (auto mode blocks `gh pr merge`).
- Shell gotcha on this PC: never call `python3` (a Store stub that hangs 2 minutes).

## Review Focus

1. **A file another chat is writing right now** fails to parse. Expect: prune keeps it unless it is older than 1 hour. Test in Task 4 (`unreadable fresh file is kept`).
2. **The delete fails or cannot start** (`$.process.run` rejects, or the files are still there afterwards). Expect: a `Prune did not run: …` toast; the count is the files actually gone, never the files picked. Test in Task 5.
3. **A path with a space or a quote** (e.g. `C:\Users\Ann O'Brien`). Expect: each path is one argv entry, unchanged. Test in Task 4.
4. **A Windows path holding a cmd metacharacter** (`& | < > ^ % ! "`): `cmd` would read it as syntax. Expect: no delete runs, the toast says to delete by hand in the folder. Test in Task 4 (`deleteArgv` returns `null`) and Task 5.
5. **A plan Claude starts without `/goal`** while strict is always on. Expect: edits are never blocked. Test in Task 2.

---

### Task 0: Branch

- [ ] **Step 1:** `cd C:\github\claude-mods && git checkout master && git pull && git checkout -b waypoints-options`. Expected: `Switched to a new branch 'waypoints-options'`.
- [ ] **Step 2:** `git add docs/superpowers/plans/2026-10-18-waypoints-options.md && git commit -m "waypoints plan: the 2.1.0 options revamp"` (attribution lines per the session's reminder).

### Task 1: Live probe: can a mod delete files with `$.process.run` (throwaway) — DONE

No mod in this repo has called a built-in tool. Prove it before building on it.

**Files:** a throwaway dev mod under `C:\Users\wenha\.claude\dev-mods\` (via the `plugin-authoring` skill's own throwaway-mod flow). Nothing in the repo.

- [x] **Step 1:** First probe built for the `$.tool.call` Bash route; after the person chose "direct, no dialog" it was rewritten: `/prune-probe` writes `a.json` and `b c.json` under `~/.claude/mods-data/prune-probe/`, runs `$.process.run(["cmd","/d","/c","del","/f","/q", ...paths])` (Windows) and checks `$.fs.exists` before and after.
- [x] **Step 2:** Result on this PC: `{"os":"Windows_NT","win":true,"before":[true,true],"after":[false,false],"run":{"exitCode":0,"stdout":"","stderr":""}}`. The direct route works, a name with a space included.
- [x] **Step 3:** Recorded here and in the ledger; it goes into the PR notes and DESIGN.md (Task 6).
- [ ] **Step 4:** Delete the probe mod folder (ask first, per the person's rule on deletes).

### Task 2: Strict is always on

**Files:**
- Modify: `waypoints/hooks/register.mjs` (`settings` at :43, the `tool.call` hook at :418-420, the `strict` branch in `command.run` at :484-489)
- Modify: `waypoints/hooks/plan.mjs:259-261` (`strictDeny` text)
- Test: `waypoints/hooks/flow.test.ts`, `waypoints/hooks/plan.test.ts`

**Interfaces:**
- Produces: `settings` is `{ auto: boolean }` only; `strictDeny(tool: string): string` keeps its name and signature.

- [ ] **Step 1: Write the failing tests** in `flow.test.ts`. Extend `world()` with a `/goal` beneath (`on('command.run', { command: 'goal' }, async () => ({}) as any)`) and a base answer for other tools (`on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as any)`); add a helper `edit = ($) => $.tool.call({ tool: 'Edit', file_path: 'a.md', old_string: 'a', new_string: 'b', tool_use_id: 'e' + ++n })`. A refused call resolves errored with the reason as its text, so assert on `r.deny ?? r.text`.

```ts
test('a /goal refuses file edits until Claude has planned, with no setting to turn it off', async ($, on) => {
  world(on)
  await start($)
  await $.command.run({ command: 'goal', args: 'ship the band' } as any)
  const before: any = await edit($)
  expect(before.deny ?? before.text).toContain('plan the goal before changing files')
  await $.tool.call({ tool: TOOL, action: 'plan', tasks: [{ title: 'one', size: 'S' }], tool_use_id: 'p1' })
  const after: any = await edit($)
  expect(after.text).toBe('ok')
})

test('a strict off saved by 2.0 no longer lets a /goal edit before its plan', async ($, on) => {
  world(on, { stored: { settings: { strict: false, auto: true } } })
  await start($)
  await $.command.run({ command: 'goal', args: 'ship the band' } as any)
  const r: any = await edit($)
  expect(r.deny ?? r.text).toContain('plan the goal before changing files')
})

test('the guard steps aside when the plan tool did not register', async ($, on) => {
  world(on, { noTool: true })
  await start($)
  await $.command.run({ command: 'goal', args: 'ship the band' } as any)
  expect(((await edit($)) as any).text).toBe('ok')
})

test('edits are never held back outside a /goal', async ($, on) => {
  world(on)
  await start($)
  expect(((await edit($)) as any).text).toBe('ok')
})
```

In `plan.test.ts`, add to the "every word Claude reads" test: `expect(strictDeny(TOOL)).not.toContain('strict')`.

- [ ] **Step 2:** `claude plugin test waypoints`. Expected: the first, second and plan.test cases FAIL (strict is off by default; text says `(strict)`); the others pass.
- [ ] **Step 3: Implement.** `settings = { auto: true }`; the guard reads `if (!toolFailed && WRITERS.has(e.tool)) return { deny: strictDeny(toolName) }`; delete the `key === 'strict'` branch so the word falls through to the pane; `strictDeny` text becomes `` `Waypoints: plan the goal before changing files. Call ${tool} with action "plan" first, then retry this.` ``. In `draw.test.ts:234` drop `strict: false` from `paneView`'s settings, and in `flow.test.ts:87` the stored settings to `{ auto: false }`.
- [ ] **Step 4:** `claude plugin test waypoints`. Expected: all pass.
- [ ] **Step 5:** Add to `auto.test.ts`: `test('/waypoints strict on is an unknown word now: it opens the pane and toasts nothing', …)` asserting `w.opened.at(-1).id === 'waypoints'` and `w.toasts` empty after `$.command.run({ command: 'waypoints', args: 'strict on' })`. Run; expected PASS (it falls through already).
- [ ] **Step 6:** Commit `waypoints: strict is always on, and steps aside without the plan tool`.

### Task 3: hide/show toasts, the 1-hour list, the help row and the file note

**Files:**
- Modify: `waypoints/hooks/register.mjs` (`OTHERS_MS` :31, hide/show branch :496-500, `loadOthers` :90-111, the Pane render :569-574)
- Modify: `waypoints/hooks/draw.mjs:341` and `:344-346`
- Create: `waypoints/hooks/prune.mjs` (only `OTHERS_MS` and `shownPath` in this task)
- Test: `waypoints/hooks/flow.test.ts`, `waypoints/hooks/draw.test.ts`, `waypoints/hooks/prune.test.ts`

**Interfaces:**
- Produces in `prune.mjs`: `export const OTHERS_MS = 3600000`; `export const NOTE_AT = 100`; `export function shownPath(path: string): string` (the folder as the person's system writes it: all separators turned to `\` when the path holds a `\`, with a trailing separator).
- Produces in register: module `let fileCount = 0`, set by `loadOthers` to the number of `.json` file entries in the folder (this chat's included). The pane's view gains `files: { count: number, dir: string }`.
- `register.mjs` imports `OTHERS_MS` from `prune.mjs` and drops its own constant.

- [ ] **Step 1: Write the failing tests.**

`prune.test.ts` (new, same imports style as `draw.test.ts`):
```ts
test('the folder is shown as the system writes it, ending in a separator', async () => {
  expect(shownPath('C:\\Users\\bats/.claude/mods-data/waypoints')).toBe('C:\\Users\\bats\\.claude\\mods-data\\waypoints\\')
  expect(shownPath('/home/bats/.claude/mods-data/waypoints')).toBe('/home/bats/.claude/mods-data/waypoints/')
})
```

`flow.test.ts`:
```ts
test('/waypoints hide and show each say what they did', async ($, on) => {
  const w = world(on)
  await start($)
  await $.command.run({ command: 'waypoints', args: 'hide' } as any)
  expect(w.toasts.at(-1)).toBe('Waypoints band hidden · /waypoints show brings it back')
  await $.command.run({ command: 'waypoints', args: 'show' } as any)
  expect(w.toasts.at(-1)).toBe('Waypoints band shown')
})
```

`draw.test.ts`: replace `the pane ends with the commands and where the look is set` with:
```ts
test('the pane ends with auto\'s state, the commands and where the look is set', async () => {
  const on = lines(drawPane(el, paneView(midway(), { settings: { auto: true } })))
  expect(on.slice(-1)[0]).toBe('auto: on · /waypoints hide|show · clear (stop the goal) · look & pane: /config → Waypoints')
  const off = lines(drawPane(el, paneView(midway(), { settings: { auto: false } })))
  expect(off.slice(-1)[0]).toBe('auto: off · /waypoints hide|show · clear (stop the goal) · look & pane: /config → Waypoints')
  expect(lines(drawPane(el, paneView(null))).join('\n')).toContain('No goal in this chat')
})

test('past 100 files the pane names the folder and how to prune it', async () => {
  const dir = 'C:\\Users\\bats\\.claude\\mods-data\\waypoints\\'
  const many = lines(drawPane(el, paneView(midway(), { files: { count: 101, dir } })))
  expect(many.slice(-2)[0]).toBe(`101 old files in ${dir} · /waypoints prune, or delete them while no plan is running`)
  const few = lines(drawPane(el, paneView(midway(), { files: { count: 100, dir } })))
  expect(few.join('\n')).not.toContain('old files in')
})

test('with no other chat the pane says the list covers the last hour', async () => {
  expect(lines(drawPane(el, paneView(midway()))).join('\n')).toContain('No other chat has a goal in the last hour.')
})
```

- [ ] **Step 2:** `claude plugin test waypoints`. Expected: these five FAIL (no `prune.mjs`, no toasts, old row, old copy).
- [ ] **Step 3: Implement.** `prune.mjs` with the three exports. hide/show toast with `commandName`. `loadOthers` counts `.json` file entries into `fileCount` (before the self-skip). The Pane render passes `files: { count: fileCount, dir: shownPath(home + DIR) }`. `drawPane`: the note row (dim) when `v.files && v.files.count > NOTE_AT`, then the help row (dim) with the copy above. Docs wait for Task 6.
- [ ] **Step 4:** `claude plugin test waypoints`. Expected: all pass.
- [ ] **Step 5:** Commit `waypoints: hide and show say so, the pane shows auto's state, other chats cover an hour`.

### Task 4: What prune deletes and how it says it (pure)

**Files:**
- Modify: `waypoints/hooks/prune.mjs`
- Test: `waypoints/hooks/prune.test.ts`

**Interfaces:**
- Produces: `export const DEAD_MS = 24 * 3600000` (matches `restore()`'s 24 h: an older file is never loaded again); `export const PRUNE_MAX = 200`;
  `export function pickPrunable(items: { name: string, mtimeMs: number, goal: object | null }[], o: { now: number, self: string }): string[]` — the names to delete, oldest `mtimeMs` first, at most `PRUNE_MAX`. A name is picked when it is not `o.self` and any of: `goal === null` and older than `OTHERS_MS`; older than `DEAD_MS`; `goal.status !== 'running'` and `now - (goal.endedAt || mtimeMs) > OTHERS_MS`.
  `export function deleteArgv(win: boolean, paths: string[]): string[] | null` — Windows: `['cmd', '/d', '/c', 'del', '/f', '/q', ...paths]` with every `/` turned to `\`, or `null` when any path holds one of `& | < > ^ % ! "`; elsewhere `['rm', '-f', '--', ...paths]`.

- [ ] **Step 1: Write the failing tests** (`H = 3600000`, `NOW` fixed):

```ts
test('prune picks finished goals past the hour, dead files and old unreadable ones, oldest first', async () => {
  const items = [
    { name: 'self.json', mtimeMs: NOW - 30 * H, goal: { status: 'met', endedAt: NOW - 30 * H } },
    { name: 'a.json', mtimeMs: NOW - 3 * H, goal: { status: 'met', endedAt: NOW - 3 * H } },
    { name: 'b.json', mtimeMs: NOW - 10 * MIN, goal: { status: 'running' } },
    { name: 'c.json', mtimeMs: NOW - 10 * MIN, goal: { status: 'met', endedAt: NOW - 10 * MIN } },
    { name: 'd.json', mtimeMs: NOW - 25 * H, goal: { status: 'running' } },
    { name: 'e.json', mtimeMs: NOW - 2 * H, goal: null },
  ]
  expect(pickPrunable(items, { now: NOW, self: 'self.json' })).toEqual(['d.json', 'a.json', 'e.json'])
})

test('unreadable fresh file is kept: another chat may be writing it', async () => {
  expect(pickPrunable([{ name: 'w.json', mtimeMs: NOW - MIN, goal: null }], { now: NOW, self: 's.json' })).toEqual([])
})

test('prune takes at most 200 files a run', async () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ name: `${i}.json`, mtimeMs: NOW - 30 * H - i, goal: null }))
  expect(pickPrunable(items, { now: NOW, self: 's.json' })).toHaveLength(200)
})

test('the delete names every file as its own argument, no shell', async () => {
  const p = ["C:\\Users\\Ann O'Brien/.claude/mods-data/waypoints/a.json", "C:\\Users\\Ann O'Brien/.claude/mods-data/waypoints/b.json"]
  expect(deleteArgv(true, p)).toEqual(['cmd', '/d', '/c', 'del', '/f', '/q', "C:\\Users\\Ann O'Brien\\.claude\\mods-data\\waypoints\\a.json", "C:\\Users\\Ann O'Brien\\.claude\\mods-data\\waypoints\\b.json"])
  expect(deleteArgv(false, ['/home/ann/.claude/mods-data/waypoints/a.json'])).toEqual(['rm', '-f', '--', '/home/ann/.claude/mods-data/waypoints/a.json'])
})

test('on Windows a path cmd would read as syntax deletes nothing', async () => {
  expect(deleteArgv(true, ['C:\\Users\\R&D/.claude/mods-data/waypoints/a.json'])).toBeNull()
  expect(deleteArgv(true, ['C:\\Users\\50%/.claude/mods-data/waypoints/a.json'])).toBeNull()
})
```

- [ ] **Step 2:** `claude plugin test waypoints`. Expected: these five FAIL (`pickPrunable`/`deleteArgv` not exported).
- [ ] **Step 3: Implement** both in `prune.mjs`.
- [ ] **Step 4:** Run; expected all pass.
- [ ] **Step 5:** Commit `waypoints: what prune deletes and the command that deletes it`.

### Task 5: The `/waypoints prune` command

**Files:**
- Modify: `waypoints/hooks/register.mjs` (`command.run` handler :479-510, `registerCommand` spec :180)
- Test: `waypoints/hooks/flow.test.ts`

**Interfaces:**
- Consumes: `pickPrunable`, `deleteArgv`, `shownPath`, `OTHERS_MS` from Task 3–4; `loadOthers($)`.
- Produces: module `let win = false`, set in `session.start` to `(await $.env.get('OS')) === 'Windows_NT'`; `async function prune($): Promise<string>` in `register.mjs`, returning the toast text. In `command.run`: `if (key === 'prune') { const msg = await prune($); if (!(await $.session.surface())) return { text: msg }; $.ui.toast(msg); return {} }`.

`prune($)`: `$.fs.list(home + DIR)`; for each `.json` file entry read and `JSON.parse` it (`null` on any failure); `pickPrunable(…, { now, self: sessionId + '.json' })`; none → `Nothing to prune`. `argv = deleteArgv(win, paths)`; `null` → `Prune did not run: delete old files by hand in ${shownPath(home + DIR)}`. `await $.process.run(argv)`; a rejection → `Prune did not run: ${clip(err.message, 80)}`. Then count the paths `$.fs.exists` no longer finds: 0 → `Prune did not run: ${clip(r.stderr || 'exit ' + r.exitCode, 80)}`; else `Pruned ${gone} old file${gone === 1 ? '' : 's'}`. Afterwards `await loadOthers($)` and `$.ui.invalidate('ui.render')`.

- [ ] **Step 1: Write the failing tests.** Extend `world()` options with `files?: { name: string, mtimeMs: number, body: string }[]`, `home?: string` (default `'C:/Users/bats'`), `os?: string` (default `'Windows_NT'`) and `run?: (argv) => any`; `mock.env` gets `{ USERPROFILE: home, OS: os }`. Keep a `Set` of present names: `fs.list` returns them as `{ name, kind: 'file', size: 1, mtimeMs, isLink: false }`, `fs.read` returns the `body` whose name ends `e.path`, `fs.exists` is true for a present name (false otherwise, as today). `process.run` records `e.argv` in `w.runs`, removes every present name an argv entry ends with, and answers `o.run?.(e.argv) ?? { value: { exitCode: 0, stdout: '', stderr: '' } }` (a `run` that throws makes the call reject).

```ts
const finished = (h: number) => JSON.stringify({ status: 'met', endedAt: NOW - h * H, tasks: [] })
const WIN = 'C:\\Users\\bats\\.claude\\mods-data\\waypoints\\'

test('/waypoints prune deletes old finished files by full path, with no shell', async ($, on) => {
  const w = world(on, { files: [
    { name: 'sess-1.json', mtimeMs: NOW - 30 * H, body: finished(30) },
    { name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) },
    { name: 'c.json', mtimeMs: NOW - 10 * MIN, body: finished(0.1) },
  ] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.runs).toEqual([['cmd', '/d', '/c', 'del', '/f', '/q', `${WIN}a.json`]])
  expect(w.toasts.at(-1)).toBe('Pruned 1 old file')
})

test('off Windows prune deletes with rm', async ($, on) => {
  const w = world(on, { os: '', home: '/home/bats', files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.runs).toEqual([['rm', '-f', '--', '/home/bats/.claude/mods-data/waypoints/a.json']])
})

test('a delete that cannot start says prune did not run', async ($, on) => {
  const w = world(on, { files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }], run: () => { throw new Error('spawn cmd ENOENT') } })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.toasts.at(-1)).toBe('Prune did not run: spawn cmd ENOENT')
})

test('with nothing old prune runs no command', async ($, on) => {
  const w = world(on, { files: [{ name: 'c.json', mtimeMs: NOW - 10 * MIN, body: finished(0.1) }] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.runs).toEqual([])
  expect(w.toasts.at(-1)).toBe('Nothing to prune')
})

test('a Windows folder cmd cannot take is left for the person, named as Windows writes it', async ($, on) => {
  const w = world(on, { home: 'C:\\Users\\R&D', files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.runs).toEqual([])
  expect(w.toasts.at(-1)).toBe('Prune did not run: delete old files by hand in C:\\Users\\R&D\\.claude\\mods-data\\waypoints\\')
})
```

- [ ] **Step 2:** `claude plugin test waypoints`. Expected: these five FAIL (`prune` opens the pane today).
- [ ] **Step 3: Implement** `prune($)` and the branch. Spec at :180 becomes: description ``Waypoints: this chat's goal task list and every chat's goal (/waypoints hide|show|auto on|off|clear|prune)``, `argumentHint: '[hide|show|auto on|off|clear|prune]'`.
- [ ] **Step 4:** `claude plugin test waypoints`. Expected: all pass (84 before this plan, plus the new ones).
- [ ] **Step 5:** Commit `waypoints: /waypoints prune deletes old data files`.

### Task 6: Docs and version

**Files:** `waypoints/README.md`, `waypoints/DESIGN.md`, `waypoints/.claude-plugin/plugin.json`, `SETUP.md`

- [ ] **Step 1: README.** Line 13: "from the last 12 hours" → "from the last hour". "Use it" table: drop the `strict` row; `hide`/`show` row adds "Each says so in a toast."; add a row `/waypoints prune` — "Deletes old data files in `~/.claude/mods-data/waypoints/`: other chats' goals that finished over an hour ago, and files untouched for a day. It deletes them straight away, with no dialog: typing the command is the confirmation. Never this chat's file or a running goal's. Past 100 files the pane reminds you." The note under the table: "For `auto`, anything but `off` turns it on." In "When Claude plans", add one sentence that a `/goal` refuses file edits until Claude has planned (so the behaviour stays documented without the option). New section at the top of the history, `## What changed in 2.1.0`: hide/show toasts; help row shows `auto`'s state; other chats cover an hour; `/waypoints prune` and the 100-file note; and the one line "A `/goal` now always plans before Claude edits files; the `strict` option is gone."
- [ ] **Step 2: DESIGN.md.** The pane mock (:152) shows the new help row; :166 says the row shows `auto`'s state and the commands; Settings (:243) drops `strict` from the command list; :269 keeps `strictDeny()` (the function name stays, it is code). Add a short section `## Pruning (2.1.0)` with: `$.fs` has no delete, so prune runs the host delete through `$.process.run` with an argv (no shell): `cmd /d /c del /f /q` on Windows, `rm -f --` elsewhere, and refuses a Windows path with a cmd metacharacter; the person chose this over the Bash tool and its dialog; the rules of `pickPrunable`; why every path is its own argv entry and the count is the files actually gone; the 24 h link to `restore()`; Task 1's live result.
- [ ] **Step 3:** `plugin.json` version `2.1.0`; `SETUP.md` waypoints row `2.1.0`.
- [ ] **Step 4:** `grep -rn -i strict waypoints/README.md waypoints/DESIGN.md`. Expected: README has only the 2.1.0 history line; DESIGN only the `strictDeny()` code name in "Left alone on purpose". (Recording Mode's own `rec.strict` in the code is unrelated and stays.)
- [ ] **Step 5:** Commit `waypoints 2.1.0: docs and version`.

### Task 7: Verify, PR, release

- [ ] **Step 1:** `claude plugin test waypoints` → all pass, 0 fail; `claude plugin validate waypoints` (or the repo's usual validation) → no errors.
- [ ] **Step 2:** `git push -u origin waypoints-options`; `gh pr create --title "waypoints 2.1.0: the options revamp" --body-file <notes>` (body: the spec table, Task 1's live probe result, test count; ending with the session's PR attribution line). Tell the person the PR is ready to merge.
- [ ] **Step 3 (after the person says "merged"):** release per the 2.0.3 recipe: `git checkout master && git pull`; `git tag waypoints-v2.1.0 <full 40-char merge SHA>`; `git push origin waypoints-v2.1.0`; `gh release create waypoints-v2.1.0 --verify-tag --title "waypoints 2.1.0: clearer options, prune" --notes-file <file> --latest` (notes: `## waypoints 2.1.0`, bold lead sentence, short explanation, `### Update` with `claude plugin marketplace update afterever-mods` and `claude plugin update waypoints@afterever-mods`, "Restart Claude Code to apply."). Then run both update commands.
- [ ] **Step 4: Live check** (the person, after restart): run a plan; `/waypoints` shows `auto: on · …` as the last row; `/waypoints hide` and `show` toast; `/goal <something>` refuses an edit before its plan; `/waypoints prune` toasts `Pruned N old files` with no dialog and `ls ~/.claude/mods-data/waypoints | wc -l` drops by that number.
