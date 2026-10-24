# Arsenal 0.4.0: Sound Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arsenal gets a built-in chime: a Sound notifications switch and a Sound picker in SETTINGS, a sound when a reply finishes and when Claude asks something, and sounds from a folder the person fills.

**Architecture:** A new pure module `hooks/chime.ts` (sound list, player command line, store read, `/chime` parser) is tested alone. `hooks/register.tsx` gains the `/chime` command, the state and store mirror, three event hooks (`turn.complete`, `tool.call` for `AskUserQuestion`, `classic.Notification`) and two SETTINGS rows. `hooks/menu.ts` stops tying SETTINGS and the launcher to prompt-upgrade.

**Tech Stack:** TypeScript/TSX Claude Code mod, the engine's test kit (`claude-code/testing`), run with `claude plugin test arsenal`.

**Spec:** `arsenal/DESIGN.md`, section "0.4.0: sound notifications" (committed on branch `arsenal-0.4.0`).

## Global Constraints

- Branch `arsenal-0.4.0`; version `0.4.0` in `arsenal/.claude-plugin/plugin.json`. A new mod version goes through a PR (repo `CLAUDE.md`).
- **Default is off.** Nothing plays for a subagent's turn (`e.agentId` set) or a stopped turn (`e.isAborted`).
- Sounds are `.wav` only. The Apple sounds are never added to the repo.
- Every sound is fire and forget: `void (async () => { … })().catch(() => {})`. No hook awaits playback.
- The sounds folder is `<home>/.claude/arsenal/sounds/`; home is `USERPROFILE`, else `HOME` (as `scan` does). The file `question.wav` there is the question sound and is left out of the picker.
- The code is written fresh; nothing is pasted from angomedia's done-chime. The credit line, verbatim: `Sound notifications idea from https://github.com/angomedia/claude-mods.` It goes in `README.md`, the marketplace entry and the header comment of `hooks/chime.ts`. No `THIRD-PARTY` file.
- Tests must pass on Linux (CI is `ubuntu-latest`): no test may depend on the OS it runs on. Take `os` as an argument; the fake disk in `render.test.ts` is keyed by `C:/…` paths.
- Existing behaviour stays: the 96 existing tests keep passing, except those the plan names as changed.

## Review Focus

- A sound path with an apostrophe (`C:\Users\O'Brien\…`): the PowerShell string must double it, never break out of the quotes. Pinned in Task 1.
- The sounds folder missing, empty, or holding only non-`.wav` files: the picker lists the system sounds, nothing throws. Task 2.
- The saved sound was deleted since: the default plays and the row shows the default's name. Task 1 (`chosen`) and Task 3.
- `$.store` holds garbage (`'x'`, `null`, `{ isOn: 'yes' }`): the chime is off. Task 1.
- A player that never returns (a hung PowerShell): the turn still completes at once. Task 4.
- `/chime sound nope`: says the names there are and changes nothing. Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `arsenal/hooks/chime.ts` (new) | Pure: the sound list, the default, the picker's next name, `playerFor`, store read/write, the `/chime` parser, wording. No engine calls. |
| `arsenal/hooks/chime.test.ts` (new) | Unit tests of `chime.ts`. |
| `arsenal/hooks/menu.ts` | Settings lines and `paneRows` learn the chime; `hasRows` / `hasSettings` go. |
| `arsenal/hooks/register.tsx` | `/chime`, state, store, the three event hooks, the two rows. |
| `arsenal/hooks/render.test.ts` | The world gains a player log, the sounds folder and the three events. |
| `arsenal/types/index.d.ts` | `ArsenalChime`, two state keys. |
| `arsenal/README.md`, `SETUP.md`, `README.md` (root), `.claude-plugin/marketplace.json`, `arsenal/.claude-plugin/plugin.json`, `arsenal/DESIGN.md` | Task 5. |

---

### Task 1: The pure chime module

**Files:**
- Create: `arsenal/hooks/chime.ts`, `arsenal/hooks/chime.test.ts`
- Modify: `arsenal/types/index.d.ts`

**Interfaces:**
- Produces (all exported from `chime.ts`; `ArsenalChime` from `types/index.d.ts`):
  - `type ArsenalChime = { isOn: boolean; sound: string }` (`sound: ''` means the default)
  - `type Os = 'windows' | 'mac' | 'linux'`; `type Sound = { name: string; path: string }`; `type Sounds = { personal: Sound[]; system: Sound[] }`
  - `const NO_CHIME: ArsenalChime` = `{ isOn: false, sound: '' }`; `const CHIME_STORE_KEY = 'chime'`
  - `osFrom(windowsEnv: string | undefined, home: string): Os`: `'Windows_NT'` is windows; else a `home` starting `/Users/` is mac; else linux
  - `soundsFolder(home: string): string` → `` `${home}/.claude/arsenal/sounds` ``
  - `systemCandidates(os: Os): Sound[]` (Windows: the five `C:/Windows/Media/<name>.wav` of the design, in the order of the design; macOS: `Glass`, `Ping`, `Pop`, `Hero`, `Tink` from `/System/Library/Sounds/<name>.aiff`; Linux: `[]`). The caller keeps those found on disk.
  - `questionFallback(os: Os): string`: `'Windows Message Nudge'` on windows, `'Ping'` on mac, `''` on linux
  - `personalSounds(fileNames: readonly string[], folder: string): Sound[]`: `*.wav` (any case), name without the extension, `question` left out, sorted by name
  - `questionPath(fileNames: readonly string[], folder: string, system: Sound[], os: Os): string | undefined`: `<folder>/question.wav` if listed, else the path of the system sound named `questionFallback(os)`, else undefined
  - `listOf(s: Sounds): Sound[]` = `[...personal, ...system]`
  - `chosen(s: Sounds, name: string): Sound | undefined`: the sound called `name`, else `s.system[0]`, else `s.personal[0]`, else undefined
  - `nextName(s: Sounds, name: string): string`: the name after `chosen(s, name)` in `listOf(s)`, wrapping; `''` for an empty list
  - `playerFor(path: string, os: Os): string[] | null`: see below
  - `chimeFromStore(raw: unknown): ArsenalChime`; `chimeToStore(c: ArsenalChime): { version: 1; isOn: boolean; sound: string }`
  - `type ChimeCommand = { kind: 'show' | 'on' | 'off' | 'test' | 'help' } | { kind: 'sound'; name: string }`; `parseChime(args: string): ChimeCommand`
  - `CHIME_HELP: string`; `describeChime(c: ArsenalChime, shownName: string, names: readonly string[]): string`

- [ ] **Step 1: Write the failing tests** in `chime.test.ts` (same `test`/`expect` import style as `own.test.ts`). Names and assertions:
  - `playerFor windows` → `['powershell','-NoProfile','-NonInteractive','-Command',"(New-Object System.Media.SoundPlayer 'C:/a/b.wav').PlaySync()"]`; with path `C:/Users/O'Brien/x.wav` the string holds `O''Brien`; `playerFor('/x.aiff','mac')` → `['afplay','/x.aiff']`; `playerFor('/x.wav','linux')` → `null`.
  - `osFrom('Windows_NT','')` → `windows`; `osFrom(undefined,'/Users/me')` → `mac`; `osFrom(undefined,'/home/me')` → `linux`.
  - `personalSounds(['b.WAV','a.wav','question.wav','notes.txt','c.mp3'], 'F')` → names `['a','b']`, paths `F/a.wav`, `F/b.WAV`.
  - `questionPath` prefers `question.wav` in the folder; else the system sound named by `questionFallback`; else `undefined`.
  - `chosen`: a known name wins; an unknown or `''` gives `system[0]`; no system sounds gives `personal[0]`; nothing gives `undefined`.
  - `nextName` goes down `listOf` (personal first), wraps at the end, and from an unknown name starts after the default; `''` for an empty list.
  - `chimeFromStore`: `undefined`, `null`, `'x'`, `{ isOn: 'yes' }` → `NO_CHIME`; `{ version:1, isOn:true, sound:'Ping' }` → `{ isOn:true, sound:'Ping' }`; `chimeToStore` round-trips.
  - `parseChime`: `''` → show; `' ON '` → on; `off`; `test`; `'sound Windows Ding'` → `{kind:'sound', name:'Windows Ding'}`; `'sound'` and `'banana'` → help.
  - `describeChime` names on/off, the shown sound, and lists the names.
- [ ] **Step 2: Run** `claude plugin test arsenal` — expect FAIL (`chime` module not found).
- [ ] **Step 3: Implement `chime.ts` and the `ArsenalChime` type.** The header comment carries the credit line verbatim and says the code is written fresh. Windows candidates, in order: `Windows Notify Messaging`, `Windows Notify System Generic`, `Windows Message Nudge`, `Windows Ding`, `Windows Background`. Style: as `own.ts` (pure, JSDoc on exports).
- [ ] **Step 4: Run** `claude plugin test arsenal` — expect all pass (96 existing + new).
- [ ] **Step 5: Commit**
```bash
git add arsenal/hooks/chime.ts arsenal/hooks/chime.test.ts arsenal/types/index.d.ts
git commit -m "arsenal: the chime's pure module (sounds, player, store, /chime parser)"
```

---

### Task 2: State, store and the `/chime` command

**Files:**
- Modify: `arsenal/hooks/register.tsx`, `arsenal/types/index.d.ts`, `arsenal/hooks/render.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces (in `register.tsx`):
  - atoms `chimeAtom` (`NO_CHIME`) and `soundsAtom` (`[] as string[]`) under `plugin: 'arsenal'`; state keys `chime: ArsenalChime` and `sounds: string[]` added to `PluginState['arsenal']`
  - `async function soundsOf($: EngineInterface): Promise<{ sounds: Sounds; os: Os; folder: string; fileNames: string[] }>`: home as `scan` finds it; lists the folder with `entriesOf`; keeps the system candidates for which `$.fs.exists(path)` is true
  - `async function setChime($: EngineInterface, next: ArsenalChime): Promise<void>`: writes state, then `$.store.set(CHIME_STORE_KEY, chimeToStore(next))`; a failed save is `$.ui.toast('Could not save the chime setting.')`
  - `async function playPath($: EngineInterface, path: string | undefined): Promise<void>`: `playerFor`, then `$.process.run(argv, { timeoutMs: 15000 })` inside a `try`; silent on any failure or `null`
  - `const quiet = ($: EngineInterface, run: () => Promise<void>) => void`: `void run().catch(() => {})` (the fire-and-forget wrapper)

- [ ] **Step 1: Extend the test `world`** (`render.test.ts`): `Opts.chime?: { files?: string[] }` is not needed; use `disk` for the folder (`C:/home/.claude/arsenal/sounds/x.wav` keys) and `store` for `chime`. Add `World.played: string[][]` (every `process.run` whose `argv[0]` is `powershell` or `afplay` is pushed there and answered `exitCode: 0`; other argv keep today's git answers); answer `env.get` for `OS` with `'Windows_NT'`; add `on('fs.exists', …)` answering true for the Windows Media paths and for `disk` keys.
- [ ] **Step 2: Write the failing tests:**
  - `/chime registered to run mid-turn`: `w.registered` contains `chime` (update the existing `/arsenal` test to `['arsenal','chime']`).
  - `/chime on` then `/chime off`: `$.command.run({ command: 'chime', args })` sets `w.store.chime` to `{ version: 1, isOn: true, sound: '' }` then `isOn: false`.
  - `a session loads the saved chime`: `store: { chime: { version: 1, isOn: true, sound: 'Windows Ding' } }` and `/chime` (no args) answers text containing `Windows Ding`.
  - `/chime sound Windows Ding` saves it and plays one `powershell` call whose last argument contains `Windows Ding.wav`; `/chime sound nope` saves nothing, plays nothing, and the text lists `Windows Ding`.
  - `/chime test` plays the chosen sound even when the chime is off.
  - `a sounds folder with a.wav, question.wav, notes.txt` lists `a` among the names `/chime` shows, and not `question` or `notes`.
  - `the chime is off with garbage in the store`: `store: { chime: 'x' }` → `/chime` says off.
- [ ] **Step 3: Run** `claude plugin test arsenal` — expect the new tests FAIL.
- [ ] **Step 4: Implement** the atoms, helpers above, `loadChime`/`listSounds` calls in `session.start` (after `loadOff`), the `/chime` registration (`immediate: true`, description `Sound notifications: on, off, test, or pick a sound`) and an `on('command.run', { command: 'chime' }, …)` hook using `parseChime`. Matching `sound <name>` against `listOf(sounds)` is case-insensitive and saves the list's own spelling. Wrap like the `/arsenal` hook (`.catch(() => ({ text: … }))`). The sounds are listed again whenever the command runs and in `openMenu`.
- [ ] **Step 5: Run** `claude plugin test arsenal` — expect all pass.
- [ ] **Step 6: Commit** `arsenal: /chime, and the chime's state kept in $.store`

---

### Task 3: The SETTINGS rows and an always-drawn menu

**Files:**
- Modify: `arsenal/hooks/menu.ts`, `arsenal/hooks/menu.test.ts`, `arsenal/hooks/register.tsx`, `arsenal/hooks/render.test.ts`

**Interfaces:**
- Consumes: `chimeAtom`, `soundsAtom`, `setChime`, `soundsOf`, `playPath`, `chosen`, `nextName` (Tasks 1–2).
- Produces (in `menu.ts`):
  - `hasPromptUpgrade(tools: ArsenalTools): boolean` (replaces `hasSettings`; `hasRows` is removed)
  - `settingsLines(tools: ArsenalTools, chime: ArsenalChime): number`: 1 (title) + 2 if prompt-upgrade + 2 (switch and its description) + 1 if the chime is on
  - `paneRows` gains a last parameter `chime: ArsenalChime = NO_CHIME` and uses `settingsLines` instead of `(hasSettings ? 3 : 0)`
  - SETTINGS wording: switch name `Sound notifications`, description `  reply done · asked a question`; Sound row label `♪ Sound`
  - Button keys `arsenal-chime-switch` (hotkey `c`) and `arsenal-chime-sound` (hotkey `o`)

- [ ] **Step 1: Update `menu.test.ts`** (the `hasRows` / `hasSettings` tests become `hasPromptUpgrade`; `paneRows` still returns ≥ 14) and add: `settingsLines` is 3 with no tools and the chime off, 4 when on, 6 with prompt-upgrade and the chime on.
- [ ] **Step 2: Write the failing render tests:**
  - `SETTINGS and the launcher draw with neither tool installed` (`commands: ['model']`): the footer has `arsenal-toggle`; the pane has `── S E T T I N G S`, `Sound notifications`, and no `Prompt Upgrade`.
  - `the switch's pill follows the chime`: starts `○ Off`; `ui.press({ key: 'arsenal-chime-switch' })` makes the store `isOn: true` and the pill `● On`; again → off.
  - `the Sound row is shown only while the chime is on`: absent when off; present when on, showing the default's name (`Windows Notify Messaging`).
  - `a press on Sound saves the next sound and plays it`: store `sound` becomes the next name, one player call logged.
  - `a deleted saved sound shows the default's name`: `store.chime.sound = 'gone'` → the row says `Windows Notify Messaging`.
- [ ] **Step 3: Run** — expect FAIL.
- [ ] **Step 4: Implement.** Menu changes as above. In `register.tsx`: drop the `hasRows` guards in `toggleMenu` and the `SessionMode` hook (the launcher always draws); draw the Prompt Upgrade row under `hasPromptUpgrade`; add the two rows after it. **Deviation from DESIGN, noted in Task 5:** the switch calls `setChime($, { …chime, isOn: !isOn })` directly instead of `press($, 'chime', …)`, because `$.command.run` queues until the session is idle and the toggle must not wait for a turn. The `/chime on|off` command and the switch share `setChime`. The Sound press computes `nextName`, saves with `setChime`, then plays the new `chosen` path. The pane reads `chimeAtom` and `soundsAtom` while drawing, so it redraws.
- [ ] **Step 5: Run** — expect all pass.
- [ ] **Step 6: Commit** `arsenal: Sound notifications and Sound rows in SETTINGS`

---

### Task 4: The three events

**Files:**
- Modify: `arsenal/hooks/register.tsx`, `arsenal/hooks/render.test.ts`

**Interfaces:**
- Consumes: `chimeAtom`, `soundsOf`, `chosen`, `questionPath`, `playPath`, `quiet`.
- Produces: `async function sound($: EngineInterface, kind: 'reply' | 'question'): Promise<void>`: reads the chime from state; returns at once if off; `reply` plays `chosen(sounds, chime.sound)?.path`, `question` plays `questionPath(...)`.

- [ ] **Step 1: Extend `world`:** base hooks `turn.complete` (`async (_$, e) => ({ text: e.answer })`), `tool.call` (`async () => ({ result: 'ok', ref: 0, text: 'ok' })`), `classic.Notification` (`async () => ({})`); an `Opts.hangs?: boolean` that makes the player's `process.run` never resolve.
- [ ] **Step 2: Write the failing tests** (chime on via `store`; `DONE = { answer: 'x', durationMs: 1, isAborted: false, reason: 'answer' as const }`; `await $.turn.complete({ ...DONE, turnId: 't1' })`; `await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as any)`; `await $.classic.Notification({ notification_type: 'permission_prompt', message: 'ok?' } as any)`):
  - `a finished reply plays the picked sound once`; `with the chime off nothing plays`.
  - `a subagent's turn and an aborted turn play nothing` (`agentId: 'a1'`; `isAborted: true`).
  - `AskUserQuestion plays the question sound`: the path ends `Windows Message Nudge.wav`; with `question.wav` in the folder it ends `question.wav`.
  - `a permission prompt plays the question sound once`; `another notification_type plays nothing`.
  - `a player that never returns does not hold the turn`: `hangs: true`, and `$.turn.complete` still resolves.
- [ ] **Step 3: Run** — expect FAIL.
- [ ] **Step 4: Implement** `sound` and the hooks, each calling `next` first (turn.complete, Notification) or immediately after starting the sound (`tool.call` filtered `{ tool: 'AskUserQuestion' }`, which returns `next(e)`), and the sound always through `quiet`. Gate on `!e.agentId && !e.isAborted` for `turn.complete`, and on `e.notification_type === 'permission_prompt'` for `classic.Notification`.
- [ ] **Step 5: Run** `claude plugin test arsenal` and `claude plugin validate arsenal` — expect pass.
- [ ] **Step 6: Commit** `arsenal: sound on a finished reply, a question and a permission prompt`

---

### Task 5: Docs, manifests and the credit

**Files:**
- Modify: `arsenal/README.md`, `SETUP.md`, `README.md` (root), `.claude-plugin/marketplace.json`, `arsenal/.claude-plugin/plugin.json`, `arsenal/DESIGN.md`

- [ ] **Step 1: `plugin.json`:** version `0.4.0`; description's last sentence becomes `A remote control for the tools, with one thing of its own: a sound-notification switch and picker.` Copy that description into the marketplace entry and end it with `Sound notifications idea from https://github.com/angomedia/claude-mods.` after the existing `Idea from https://tristenobrien.ai/.`
- [ ] **Step 2: `arsenal/README.md`:** add the two rows to the SETTINGS drawing and "The rows" table; a "Sound notifications" section (what plays when, default off, `/chime` forms, the sounds folder, how to bring Apple's sounds in with `afconvert -f WAVE -d LEI16 in.caf out.wav` and the two source folders from DESIGN, `.wav` only, the fixed question sound and `question.wav`); change "Which rows show" and the "remote control" bullet to the new truth (the menu always shows; one thing of its own); the "keeps one thing between sessions" bullet gains the chime setting; "Develop" names `chime.ts`; extend the Credit blockquote with `Sound notifications idea from [angomedia/claude-mods](https://github.com/angomedia/claude-mods).` and that the code is written fresh.
- [ ] **Step 3: `SETUP.md`:** the glance row and the arsenal section (version 0.4.0, "Written against 0.4.0", the first bullet no longer says it needs a tool, the remote-control bullet, the credit). **Root `README.md`:** the arsenal table row (drop "Shows rows when …", add the chime and credit).
- [ ] **Step 4: `arsenal/DESIGN.md`:** amend the Principles bullet "A remote control, not an owner" with the chime exception; in the 0.4.0 section replace the switch line with "calls `setChime` directly, as `/chime on|off` do, because `$.command.run` queues until idle" and add a "What building changed" list if anything else moved.
- [ ] **Step 5: Run** `claude plugin validate . --strict` from the repo root and `claude plugin test arsenal` — expect pass.
- [ ] **Step 6: Commit** `arsenal 0.4.0: docs, manifests and the credit to angomedia`

---

### Task 6: Release

**Files:** none (git and GitHub).

- [ ] **Step 1: Live check on the home PC** with `claude --plugin-dir C:\github\claude-mods\arsenal` (the person runs it; the list is in DESIGN "Testing": switch and Sound row, reply/question/permission sounds, a dropped-in `.wav`, Desktop, subagent and stopped turn silent). Record what was seen under "Verified" in the 0.4.0 section.
- [ ] **Step 2: Push the branch, open the PR** ("arsenal 0.4.0: sound notifications"; body ends with the generated-with line), wait for CI to pass.
- [ ] **Step 3: Squash-merge, tag `arsenal-v0.4.0`** (check the existing tag spelling with `git tag | grep arsenal` first), publish the release, then `claude plugin marketplace update afterever-mods` and `claude plugin update arsenal@afterever-mods` — as repo `CLAUDE.md` says, without asking once CI is green.
