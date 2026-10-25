// The pane, drawn from what the state holds. Nothing here writes: a press or
// a typed line calls one of the actions register.tsx hands in.
//
// Nothing is given a width in cells. The pane reports how wide it thinks it
// is, but the row a surface actually lays out in can be narrower, and a rule
// or a title set to the reported width then ran off the edge or wrapped. Rows
// take the room they are given instead: rules are a long run of glyphs in a
// box that clips it, text wraps where the surface wraps, and the width the
// pane reports only chooses between a roomy shape and a tight one.
import type { Elements, UiPressArgument } from 'claude-code'

import type { UpgradeFlow, UpgradeHistoryItem } from '../types'
import { clip, COLORS, cutText, statsPlan, stacksCards, TITLE, trackerRow } from './layout'
import type { Line } from './layout'
import { ago, answeredPairs, countWords } from './logic'
import { statsSvg } from './svg'
import { VERSION } from './version'

type El = Elements['terminal']
type Press = (e: UiPressArgument) => void
type Kind = 'main' | 'slate' | 'plain' | 'selected' | 'quiet'

/** What a press or a typed line does; register.tsx binds each to the engine. */
export type Actions = {
  run: () => void
  /** Runs this text: Enter in the edit field. */
  runText: (text: string) => void
  edit: () => void
  stopEdit: () => void
  copy: (surface: UiPressArgument['surface']) => void
  cancel: () => void
  retry: () => void
  sendOriginal: () => void
  upgradeNow: () => void
  choose: (question: number, text: string) => void
  typeOther: (question: number) => void
  submitOther: (question: number, text: string) => void
  skip: (question: number) => void
  draft: (text: string) => void
  compose: (text: string) => void
  openHistoryItem: (id: string) => void
  showHistory: () => void
  closeHistory: () => void
}

export type Model = {
  /** What the pane reports; only used to choose a shape. */
  width: number
  auto: boolean
  flow: UpgradeFlow | null
  view: 'flow' | 'history'
  history: UpgradeHistoryItem[]
  now: number
  /** The vector element, on the surfaces that draw one (not the terminal). */
  Svg?: Elements['desktop']['Svg']
}

const SIDE_BY_SIDE_FROM = 60
const INDENT = 4
// Far more glyphs than any pane is wide: the box around it clips the rest
const RUN = 400

// ── Pieces ───────────────────────────────────────────────────────────────

function lineRow(el: El, line: Line) {
  const { Box, Text } = el
  const segs = line.filter(s => s.t !== '')
  if (segs.length === 0) return <Text> </Text>
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {segs.map(s => (
        <Text color={COLORS[s.tone ?? 'text']} {...(s.bg ? { backgroundColor: COLORS[s.bg] } : {})} {...(s.bold ? { bold: true } : {})}>
          {s.t}
        </Text>
      ))}
    </Box>
  )
}

const blank = (el: El) => lineRow(el, [])

/** A rule that fills what is left of its row: clipped at the edge, never wrapped. */
function rule(el: El, color: string = COLORS.hair, glyph = '─') {
  const { Box, Text } = el
  return (
    <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
      <Text color={color}>{glyph.repeat(RUN)}</Text>
    </Box>
  )
}

/**
 * SMALL MUTED CAPITALS with a short note at the far end, and a hairline under
 * them across the pane. The rule is its own row, as under the title: set on the
 * label's row, the label and the rule sat at different heights.
 */
function heading(el: El, label: string, right?: string, rightColor: string = COLORS.muted, labelColor: string = COLORS.muted) {
  const { Box, Text } = el
  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
        <Box flexShrink={1}>
          <Text color={labelColor} wrap="truncate-end">
            {label.toUpperCase()}
          </Text>
        </Box>
        {right ? (
          <Box flexShrink={0}>
            <Text color={rightColor}>{right}</Text>
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="row" width="100%">
        {rule(el)}
      </Box>
    </Box>
  )
}

function chip(el: El, o: { key: string; label: string; kind: Kind; hotkey?: string; onPress: Press }) {
  const { Button, Text } = el
  const look =
    o.kind === 'main'
      ? { backgroundColor: COLORS.gold, color: COLORS.dark, bold: true }
      : o.kind === 'slate'
        ? { backgroundColor: COLORS.hair, color: COLORS.text }
        : o.kind === 'selected'
          ? { backgroundColor: COLORS.hair, color: COLORS.green, bold: true }
          : o.kind === 'quiet'
            ? { color: COLORS.muted, dimColor: true }
            : { color: COLORS.muted }
  return (
    <Button key={o.key} plain {...(o.hotkey ? { hotkey: o.hotkey } : {})} onPress={o.onPress}>
      <Text {...look}>{` ${o.label} `}</Text>
    </Button>
  )
}

function buttonRow(el: El, ...children: unknown[]) {
  const { Box } = el
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {children}
    </Box>
  )
}

/**
 * A card the engine frames and the surface wraps: a label, then the text. The
 * frame is the engine's border, not characters set in rows, so it stays
 * straight in any font and the text wraps inside it.
 */
function card(el: El, o: { label: string; text: string; width: string; tone: 'hair' | 'gold' | 'amber'; max?: number }) {
  const { Box, Text } = el
  const labelColor = o.tone === 'hair' ? COLORS.muted : COLORS[o.tone]
  return (
    <Box flexDirection="column" width={o.width} flexShrink={1} borderStyle="round" borderColor={COLORS[o.tone]} paddingX={1}>
      <Text bold color={labelColor}>
        {o.label.toUpperCase()}
      </Text>
      {cutText(o.text, o.max).split('\n').map(p => (
        <Text color={COLORS.text} wrap="wrap">
          {p === '' ? ' ' : p}
        </Text>
      ))}
    </Box>
  )
}

/**
 * Words before and after and details added. Where the surface draws vectors
 * the three tiles are one drawing, which no font can put out of line; in a
 * terminal they are framed tiles of box-drawing characters, or one line when
 * those do not fit.
 */
function statsBlock(el: El, m: Model, before: number, after: number, added: number) {
  const { Box, Text } = el
  if (m.Svg) {
    // about 8 CSS pixels to a reported column; the drawing scales down to its slot
    const art = statsSvg(Math.max(240, Math.min(900, m.width * 8 - 8)), before, after, added)
    const { Svg } = m
    return <Svg source={art.source} alt={art.alt} />
  }
  const plan = statsPlan(m.width, before, after, added)
  if (plan.kind === 'line') return lineRow(el, plan.line)
  return (
    <Box flexDirection="row" columnGap={1} width="100%">
      {plan.tiles.map(t => (
        <Box flexDirection="column" alignItems="center" width="33%" flexShrink={1} borderStyle="round" borderColor={COLORS.hair}>
          <Box flexDirection="column" alignItems="flex-start">
            {t.digits.map(row => (
              <Text bold color={COLORS[t.tone]}>
                {row}
              </Text>
            ))}
          </Box>
          <Text color={COLORS.muted} wrap="wrap">
            {t.caption}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

/** The title with the mode at the far end, a gold rule under it the width of the title, then a hairline. */
function top(el: El, m: Model, step: number | null) {
  const { Box, Text } = el
  const out = [
    <Box flexDirection="row" justifyContent="space-between" width="100%" columnGap={2}>
      <Box flexShrink={0}>
        <Text bold color={COLORS.text}>
          {TITLE}
        </Text>
      </Box>
      <Box flexShrink={1}>
        <Text color={m.auto ? COLORS.green : COLORS.muted}>{m.auto ? 'auto on' : 'auto off'}</Text>
      </Box>
    </Box>,
    <Box flexDirection="row" width="100%">
      <Box flexShrink={0}>
        <Text color={COLORS.gold}>{'━'.repeat(TITLE.length)}</Text>
      </Box>
      {rule(el)}
    </Box>,
  ]
  if (step !== null) out.push(blank(el), lineRow(el, trackerRow(m.width, step)))
  out.push(blank(el))
  return out
}

function stepOf(flow: UpgradeFlow): number {
  switch (flow.phase) {
    case 'compose':
    case 'reading':
      return 0
    case 'questions':
      return 1
    case 'rewriting':
      return 2
    case 'review':
      return 3
    case 'error':
      return flow.error?.where === 'questions' ? 0 : 2
  }
}

const footerLink = (el: El, a: Actions) =>
  chip(el, { key: 'show-history', label: 'History', kind: 'plain', hotkey: 'h', onPress: () => a.showHistory() })

// ── Screens ──────────────────────────────────────────────────────────────

function composeScreen(el: El, m: Model, a: Actions) {
  const { Box, Input } = el
  return (
    <Box flexDirection="column" width="100%">
      {top(el, m, 0)}
      {heading(el, 'Type your rough prompt')}
      <Input key="compose" placeholder="What do you want done?" submitLabel="upgrade" autoFocus onSubmit={v => a.compose(v)} />
      {blank(el)}
      {buttonRow(
        el,
        chip(el, { key: 'cancel', label: 'Cancel', kind: 'plain', hotkey: 'x', onPress: () => a.cancel() }),
        footerLink(el, a),
      )}
    </Box>
  )
}

/** A prompt in a frame and one line saying what is happening: the reading and rewriting steps. */
function waitingScreen(el: El, m: Model, a: Actions, flow: UpgradeFlow, line: string) {
  const { Box, Text } = el
  return (
    <Box flexDirection="column" width="100%">
      {top(el, m, stepOf(flow))}
      {card(el, { label: 'Your prompt', text: flow.original, width: '100%', tone: 'hair', max: 600 })}
      {blank(el)}
      <Text color={COLORS.muted} wrap="wrap">
        {line}
      </Text>
      {blank(el)}
      {buttonRow(el, chip(el, { key: 'cancel', label: 'Cancel', kind: 'plain', hotkey: 'x', onPress: () => a.cancel() }))}
    </Box>
  )
}

function questionsScreen(el: El, m: Model, a: Actions, flow: UpgradeFlow) {
  const { Box, Input, Text } = el
  const total = flow.questions.length
  const done = flow.answers.filter(x => x && x.kind !== 'skip').length
  const resolved = flow.answers.filter(x => x !== null).length
  const oneLine = flow.original.replace(/\s+/g, ' ').trim()

  const blocks = flow.questions.map((q, i) => {
    const ans = flow.answers[i] ?? null
    const isAnswered = ans !== null && ans.kind !== 'skip'
    const badgeLook = isAnswered
      ? { backgroundColor: COLORS.green, color: COLORS.dark }
      : ans !== null
        ? { backgroundColor: COLORS.hair, color: COLORS.muted }
        : { backgroundColor: COLORS.gold, color: COLORS.dark }

    type Item = { key: string; label: string; kind: Kind; onPress: Press }
    const items: Item[] = q.options.map((opt, oi) => {
      const on = ans !== null && ans.kind === 'option' && ans.text === opt
      return { key: `q${i}-o${oi}`, label: (on ? '✓ ' : '') + opt, kind: on ? 'selected' : 'slate', onPress: () => a.choose(i, opt) }
    })
    const other = ans !== null && ans.kind === 'other'
    items.push({
      key: `q${i}-other`,
      label: other ? '✓ ' + clip(`Other: ${ans.text}`, 30) : 'Other (type it)',
      kind: other ? 'selected' : 'slate',
      onPress: () => a.typeOther(i),
    })
    items.push({
      key: `q${i}-skip`,
      label: ans !== null && ans.kind === 'skip' ? 'Skipped' : 'Skip',
      kind: 'quiet',
      onPress: () => a.skip(i),
    })
    return (
      <Box flexDirection="column" width="100%">
        <Box flexDirection="row" columnGap={1} width="100%">
          <Box flexShrink={0}>
            <Text {...badgeLook} bold>
              {isAnswered ? ' ✓ ' : ` ${i + 1} `}
            </Text>
          </Box>
          <Box flexShrink={1}>
            <Text bold color={COLORS.text} wrap="wrap">
              {q.text}
            </Text>
          </Box>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingLeft={INDENT}>
          {items.map(it => chip(el, { key: it.key, label: it.label, kind: it.kind, onPress: it.onPress }))}
        </Box>
        {flow.typing === i && (
          <Box flexDirection="row" paddingLeft={INDENT}>
            <Input key={`other-${i}`} label="Your answer " placeholder="type it, then Enter" submitLabel="save" autoFocus onSubmit={v => a.submitOther(i, v)} />
          </Box>
        )}
        {blank(el)}
      </Box>
    )
  })

  return (
    <Box flexDirection="column" width="100%">
      {top(el, m, 1)}
      <Box flexDirection="row" columnGap={2} width="100%">
        <Box flexShrink={0}>
          <Text color={COLORS.muted}>Your prompt</Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={COLORS.text} wrap="truncate-end">
            {oneLine}
          </Text>
        </Box>
      </Box>
      {blank(el)}
      {buttonRow(
        el,
        chip(el, {
          key: 'upgrade-now',
          label: resolved >= total ? 'Upgrade now' : 'Skip the rest, upgrade now',
          kind: 'main',
          hotkey: 'u',
          onPress: () => a.upgradeNow(),
        }),
        chip(el, { key: 'cancel', label: 'Cancel', kind: 'plain', hotkey: 'x', onPress: () => a.cancel() }),
      )}
      {blank(el)}
      {heading(el, 'Questions', `${done} of ${total} answered`, done === total ? COLORS.green : COLORS.muted)}
      {blank(el)}
      {blocks}
    </Box>
  )
}

/** One Text per item, the green plus inside it: nothing to fall out of line with the words. */
function addedList(el: El, items: readonly string[]) {
  const { Text } = el
  return items.map(item => (
    <Text wrap="wrap">
      <Text color={COLORS.green}>+ </Text>
      <Text color={COLORS.text}>{item}</Text>
    </Text>
  ))
}

function reviewScreen(el: El, m: Model, a: Actions, flow: UpgradeFlow) {
  const { Box, Input, Text } = el
  const rewrite = flow.rewrite
  if (!rewrite) return waitingScreen(el, m, a, flow, 'Writing your upgrade…')
  const text = flow.isEditing ? flow.draft : rewrite.text
  // two cards of one width a cell apart; stacked on a narrow pane, each takes the row
  const stacked = stacksCards(m.width, SIDE_BY_SIDE_FROM)
  const share = stacked ? '100%' : '50%'
  const leftCard = card(el, { label: 'Your prompt', text: flow.original, width: share, tone: 'hair' })
  const rightCard = card(el, { label: 'The upgrade', text, width: share, tone: 'gold' })

  return (
    <Box flexDirection="column" width="100%">
      {top(el, m, 3)}
      {statsBlock(el, m, countWords(flow.original), countWords(text), rewrite.added.length)}
      {blank(el)}
      {buttonRow(
        el,
        chip(el, { key: 'run', label: 'Run it', kind: 'main', hotkey: 'r', onPress: () => a.run() }),
        flow.isEditing
          ? chip(el, { key: 'stop-edit', label: 'Done editing', kind: 'slate', hotkey: 'e', onPress: () => a.stopEdit() })
          : chip(el, { key: 'edit', label: 'Edit', kind: 'slate', hotkey: 'e', onPress: () => a.edit() }),
        chip(el, { key: 'copy', label: 'Copy', kind: 'slate', hotkey: 'c', onPress: e => a.copy(e.surface) }),
        chip(el, { key: 'cancel', label: 'Cancel', kind: 'plain', hotkey: 'x', onPress: () => a.cancel() }),
        flow.note === 'copied' && <Text color={COLORS.green}>Copied</Text>,
        flow.note === 'no-clipboard' && <Text color={COLORS.amber}>No clipboard here</Text>,
      )}
      {blank(el)}
      {heading(el, 'What I added', rewrite.added.length ? String(rewrite.added.length) : undefined)}
      {rewrite.added.length > 0 ? addedList(el, rewrite.added) : <Text color={COLORS.muted}>Nothing listed.</Text>}
      {blank(el)}
      {flow.isEditing && (
        <Box flexDirection="column" width="100%">
          {heading(el, 'Edit the upgrade', 'Enter runs it', COLORS.gold)}
          <Input key="edit-text" value={flow.draft} submitLabel="run" autoFocus onInput={v => a.draft(v)} onSubmit={v => a.runText(v)} />
          {blank(el)}
        </Box>
      )}
      <Box flexDirection={stacked ? 'column' : 'row'} alignItems="stretch" columnGap={1} width="100%">
        {leftCard}
        {rightCard}
      </Box>
      {blank(el)}
      {buttonRow(el, footerLink(el, a))}
    </Box>
  )
}

function errorScreen(el: El, m: Model, a: Actions, flow: UpgradeFlow) {
  const { Box } = el
  const body = [
    'Your prompt is safe. Nothing has been sent.',
    '',
    flow.error?.message ?? 'Something went wrong.',
    '',
    'Try again, send your original as it is, or cancel to put it back in the prompt box.',
  ].join('\n')
  return (
    <Box flexDirection="column" width="100%">
      {top(el, m, stepOf(flow))}
      {card(el, { label: 'Could not finish the upgrade', text: body, width: '100%', tone: 'amber' })}
      {blank(el)}
      {buttonRow(
        el,
        chip(el, { key: 'retry', label: 'Try again', kind: 'main', hotkey: 'r', onPress: () => a.retry() }),
        chip(el, { key: 'send-original', label: 'Send my original', kind: 'slate', hotkey: 's', onPress: () => a.sendOriginal() }),
        chip(el, { key: 'cancel', label: 'Cancel', kind: 'plain', hotkey: 'x', onPress: () => a.cancel() }),
      )}
      {blank(el)}
      {card(el, { label: 'Your prompt', text: flow.original, width: '100%', tone: 'hair', max: 600 })}
    </Box>
  )
}

function historyScreen(el: El, m: Model, a: Actions) {
  const { Box, Button, Text } = el
  return (
    <Box flexDirection="column" width="100%">
      {top(el, m, null)}
      {heading(el, 'Recent upgrades', `${m.history.length} of 20`)}
      {m.history.length === 0 && (
        <Text color={COLORS.muted} wrap="wrap">
          Nothing yet. /prompt-upgrade your prompt starts one.
        </Text>
      )}
      {m.history.map((item, i) => {
        const first = item.original.replace(/\s+/g, ' ').trim()
        return (
          <Button key={`hist-${i}`} plain onPress={() => a.openHistoryItem(item.id)}>
            <Text color={COLORS.muted}>{ago(m.now - item.at).padEnd(9)}</Text>
            <Text color={COLORS.text}>{' ' + clip(first, Math.min(36, Math.max(8, m.width - 16)))}</Text>
            <Text color={COLORS.green}>{' +' + item.added.length}</Text>
          </Button>
        )
      })}
      {blank(el)}
      {buttonRow(el, chip(el, { key: 'close', label: 'Close', kind: 'slate', hotkey: 'x', onPress: () => a.closeHistory() }))}
    </Box>
  )
}

/** The pane's whole body for the model. `el` is the terminal's table. */
function screen(el: El, m: Model, a: Actions) {
  if (m.view === 'history') return historyScreen(el, m, a)
  const flow = m.flow
  if (flow === null) return composeScreen(el, m, a)
  switch (flow.phase) {
    case 'compose':
      return composeScreen(el, m, a)
    case 'reading':
      return waitingScreen(el, m, a, flow, 'Reading your prompt and choosing the questions that matter…')
    case 'questions':
      return questionsScreen(el, m, a, flow)
    case 'rewriting': {
      const n = answeredPairs(flow.questions, flow.answers).length
      return waitingScreen(el, m, a, flow, n > 0 ? `Writing your upgrade from ${n} ${n === 1 ? 'answer' : 'answers'}…` : 'Writing your upgrade…')
    }
    case 'review':
      return reviewScreen(el, m, a, flow)
    case 'error':
      return errorScreen(el, m, a, flow)
  }
}

/** Whichever screen the state calls for, and under it the mod's version. */
export function drawPane(el: El, m: Model, a: Actions) {
  const { Box } = el
  return (
    <Box flexDirection="column" width="100%">
      {screen(el, m, a)}
      {lineRow(el, [{ t: `prompt-upgrade v${VERSION}`, tone: 'muted' }])}
    </Box>
  )
}
