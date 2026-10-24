import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ArsenalChime, ArsenalOff, ArsenalOwn, ArsenalTools } from '../types'
import {
  CHIME_HELP,
  CHIME_STORE_KEY,
  NO_CHIME,
  chimeFromStore,
  chimeToStore,
  chosen,
  describeChime,
  listOf,
  nextName,
  nextSent,
  osFrom,
  parseChime,
  personalSounds,
  playerFor,
  sentChoice,
  shouldPlaySent,
  soundsFolder,
  systemCandidates,
} from './chime'
import type { Os, Sound, Sounds } from './chime'
import {
  NO_OFF,
  NO_OWN,
  commandLine,
  draftNote,
  failedNote,
  flipped,
  hasPromptUpgrade,
  headerNote,
  launchColumns,
  launchItems,
  nameCells,
  offFor,
  ownRow,
  paneRows,
  ranNote,
  reconcile,
  runningFrom,
  sameRunning,
  sectionTitle,
  sentNote,
  shownRows,
  toolsFrom,
  unfilledNote,
  versionLine,
  withOff,
} from './menu'
import type { LaunchItem, Section } from './menu'
import { RELEASED, VERSION } from './version'
import { STORE_KEY, confirmed, offFromStore, offToStore, projectPlace, readCandidate, sameFolder, withoutUser } from './own'
import type { Candidate, Found, GitAnswers } from './own'

// What the drawings read lives in $.state. Of it only `off` is also kept, in
// $.store (a $.store read made while drawing does not subscribe the drawing, a
// $.state read does), and session.start (which also runs on a hot reload)
// reads isOpen from the panes
const isOpenAtom = atom({ plugin: 'arsenal', key: 'isOpen' } as const, false)
const runningAtom = atom({ plugin: 'arsenal', key: 'running' } as const, null)
const NO_TOOLS: ArsenalTools = { 'prompt-upgrade': false, 'work-report': false }
const toolsAtom = atom({ plugin: 'arsenal', key: 'tools' } as const, NO_TOOLS)
const noteAtom = atom({ plugin: 'arsenal', key: 'note' } as const, '')
const ownAtom = atom({ plugin: 'arsenal', key: 'own' } as const, NO_OWN)
const offAtom = atom({ plugin: 'arsenal', key: 'off' } as const, NO_OFF)
const editingAtom = atom({ plugin: 'arsenal', key: 'editing' } as const, null)
const projectKeyAtom = atom({ plugin: 'arsenal', key: 'projectKey' } as const, '')
const chimeAtom = atom({ plugin: 'arsenal', key: 'chime' } as const, NO_CHIME)

// The menu is a pane, docked at the right in fullscreen like the tools' own
const PANE = 'arsenal'
const PANE_COLUMNS = 48
const paneArgs = (rows: number) => ({ id: PANE, title: 'Arsenal', closeOnEscape: true, columns: PANE_COLUMNS, rows }) as const

const COLORS = {
  accent: '#F2A65A',
  teal: '#2EC4B6',
  off: '#3A404A',
  dark: '#0D1117',
  light: '#E6EDF3',
}

const plain = (err: unknown) => (err instanceof Error && err.message ? err.message : 'something went wrong')

// ── State helpers ────────────────────────────────────────────────────────

const say = ($: EngineInterface, text: string) => update($, noteAtom, () => text)

async function refreshTools($: EngineInterface) {
  try {
    const names = (await $.command.list()).map(c => c.name)
    await update($, toolsAtom, () => toolsFrom(names))
  } catch {
    // no rows is the quiet answer: the launcher is not drawn
  }
}

/** The model `/model` names, since the last request. Read as the menu opens. */
async function refreshModel($: EngineInterface) {
  try {
    const model = await $.session.model()
    await update($, runningAtom, r => {
      const next = reconcile(r ?? null, model)
      return sameRunning(r ?? null, next) ? (r ?? null) : next
    })
  } catch {
    // the header keeps what it had
  }
}

// ── The person's own commands ────────────────────────────────────────────

/** What `git rev-parse <args>` prints, first line; null when git says no, is missing or is slow. */
async function gitLine($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['git', 'rev-parse', ...args], { cwd, timeoutMs: 5000 })
    return r.exitCode === 0 ? (r.stdout.split(/\r?\n/)[0]?.trim() || null) : null
  } catch {
    return null
  }
}

/**
 * The repo's top level and shared `.git` folder, as seen from `root`. A git
 * older than 2.31 has no `--path-format`, so its answer is asked again without
 * it; `projectPlace` reads a relative one against `root`.
 */
async function askGit($: EngineInterface, root: string): Promise<GitAnswers> {
  const [top, absolute] = await Promise.all([
    gitLine($, root, ['--show-toplevel']),
    gitLine($, root, ['--path-format=absolute', '--git-common-dir']),
  ])
  return { top, common: absolute ?? (top ? await gitLine($, root, ['--git-common-dir']) : null) }
}

/** Every entry of a folder, or none when it is not there. */
const entriesOf = async ($: EngineInterface, path: string) => {
  try {
    return await $.fs.list(path)
  } catch {
    return []
  }
}

/**
 * What the files of one `.claude` folder say: `skills/<folder>/SKILL.md`, one
 * level down, and `commands/<file>.md`, at the top. A link is tried as well,
 * since the engine's list confirms what is really there. Commands in
 * subfolders (`dir:name`) are left out of 0.2.0.
 */
async function collect($: EngineInterface, base: string): Promise<Found[]> {
  const [skills, commands] = await Promise.all([entriesOf($, `${base}/skills`), entriesOf($, `${base}/commands`)])
  const files: { kind: Candidate['kind']; fallback: string; path: string }[] = [
    ...skills.filter(s => s.kind === 'dir' || s.isLink).map(s => ({ kind: 'skill' as const, fallback: s.name, path: `${base}/skills/${s.name}/SKILL.md` })),
    ...commands
      .filter(c => (c.kind === 'file' || c.isLink) && /\.md$/i.test(c.name))
      .map(c => ({ kind: 'command' as const, fallback: c.name.slice(0, -3), path: `${base}/commands/${c.name}` })),
  ]
  const read = await Promise.all(
    files.map(async f => {
      try {
        const text = await $.fs.read(f.path)
        return typeof text === 'string' ? readCandidate({ kind: f.kind, fallback: f.fallback, text }) : null
      } catch {
        return null
      }
    }),
  )
  return read.filter((f): f is Found => f !== null)
}

/**
 * Finds the person's own commands and the project they belong to. Run at
 * session start and each time the menu opens, so a skill added mid-session
 * shows up, and a `/cd` or worktree move takes PROJECT and its off list along.
 * A failure leaves what the last scan found.
 */
async function scan($: EngineInterface) {
  try {
    const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
    const root = await $.session.root()
    const place = projectPlace(root, await askGit($, root))
    const listed = await $.command.list()
    const user = home ? confirmed(await collect($, `${home}/.claude`), listed) : []
    // in the home folder, `.claude` is USER's own: there is no PROJECT
    const project = home && sameFolder(place.folder, home) ? [] : withoutUser(confirmed(await collect($, `${place.folder}/.claude`), listed), user)
    await update($, ownAtom, () => ({ user, project }) satisfies ArsenalOwn)
    await update($, projectKeyAtom, () => place.key)
  } catch {
    // the rows stay as they were
  }
}

/** What was turned off, from the last session on this machine. */
async function loadOff($: EngineInterface) {
  try {
    const held = offFromStore(await $.store.get(STORE_KEY))
    await update($, offAtom, () => held)
  } catch {
    // nothing is off until the person turns something off
  }
}

// ── Sound notifications ──────────────────────────────────────────────────

/**
 * The sounds there are now: the `.wav` files of the person's folder and the
 * system's own that exist on disk. Read each time it is needed, so a file
 * dropped in mid-session is found.
 */
async function soundsOf($: EngineInterface): Promise<{ sounds: Sounds; os: Os }> {
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
  const os = osFrom(await $.env.get('OS'), home)
  const folder = soundsFolder(home)
  const fileNames = home ? (await entriesOf($, folder)).filter(f => f.kind === 'file' || f.isLink).map(f => f.name) : []
  const found = await Promise.all(
    systemCandidates(os).map(async (s): Promise<Sound | null> => {
      try {
        return (await $.fs.exists(s.path)) ? s : null
      } catch {
        return null
      }
    }),
  )
  return { sounds: { personal: personalSounds(fileNames, folder), system: found.filter((s): s is Sound => s !== null) }, os }
}

/** What was chosen, from the last session on this machine. */
async function loadChime($: EngineInterface) {
  try {
    const held = chimeFromStore(await $.store.get(CHIME_STORE_KEY))
    await update($, chimeAtom, () => held)
  } catch {
    // the chime is off until the person turns it on
  }
}

/** Writes the setting to state (the drawing follows), then to the store. */
async function setChime($: EngineInterface, next: ArsenalChime) {
  await update($, chimeAtom, () => next)
  try {
    await $.store.set(CHIME_STORE_KEY, chimeToStore(next))
  } catch {
    // the state stands for this session
    $.ui.toast('Could not save the chime setting.')
  }
}

/** Plays one sound file. Silent when nothing can play it or the player fails. */
async function playPath($: EngineInterface, path: string | undefined, os: Os) {
  const argv = path ? playerFor(path, os) : null
  if (!argv) return
  try {
    await $.process.run(argv, { timeoutMs: 15000 })
  } catch {
    // no player, or the sound is gone: stay quiet
  }
}

/** Starts a sound without holding the caller: nothing here may slow or fail a turn. */
const quiet = (run: () => Promise<void>) => {
  void run().catch(() => {})
}

/** The sound for an event: Claude's (a reply, a question, a permission prompt) or the person's own Enter. Nothing while the chime is off. */
async function playFor($: EngineInterface, kind: 'claude' | 'sent') {
  const chime = (await read($, chimeAtom)) ?? NO_CHIME
  if (!chime.isOn) return
  const { sounds, os } = await soundsOf($)
  await playPath($, (kind === 'claude' ? chosen(sounds, chime.sound) : sentChoice(sounds, chime.sent))?.path, os)
}

async function openMenu($: EngineInterface) {
  await refreshModel($)
  await scan($)
  const rows = paneRows(
    await read($, toolsAtom),
    (await read($, ownAtom)) ?? NO_OWN,
    (await read($, offAtom)) ?? NO_OFF,
    (await read($, projectKeyAtom)) ?? '',
    null,
    PANE_COLUMNS,
    (await read($, chimeAtom)) ?? NO_CHIME,
  )
  await update($, isOpenAtom, () => true)
  const { isPlaced } = await $.ui.open(paneArgs(rows))
  if (!isPlaced) {
    await update($, isOpenAtom, () => false)
    $.ui.toast('Arsenal needs a wider window to open.')
  }
}

async function closeMenu($: EngineInterface) {
  await update($, isOpenAtom, () => false)
  await update($, editingAtom, () => null)
  await $.ui.close({ id: PANE })
}

async function toggleMenu($: EngineInterface) {
  if ((await read($, isOpenAtom)) === true) await closeMenu($)
  else await openMenu($)
}

/**
 * prompt-upgrade's `auto`, which is not in this plugin's contract. Anything
 * but `true` is off, which includes prompt-upgrade not being installed. The
 * read made while drawing subscribes the drawing, so the pill follows the
 * value once prompt-upgrade writes it.
 */
async function readAuto($: EngineInterface): Promise<boolean> {
  try {
    const held = await ($.state as any).get({ plugin: 'prompt-upgrade', key: 'auto' })
    return held?.value === true
  } catch {
    return false
  }
}

// ── Presses ──────────────────────────────────────────────────────────────

/**
 * Runs a tool's own slash command, as if typed. A Launch row closes the menu
 * first, so the tool's own pane takes the dock; a failure is then a toast,
 * since the note is out of view. The switch keeps the menu open and says what
 * it sent and how that went in the note line.
 */
async function press($: EngineInterface, command: string, args: string, closes: boolean) {
  const line = commandLine(command, args)
  if (closes) await closeMenu($)
  else await say($, sentNote(line))
  try {
    await $.command.run({ command, args })
    if (!closes) await say($, ranNote(line))
  } catch (err) {
    const failed = failedNote(line, plain(err))
    if (closes) $.ui.toast(failed)
    else await say($, failed)
  }
}

/**
 * The `…` on a row: puts `/name ` in the prompt box for the person to finish.
 * A draft in the box is never written over, and a box that cannot take the text
 * is said so. The menu closes first, so the toast is seen.
 */
async function fillPrompt($: EngineInterface, name: string) {
  await closeMenu($)
  try {
    if ((await $.prompt.read()).text.trim() !== '') {
      $.ui.toast(draftNote(name))
      return
    }
    if (!(await $.prompt.fill({ text: `/${name} ` })).isFilled) $.ui.toast(unfilledNote)
  } catch {
    $.ui.toast(unfilledNote)
  }
}

/** A pill in edit mode: turns the command off or on at once, and saves it. */
async function flipOff($: EngineInterface, section: Section, name: string) {
  const key = (await read($, projectKeyAtom)) ?? ''
  const held = (await read($, offAtom)) ?? NO_OFF
  const next: ArsenalOff = withOff(held, section, key, flipped(offFor(held, section, key), name))
  await update($, offAtom, () => next)
  try {
    await $.store.set(STORE_KEY, offToStore(next))
  } catch {
    // the state stands for this session
    $.ui.toast('Could not save which commands are off.')
  }
}

/** The Sound row: the next sound in the list, saved and played at once. */
async function cycleSound($: EngineInterface) {
  const held = (await read($, chimeAtom)) ?? NO_CHIME
  const { sounds, os } = await soundsOf($)
  const name = nextName(sounds, held.sound)
  if (!name) return
  await setChime($, { ...held, sound: name })
  await playPath($, listOf(sounds).find(s => s.name === name)?.path, os)
}

/** The Sent row: the next sound after none and the list, saved and played at once; none plays nothing. */
async function cycleSent($: EngineInterface) {
  const held = (await read($, chimeAtom)) ?? NO_CHIME
  const { sounds, os } = await soundsOf($)
  const name = nextSent(sounds, held.sent)
  await setChime($, { ...held, sent: name })
  await playPath($, sentChoice(sounds, name)?.path, os)
}

/** `✎ edit` and `✓ done`: one section is in edit mode at a time. */
const setEditing = ($: EngineInterface, section: Section | null) => update($, editingAtom, () => section)

// ── Drawings ─────────────────────────────────────────────────────────────

type View = {
  tools: ArsenalTools
  auto: boolean
  header: string
  note: string
  own: ArsenalOwn
  off: ArsenalOff
  editing: Section | null
  projectKey: string
  chime: ArsenalChime
  /** The name the Claude row shows: the chosen sound, or the default when the saved one is gone. */
  sound: string
  /** The name the You row shows: the chosen sound, or empty for none (also when the saved one is gone). */
  sentSound: string
}

function drawMenu($: EngineInterface, e: Parameters<typeof $.ui.resolve>[0], bodyColumns: number, view: View) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const { tools, auto } = view
  const inner = Math.max(20, bodyColumns)
  const columns = launchColumns(tools, bodyColumns)
  const columnWidth = columns.length > 1 ? Math.floor(inner / columns.length) : inner

  // `● On` / `○ Off`, as the Prompt Upgrade switch and the edit-mode rows show it
  const pill = (isOn: boolean) => (
    <Text backgroundColor={isOn ? COLORS.teal : COLORS.off} color={isOn ? COLORS.dark : COLORS.light}>
      {isOn ? ' ● On ' : ' ○ Off '}
    </Text>
  )

  // USER and PROJECT: a header with `✎ edit`, then a row per command that is on
  // (`all off` when none is), or in edit mode every command with its pill
  const ownSection = (section: Section, title: string) => {
    const commands = view.own[section]
    if (commands.length === 0) return null
    const off = offFor(view.off, section, view.projectKey)
    const isEditing = view.editing === section
    const shown = shownRows(commands, off, false)
    const nameWidth = nameCells(shown.length ? shown : commands, inner)
    return (
      <Box key={`arsenal-${section}-section`} flexDirection="column">
        <Box justifyContent="space-between">
          <Text dimColor>{sectionTitle(title)}</Text>
          <Button key={`arsenal-${section}-edit`} plain label={isEditing ? '✓ done' : '✎ edit'} onPress={() => setEditing($, isEditing ? null : section)} />
        </Box>
        {isEditing
          ? commands.map(c => (
              <Box key={`arsenal-${section}-edit-row-${c.name}`} justifyContent="space-between">
                <Text dimColor={off.includes(c.name)}>{`/${c.name}`}</Text>
                <Button key={`arsenal-${section}-pill-${c.name}`} plain onPress={() => flipOff($, section, c.name)}>
                  {pill(!off.includes(c.name))}
                </Button>
              </Box>
            ))
          : shown.length === 0
            ? <Text dimColor>{'  all off'}</Text>
            : shown.map(c => {
                const { label, detail } = ownRow(c, nameWidth, inner)
                return (
                  <Box key={`arsenal-${section}-row-${c.name}`} justifyContent="space-between">
                    <Button key={`arsenal-${section}-run-${c.name}`} plain onPress={() => press($, c.name, '', true)}>
                      <Text>{label}</Text>
                      <Text dimColor>{detail}</Text>
                    </Button>
                    {c.takesArgs ? <Button key={`arsenal-${section}-more-${c.name}`} plain label="…" onPress={() => fillPrompt($, c.name)} /> : null}
                  </Box>
                )
              })}
      </Box>
    )
  }

  const launchRow = (item: LaunchItem) => (
    <Button
      key={`arsenal-${item.key}`}
      plain
      hotkey={item.hotkey}
      label={`${item.glyph} ${item.label}`}
      onPress={() => press($, item.command, item.args, true)}
    />
  )

  return (
    <Box key="arsenal-menu" flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={COLORS.accent}>
          ◆  A R S E N A L
        </Text>
        <Text dimColor>{view.header}</Text>
      </Box>
      <Text dimColor>{'─'.repeat(inner)}</Text>
      <Box key="arsenal-settings-section" flexDirection="column">
        <Text dimColor>{sectionTitle('SETTINGS')}</Text>
        {hasPromptUpgrade(tools) ? (
          <Box key="arsenal-auto-rows" flexDirection="column">
            <Box justifyContent="space-between">
              <Box>
                <Text color={auto ? COLORS.teal : undefined} dimColor={!auto}>
                  {auto ? '● ' : '○ '}
                </Text>
                <Text bold>Prompt Upgrade</Text>
              </Box>
              <Button key="arsenal-auto" plain hotkey="p" onPress={() => press($, 'prompt-upgrade', auto ? 'off' : 'on', false)}>
                {pill(auto)}
              </Button>
            </Box>
            <Text dimColor>{'  upgrade every prompt first'}</Text>
          </Box>
        ) : null}
        <Box key="arsenal-chime-rows" flexDirection="column">
          <Box justifyContent="space-between">
            <Box>
              <Text color={view.chime.isOn ? COLORS.teal : undefined} dimColor={!view.chime.isOn}>
                {view.chime.isOn ? '● ' : '○ '}
              </Text>
              <Text bold>Sound notifications</Text>
            </Box>
            <Button key="arsenal-chime-switch" plain hotkey="c" onPress={() => setChime($, { ...view.chime, isOn: !view.chime.isOn })}>
              {pill(view.chime.isOn)}
            </Button>
          </Box>
          {view.chime.isOn ? (
            <Box key="arsenal-chime-pickers" flexDirection="column">
              <Box justifyContent="space-between">
                <Text>♪ Claude</Text>
                <Button key="arsenal-chime-sound" plain hotkey="o" onPress={() => cycleSound($)}>
                  <Text dimColor>{`${view.sound || 'none found'} ▸`}</Text>
                </Button>
              </Box>
              <Box justifyContent="space-between">
                <Text>↗ You</Text>
                <Button key="arsenal-chime-sent" plain hotkey="m" onPress={() => cycleSent($)}>
                  <Text dimColor>{`${view.sentSound || 'none'} ▸`}</Text>
                </Button>
              </Box>
            </Box>
          ) : null}
        </Box>
      </Box>
      {launchItems(tools).length > 0 ? (
        <Box key="arsenal-launch-section" flexDirection="column">
          <Text dimColor>{sectionTitle('LAUNCH')}</Text>
          <Box>
            {columns.map((items, i) => (
              <Box key={`arsenal-column-${i}`} flexDirection="column" width={columnWidth}>
                {items.map(launchRow)}
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}
      {ownSection('user', 'USER')}
      {ownSection('project', 'PROJECT')}
      <Text dimColor>{view.note || ' '}</Text>
      <Text color="inactive" dimColor>{versionLine(VERSION, RELEASED)}</Text>
    </Box>
  )
}

// ── The module ───────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'arsenal',
        description: 'Open or close the Arsenal menu: the tool mods, one press away',
        immediate: true,
      })
    } catch {
      // the launcher still works without the command
    }
    try {
      // a hot reload leaves an open pane open
      const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
      await update($, isOpenAtom, () => isOpen)
      await update($, editingAtom, () => null)
      await say($, '')
    } catch {
      // a menu that stays as it was is still a menu
    }
    try {
      await $.command.register({
        name: 'chime',
        description: 'Sound notifications: on, off, test, or pick the sounds for you and Claude',
        argumentHint: '[on|off|test|sound <name>|sent <name|none>]',
        immediate: true,
      })
    } catch {
      // the switch in the menu still works without the command
    }
    await refreshTools($)
    await loadOff($)
    await loadChime($)
    await scan($)
    try {
      const model = await $.session.model()
      await update($, runningAtom, r => reconcile(r ?? null, model))
    } catch {
      // the header shows nothing until the first request
    }
    return next(e)
  })

  // A tool that registers its command after this plugin started still gets its
  // rows: the engine's own list is read once, and this keeps it current
  on('command.register', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.name === 'prompt-upgrade' || e.name === 'work-report') await update($, toolsAtom, t => ({ ...(t ?? NO_TOOLS), [e.name]: true }))
    } catch {
      // the list read at session start stands
    }
    return r
  }).catch(($, e, next) => next(e))

  // Every model request, main loop and subagents. Only the main loop's say what
  // the header shows, and the request goes down as it came
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      try {
        const now = runningFrom(e.model, e.effort)
        await update($, runningAtom, r => (sameRunning(r ?? null, now) ? (r ?? null) : now))
      } catch {
        // the header is only a label
      }
    }
    return yield* next(e)
  })

  on('command.run', { command: 'arsenal' }, async $ => {
    await toggleMenu($)
    return {}
  }).catch(() => ({ text: 'Arsenal could not do that right now.' }))

  on('command.run', { command: 'chime' }, async ($, e) => {
    const held = (await read($, chimeAtom)) ?? NO_CHIME
    const { sounds, os } = await soundsOf($)
    const names = listOf(sounds).map(s => s.name)
    const now = chosen(sounds, held.sound)
    const sentNow = sentChoice(sounds, held.sent)
    const command = parseChime(e.args)
    if (command.kind === 'on' || command.kind === 'off') {
      await setChime($, { ...held, isOn: command.kind === 'on' })
      return { text: command.kind === 'on' ? 'Sound notifications on.' : 'Sound notifications off. `/chime on` turns them back on.' }
    }
    if (command.kind === 'test') {
      await playPath($, now?.path, os)
      return { text: now ? `Played "${now.name}".` : 'No sounds found.' }
    }
    if (command.kind === 'sound') {
      const picked = listOf(sounds).find(s => s.name.toLowerCase() === command.name.toLowerCase())
      if (!picked) return { text: `No sound called "${command.name}". Pick one of: ${names.join(', ')}` }
      await setChime($, { ...held, sound: picked.name })
      await playPath($, picked.path, os)
      return { text: `Sound set to "${picked.name}".` }
    }
    if (command.kind === 'sent') {
      if (command.name === '') {
        await setChime($, { ...held, sent: '' })
        return { text: 'Sent sound set to none.' }
      }
      const picked = listOf(sounds).find(s => s.name.toLowerCase() === command.name.toLowerCase())
      if (!picked) return { text: `No sound called "${command.name}". Pick one of: ${names.join(', ')}, or none` }
      await setChime($, { ...held, sent: picked.name })
      await playPath($, picked.path, os)
      return { text: `Sent sound set to "${picked.name}".` }
    }
    return { text: command.kind === 'show' ? describeChime(held, now?.name ?? '', sentNow?.name ?? '', names) : CHIME_HELP }
  }).catch(() => ({ text: 'Chime could not do that right now.' }))

  // The person's own Enter on a prompt. The sound starts as the prompt leaves the
  // box, before a hook beneath can hold or drop it (Prompt Upgrade holds a prompt
  // and sends its upgrade later as a plugin's, which would never be heard)
  on('prompt.submit', async ($, e, next) => {
    if (shouldPlaySent(e)) quiet(() => playFor($, 'sent'))
    return next(e)
  })

  // Claude's sound, for each time it has something for the person. A reply done:
  // the main loop's turns only, and not one the person stopped. The sound is
  // started and never waited for
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && !e.isAborted) quiet(() => playFor($, 'claude'))
    return done
  })

  // The dialog opens while the call runs, so the sound starts as it appears
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    quiet(() => playFor($, 'claude'))
    return next(e)
  })

  // A permission prompt, where the engine raises one
  on('classic.Notification', async ($, e, next) => {
    const done = await next(e)
    if (e.notification_type === 'permission_prompt') quiet(() => playFor($, 'claude'))
    return done
  })

  // A close by the person (Esc, the pane's mark) turns the launcher's arrow
  // back; an unload (hot reload, exit) is not a close they asked for
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE && e.origin.kind !== 'unload') {
      try {
        await update($, isOpenAtom, () => false)
        await update($, editingAtom, () => null)
      } catch {
        // the arrow is only a label
      }
    }
    return r
  })

  // The launcher sits in the prompt footer (SessionMode), first on the row the
  // engine's footer draws, which is also where claude-hud's first row starts.
  // The engine hands its footer over as one opaque node, with the labels other
  // mods added (waypoints' plan) already in it, so it is wrapped, never
  // rebuilt from `modes`. A space after the button keeps the two apart
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const open = (await read($, isOpenAtom)) === true
    const footer = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const label = open ? '◆ Arsenal ▴' : '◆ Arsenal ▾'
    return (
      <Box key="arsenal-launcher">
        <Button key="arsenal-toggle" plain label={label} onPress={() => toggleMenu($)}>
          <Text color="claude">{`[ ${label} ]`}</Text>
        </Button>
        <Text> </Text>
        {footer}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const tools = await read($, toolsAtom)
    const chime = (await read($, chimeAtom)) ?? NO_CHIME
    // the list is read as the pane draws, so a file dropped in is found
    let sound = ''
    let sentSound = ''
    if (chime.isOn) {
      try {
        const { sounds } = await soundsOf($)
        sound = chosen(sounds, chime.sound)?.name ?? ''
        sentSound = sentChoice(sounds, chime.sent)?.name ?? ''
      } catch {
        // the rows say none found and none
      }
    }
    const view: View = {
      tools,
      chime,
      sound,
      sentSound,
      auto: await readAuto($),
      header: headerNote((await read($, runningAtom)) ?? null),
      note: (await read($, noteAtom)) ?? '',
      own: (await read($, ownAtom)) ?? NO_OWN,
      off: (await read($, offAtom)) ?? NO_OFF,
      editing: (await read($, editingAtom)) ?? null,
      projectKey: (await read($, projectKeyAtom)) ?? '',
    }
    return drawMenu($, e, Math.max(20, e.props.bodyColumns || PANE_COLUMNS), view)
  })
}
