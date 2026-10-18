# Waypoints 2.1.0: Options Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/waypoints`' options few and clear: `strict` gone (always on), `hide`/`show` confirm with a toast, the pane's help row shows state, "Other chats" covers 1 hour, and old data files can be pruned.

**Architecture:** All behaviour stays in `waypoints/hooks/register.mjs` (hooks, commands) and `draw.mjs` (the pane). The new pruning rules and the shell command are pure functions in a new `prune.mjs`, so they are tested without the engine. Deleting goes through Claude Code's own `Bash`/`PowerShell` tool via `$.tool.call`, because the mod API's `$.fs` has no delete; the person approves the exact command in the normal permission dialog.

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
| `/waypoints prune` | **New.** Deletes old data files through the Bash (else PowerShell) tool, with the permission dialog |

- Strict is always on: in a running `/goal` with no plan yet, the main agent's `Edit`, `Write`, `NotebookEdit`, `MultiEdit` calls are refused. It steps aside when the plan tool failed to register (`toolFailed`). A saved `settings.strict` from 2.0 is ignored.
- "Other chats" lists the last **1 hour** (was 12 hours).
- The pane's last row is one line with state. When the data folder holds more than 100 `.json` files, one more dim row above it gives the count, the full folder path, and `/waypoints prune`.
- Docs: the word `strict` leaves the README and DESIGN.md except one line in "What changed in 2.1.0". Old `test-runs/*.md` files stay as they are (they record past tests).

## Global Constraints

- Version `2.1.0` in `waypoints/.claude-plugin/plugin.json` and in the `waypoints` row of `SETUP.md`.
- Toast copy, exact: `Waypoints band hidden · /waypoints show brings it back`, `Waypoints band shown`, `Pruned N old files` (`Pruned 1 old file` for one), `Nothing to prune`, `Prune did not run: <reason>`, `No shell tool to prune with; delete old files in <dir>`. `/waypoints` in these is `/${commandName}` (it can be `/waypoints-mod`).
- Help row copy, exact: `auto: on · /waypoints hide|show · clear (stop the goal) · look & pane: /config → Waypoints` (`auto: off` when off).
- File note copy, exact: `<N> old files in <dir> · /waypoints prune, or delete them while no plan is running`, shown only when N > 100.
- Empty "Other chats" copy, exact: `No other chat has a goal in the last hour.`
- Prune never deletes this chat's file, never a running goal's file touched in the last 24 hours, and lists every file by full path (no wildcards). At most 200 files per run (my call).
- Git: branch `waypoints-options`, PR to `master`; the person merges (auto mode blocks `gh pr merge`).
- Shell gotcha on this PC: never call `python3` (a Store stub that hangs 2 minutes).

## Review Focus

1. **A file another chat is writing right now** fails to parse. Expect: prune keeps it unless it is older than 1 hour. Test in Task 4 (`unreadable fresh file is kept`).
2. **The person refuses the permission dialog** (or auto mode denies it). Expect: a `Prune did not run: …` toast, nothing reported as pruned. Test in Task 5.
3. **A path with a quote or a space** (e.g. a Windows user folder `C:\Users\O'Brien`). Expect: the command still names exactly that file. Test in Task 4 (quoting).
4. **No shell tool in the session** (neither Bash nor PowerShell listed). Expect: a toast naming the folder, no call. Test in Task 5.
5. **A plan Claude starts without `/goal`** while strict is always on. Expect: edits are never blocked. Test in Task 2.

---

### Task 0: Branch

- [ ] **Step 1:** `cd C:\github\claude-mods && git checkout master && git pull && git checkout -b waypoints-options`. Expected: `Switched to a new branch 'waypoints-options'`.
- [ ] **Step 2:** `git add docs/superpowers/plans/2026-10-18-waypoints-options.md && git commit -m "waypoints plan: the 2.1.0 options revamp"` (attribution lines per the session's reminder).

### Task 1: Live probe of `$.tool.call` with Bash from a mod (throwaway)

No mod in this repo has called a built-in tool. Prove it before building on it.

**Files:** a throwaway dev mod under `C:\Users\wenha\.claude\dev-mods\` (via the `plugin-authoring` skill's own throwaway-mod flow). Nothing in the repo.

- [ ] **Step 1:** Make a probe mod with one command `/prune-probe` whose `command.run` hook does: `const names = (await $.tool.list()).map((t) => t.name)`; `const r = await $.tool.call({ tool: names.includes('Bash') ? 'Bash' : 'PowerShell', command: 'echo waypoints-probe', description: 'Waypoints prune probe' })`; `$.ui.toast(JSON.stringify({ has: names.filter((n) => n === 'Bash' || n === 'PowerShell'), deny: r.deny, isError: r.isError, text: String(r.text || '').slice(0, 60) }))`.
- [ ] **Step 2:** Ask the person to run `/prune-probe` in a terminal session (default permission mode). Expected: a permission dialog for `echo waypoints-probe` appears; after "Yes", the toast shows `text` containing `waypoints-probe`. Ask them to run it once more and refuse: the toast shows `deny` or `isError` with a reason.
- [ ] **Step 3:** Record the exact result shapes seen (allowed and refused) in the PR description's notes. **If the call rejects or no dialog appears, stop and bring it to the person**: Tasks 4–5's prune part changes, the pane note (Task 3) still ships.
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
  `export function deleteCommand(shell: 'Bash' | 'PowerShell', paths: string[]): string`.

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

test('the delete command names every file, quoted for its shell', async () => {
  const p = ["C:\\Users\\O'Brien/.claude/mods-data/waypoints/a.json", 'C:\\Users\\O\'Brien/.claude/mods-data/waypoints/b c.json']
  expect(deleteCommand('Bash', p)).toBe("rm -f -- 'C:/Users/O'\\''Brien/.claude/mods-data/waypoints/a.json' 'C:/Users/O'\\''Brien/.claude/mods-data/waypoints/b c.json'")
  expect(deleteCommand('PowerShell', p)).toBe("Remove-Item -LiteralPath 'C:\\Users\\O''Brien/.claude/mods-data/waypoints/a.json','C:\\Users\\O''Brien/.claude/mods-data/waypoints/b c.json' -Force")
})
```

- [ ] **Step 2:** `claude plugin test waypoints`. Expected: these four FAIL (`pickPrunable`/`deleteCommand` not exported).
- [ ] **Step 3: Implement** both in `prune.mjs`. Bash turns `\` into `/` (Git Bash takes `C:/…`) and quotes with `'…'`, a `'` becoming `'\''`; PowerShell keeps the path and doubles `'`.
- [ ] **Step 4:** Run; expected all pass.
- [ ] **Step 5:** Commit `waypoints: what prune deletes and the command that deletes it`.

### Task 5: The `/waypoints prune` command

**Files:**
- Modify: `waypoints/hooks/register.mjs` (`command.run` handler :479-510, `registerCommand` spec :180)
- Test: `waypoints/hooks/flow.test.ts`

**Interfaces:**
- Consumes: `pickPrunable`, `deleteCommand`, `shownPath`, `OTHERS_MS` from Task 3–4; `loadOthers($)`.
- Produces: `async function prune($): Promise<string>` in `register.mjs`, returning the toast text. In `command.run`: `if (key === 'prune') { const msg = await prune($); if (!(await $.session.surface())) return { text: msg }; $.ui.toast(msg); return {} }`.

`prune($)`: `$.fs.list(home + DIR)`; for each `.json` file entry read and `JSON.parse` it (`null` on any failure); `pickPrunable(…, { now, self: sessionId + '.json' })`; none → `Nothing to prune`. Shell: `Bash` if `$.tool.list()` names it, else `PowerShell`, else return `No shell tool to prune with; delete old files in ${shownPath(home + DIR)}`. Call `$.tool.call({ tool: shell, command: deleteCommand(shell, paths), description: `Delete ${n} old Waypoints files` })` (no `consent`: the person decides in the dialog). A rejection, `r.deny` or `r.isError` → `Prune did not run: ${clip(r.deny || r.text || err.message, 80)}`. Else `Pruned ${n} old files`. Afterwards `await loadOthers($)` and `$.ui.invalidate('ui.render')`. Adjust to the result shapes Task 1 recorded.

- [ ] **Step 1: Write the failing tests.** Extend `world()` options with `files?: { name: string, mtimeMs: number, body: string }[]` and `tools?: string[]` (default `['Bash']`) and `shell?: (e) => any`; mock `fs.list` to return `files` as `{ name, kind: 'file', size: 1, mtimeMs, isLink: false }`, `fs.read` to return the matching `body` by `e.path` ending, `tool.list` to return `tools.map((name) => ({ name, description: '', mcp: false }))`, and record calls to the base `tool.call` for `e.tool` `Bash`/`PowerShell` in `w.shell`, answering with `o.shell?.(e) ?? { result: '', text: '' }`.

```ts
const finished = (h: number) => JSON.stringify({ status: 'met', endedAt: NOW - h * H, tasks: [] })
const DIR = 'C:/Users/bats/.claude/mods-data/waypoints/'

test('/waypoints prune deletes old finished files through Bash, by full path', async ($, on) => {
  const w = world(on, { files: [
    { name: 'sess-1.json', mtimeMs: NOW - 30 * H, body: finished(30) },
    { name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) },
    { name: 'c.json', mtimeMs: NOW - 10 * MIN, body: finished(0.1) },
  ] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.shell.map((e: any) => [e.tool, e.command])).toEqual([['Bash', `rm -f -- '${DIR}a.json'`]])
  expect(w.toasts.at(-1)).toBe('Pruned 1 old file')
})

test('prune uses PowerShell where there is no Bash', async ($, on) => {
  const w = world(on, { tools: ['PowerShell'], files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.shell[0].tool).toBe('PowerShell')
  expect(w.shell[0].command).toMatch(/^Remove-Item -LiteralPath '.*a\.json' -Force$/)
})

test('a refused prune says it did not run', async ($, on) => {
  const w = world(on, { files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }], shell: () => ({ result: '', text: 'The user doesn\'t want to proceed', isError: true }) })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.toasts.at(-1)).toMatch(/^Prune did not run: /)
})

test('with nothing old prune runs no command', async ($, on) => {
  const w = world(on, { files: [{ name: 'c.json', mtimeMs: NOW - 10 * MIN, body: finished(0.1) }] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.shell).toEqual([])
  expect(w.toasts.at(-1)).toBe('Nothing to prune')
})

test('without a shell tool prune names the folder to clean by hand, as Windows writes it', async ($, on) => {
  const w = world(on, { home: 'C:\\Users\\bats', tools: [], files: [{ name: 'a.json', mtimeMs: NOW - 3 * H, body: finished(3) }] })
  await start($)
  await $.command.run({ command: 'waypoints', args: 'prune' } as any)
  expect(w.toasts.at(-1)).toBe('No shell tool to prune with; delete old files in C:\\Users\\bats\\.claude\\mods-data\\waypoints\\')
})
```

(`world()` also takes `home?: string`, default `'C:/Users/bats'`, passed to `mock.env` as `USERPROFILE`.)

- [ ] **Step 2:** `claude plugin test waypoints`. Expected: these five FAIL (`prune` opens the pane today).
- [ ] **Step 3: Implement** `prune($)` and the branch. Spec at :180 becomes: description ``Waypoints: this chat's goal task list and every chat's goal (/waypoints hide|show|auto on|off|clear|prune)``, `argumentHint: '[hide|show|auto on|off|clear|prune]'`.
- [ ] **Step 4:** `claude plugin test waypoints`. Expected: all pass (84 before this plan, plus the new ones).
- [ ] **Step 5:** Commit `waypoints: /waypoints prune deletes old data files through the shell tool`.

### Task 6: Docs and version

**Files:** `waypoints/README.md`, `waypoints/DESIGN.md`, `waypoints/.claude-plugin/plugin.json`, `SETUP.md`

- [ ] **Step 1: README.** Line 13: "from the last 12 hours" → "from the last hour". "Use it" table: drop the `strict` row; `hide`/`show` row adds "Each says so in a toast."; add a row `/waypoints prune` — "Deletes old data files in `~/.claude/mods-data/waypoints/`: other chats' goals that finished over an hour ago, and files untouched for a day. It runs Claude Code's Bash (or PowerShell) tool, so you see and approve the exact command. Never this chat's file or a running goal's. Past 100 files the pane reminds you." The note under the table: "For `auto`, anything but `off` turns it on." In "When Claude plans", add one sentence that a `/goal` refuses file edits until Claude has planned (so the behaviour stays documented without the option). New section at the top of the history, `## What changed in 2.1.0`: hide/show toasts; help row shows `auto`'s state; other chats cover an hour; `/waypoints prune` and the 100-file note; and the one line "A `/goal` now always plans before Claude edits files; the `strict` option is gone."
- [ ] **Step 2: DESIGN.md.** The pane mock (:152) shows the new help row; :166 says the row shows `auto`'s state and the commands; Settings (:243) drops `strict` from the command list; :269 keeps `strictDeny()` (the function name stays, it is code). Add a short section `## Pruning (2.1.0)` with: `$.fs` has no delete, so prune borrows the Bash/PowerShell tool through `$.tool.call` and its permission dialog; the rules of `pickPrunable`; why every path is listed; the 24 h link to `restore()`; Task 1's live result.
- [ ] **Step 3:** `plugin.json` version `2.1.0`; `SETUP.md` waypoints row `2.1.0`.
- [ ] **Step 4:** `grep -rn -i strict waypoints/README.md waypoints/DESIGN.md`. Expected: README has only the 2.1.0 history line; DESIGN only the `strictDeny()` code name in "Left alone on purpose". (Recording Mode's own `rec.strict` in the code is unrelated and stays.)
- [ ] **Step 5:** Commit `waypoints 2.1.0: docs and version`.

### Task 7: Verify, PR, release

- [ ] **Step 1:** `claude plugin test waypoints` → all pass, 0 fail; `claude plugin validate waypoints` (or the repo's usual validation) → no errors.
- [ ] **Step 2:** `git push -u origin waypoints-options`; `gh pr create --title "waypoints 2.1.0: the options revamp" --body-file <notes>` (body: the spec table, Task 1's live probe result, test count; ending with the session's PR attribution line). Tell the person the PR is ready to merge.
- [ ] **Step 3 (after the person says "merged"):** release per the 2.0.3 recipe: `git checkout master && git pull`; `git tag waypoints-v2.1.0 <full 40-char merge SHA>`; `git push origin waypoints-v2.1.0`; `gh release create waypoints-v2.1.0 --verify-tag --title "waypoints 2.1.0: clearer options, prune" --notes-file <file> --latest` (notes: `## waypoints 2.1.0`, bold lead sentence, short explanation, `### Update` with `claude plugin marketplace update afterever-mods` and `claude plugin update waypoints@afterever-mods`, "Restart Claude Code to apply."). Then run both update commands.
- [ ] **Step 4: Live check** (the person, after restart): run a plan; `/waypoints` shows `auto: on · …` as the last row; `/waypoints hide` and `show` toast; `/goal <something>` refuses an edit before its plan; `/waypoints prune` shows a permission dialog listing full paths, and after "Yes" the toast counts them and `ls ~/.claude/mods-data/waypoints | wc -l` drops by that number.
