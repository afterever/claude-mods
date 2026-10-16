import type { Elements, RenderElement } from 'claude-code'

import type { ActivityAgent, ActivityBeat, ActivityEntry, ActivityNow, ActivityOutcome, ActivityPhase, ActivityTimeline } from '../types'
import { barOf, SPINNERS, toolGlyphOf } from './glyphs'
import { barSvg, jellySvg, stripSvg } from './jelly'
import type { Level, Palette } from './palette'
import { agentColorOf, heatOf, mix } from './palette'
import type { PulseProps } from './pulse'
import { durationOf, plural, printable } from './text'

const MAX_HISTORY_ROWS = 12
const MAX_LABEL_CHARS = 120
const MAX_CARD_CHARS = 400
const CARD_FROM_CHARS = 40
const MAX_AGENT_NAME_CHARS = 40
const MAX_AGENT_ROWS = 6
const FLASH_MS = 360
const SPARKLE_MS = 2000
const BREATH_MS = 1400
const HISTORY_BAR_CELLS = 6

/** Everything a drawing reads, gathered once by the `AbovePrompt` hook. */
export type View = {
  headline: ActivityNow
  entries: readonly ActivityEntry[]
  working: readonly ActivityAgent[]
  timeline: ActivityTimeline
  beat: ActivityBeat | null
  isOpen: boolean
  nowMs: number
  maxRows: number
  bodyColumns: number
  level: Level
  palette: Palette
  onToggle: () => void
}

/** Draws one of `pulse.tsx`'s animations: made in the hooks module, which names it. */
export type PulseOf = (key: string, props: PulseProps, width: number) => RenderElement

type WebElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Svg'>

const OUTCOME_MARKS: Record<ActivityOutcome, string> = {
  ok: '✓',
  error: '✗',
  denied: '⊘',
  interrupted: '■',
}

const KIND_MARKS: Partial<Record<ActivityEntry['kind'], { mark: string; color: string }>> = {
  turn: { mark: '›', color: 'text' },
  reply: { mark: '✎', color: 'success' },
  compact: { mark: '⇣', color: 'planMode' },
}

/** What both surfaces lay out the same way: which agents and rows show. */
function layoutOf(v: View) {
  // One agent the headline names; more, or one beside the main loop's
  // work, get a row each.
  const isTeamListed = v.working.length > 1 || (v.working.length === 1 && v.headline.phase !== 'agent')
  const listed = isTeamListed ? v.working.slice(-MAX_AGENT_ROWS) : []
  const unlisted = isTeamListed ? v.working.length - listed.length : 0
  const teamRows = listed.length + (unlisted > 0 ? 1 : 0)
  const strip = stripOf(v)
  const rows = Math.min(MAX_HISTORY_ROWS, Math.max(1, v.maxRows - 4 - teamRows - (strip.length > 0 ? 1 : 0)))
  const shown = v.entries.slice(-rows)
  const hidden = v.entries.length - shown.length
  const maxMs = Math.max(1, ...shown.filter(hasBar).map(entry => entry.durationMs ?? 0))

  return { listed, unlisted, shown, hidden, maxMs, strip }
}

/** The turn's segments with the running one closed at now; none when idle and closed. */
function stripOf(v: View): { phase: ActivityPhase; ms: number; isOpen: boolean }[] {
  const isWorking = v.headline.phase !== 'idle'

  if (!isWorking && !v.isOpen) {
    return []
  }

  const segments = v.timeline.segments.map(s => ({ ...s, isOpen: false }))
  const { open } = v.timeline

  if (open !== null) {
    segments.push({ phase: open.phase, ms: Math.max(1, v.nowMs - open.sinceMs), isOpen: true })
  }

  return segments
}

function hasBar(entry: ActivityEntry): boolean {
  return entry.durationMs !== null && entry.kind !== 'turn' && entry.kind !== 'end'
}

function markOf(v: View, entry: ActivityEntry): { mark: string; color: string } {
  if (entry.kind === 'thought') {
    return { mark: '∴', color: v.palette.phase.thinking }
  }

  return KIND_MARKS[entry.kind] ?? { mark: OUTCOME_MARKS[entry.outcome], color: v.palette.outcome[entry.outcome] }
}

/** The border's color: a call's flash, the breath of a wait, or the phase. */
function borderOf(v: View): string {
  const { phase, sinceMs } = v.headline
  const { beat, palette, level, nowMs } = v

  if (level !== 'off' && beat?.kind === 'flash' && nowMs - beat.atMs < FLASH_MS) {
    return palette.outcomeHex[beat.outcome]
  }

  if (level === 'full' && (phase === 'approval' || phase === 'question')) {
    const wave = (Math.sin(((nowMs - sinceMs) / BREATH_MS) * 2 * Math.PI) + 1) / 2

    return mix(mix(palette.hex[phase], '#000000', 0.6), palette.hex[phase], wave)
  }

  return phase === 'idle' ? 'inactive' : palette.phase[phase]
}

function elapsedOf(v: View): { text: string; color: string | undefined } {
  if (v.headline.phase === 'idle') {
    return { text: '', color: undefined }
  }

  const ms = v.nowMs - v.headline.sinceMs

  return { text: ` · ${durationOf(ms)}`, color: heatOf(v.palette, ms) }
}

/** The status glyph, the "Claude" word and the sparkle, for the terminal. */
function terminalMarks(v: View, Text: Elements['terminal']['Text'], pulse: PulseOf) {
  const { phase } = v.headline
  const isWorking = phase !== 'idle'
  const color = v.palette.phase[phase]
  const spinner = SPINNERS[phase]

  const glyph = v.level === 'off' || !isWorking
    ? <Text color={color}>{isWorking ? '●' : '○'}</Text>
    : pulse(`glyph-${phase}`, { kind: 'spin', frames: [...spinner.frames], ms: spinner.ms, color }, 1)

  const name = v.level === 'full' && isWorking
    ? pulse('shimmer', { kind: 'shimmer', text: 'Claude', colors: [...v.palette.shimmer], ms: 110 }, 6)
    : <Text bold color={v.palette.brand}>Claude</Text>

  const { beat } = v
  const sparkle = v.level === 'full' && beat?.kind === 'done' && v.nowMs - beat.atMs < SPARKLE_MS
    ? [pulse(`sparkle-${beat.id}`, { kind: 'sparkle', colors: [...v.palette.shimmer] }, 4)]
    : []

  return { glyph, name, sparkle }
}

/**
 * The box on the terminal: block characters for the charts, and `Client`s
 * of fixed width for what moves.
 */
export function drawTerminal(ui: Elements['terminal'], v: View, pulse: PulseOf, below: RenderElement): RenderElement {
  const { Box, Text, Button } = ui
  const { headline, palette } = v
  const { listed, unlisted, shown, hidden, maxMs, strip } = layoutOf(v)
  const { glyph, name, sparkle } = terminalMarks(v, Text, pulse)
  const elapsed = elapsedOf(v)
  const label = printable(headline.label, MAX_LABEL_CHARS)
  const toolGlyph = toolGlyphOf(headline.tool)

  const stripRow = strip.length > 0
    ? [
        <Box key="strip" flexDirection="row">
          <Text dimColor>{'  '}</Text>
          {stripCells(strip, Math.max(10, Math.min(48, v.bodyColumns - 12))).map((run, i) => (
            <Text key={`strip-${i}`} color={palette.phase[run.phase]}>{'━'.repeat(run.cells)}</Text>
          ))}
        </Box>,
      ]
    : []

  const agentRows = listed.map((agent, i) => {
    const color = agentColorOf(palette, agent.name)
    const isLast = i === listed.length - 1 && unlisted === 0
    const mark = v.level === 'off'
      ? <Text color={color}>◆</Text>
      : pulse(`agent-glyph-${i}`, { kind: 'spin', frames: [...SPINNERS.agent.frames], ms: SPINNERS.agent.ms, color }, 1)

    return (
      <Box key={`agent-${i}`} flexDirection="row">
        <Box flexShrink={0}>
          <Text dimColor>{isLast ? '└─ ' : '├─ '}</Text>
          {mark}
          <Text> </Text>
        </Box>
        <Text bold color={color} wrap="truncate-end">{printable(agent.name, MAX_AGENT_NAME_CHARS)}</Text>
        <Text wrap="truncate-end">{` › ${printable(agent.label, MAX_LABEL_CHARS)}`}</Text>
        <Box flexShrink={0}>
          <Text color={heatOf(palette, v.nowMs - agent.sinceMs)} dimColor={heatOf(palette, v.nowMs - agent.sinceMs) === undefined}>
            {`  ${durationOf(v.nowMs - agent.sinceMs)}`}
          </Text>
        </Box>
      </Box>
    )
  })

  const moreAgents = unlisted > 0 ? [<Text dimColor>{`└─ … ${plural(unlisted, 'more agent')}`}</Text>] : []
  const teamBox = agentRows.length > 0
    ? [<Box key="agents" flexDirection="column">{agentRows}{moreAgents}</Box>]
    : []

  const historyRows = shown.map((entry, i) => {
    const { mark, color } = markOf(v, entry)
    const isQuiet = entry.kind === 'thought' || entry.kind === 'end'
    const took = entry.durationMs === null ? '' : `  ${durationOf(entry.durationMs)}`
    const bar = hasBar(entry) ? ` ${barOf((entry.durationMs ?? 0) / maxMs, HISTORY_BAR_CELLS)}` : ''
    const glyphOfTool = toolGlyphOf(entry.tool)
    const full = printable(entry.label, MAX_CARD_CHARS)

    return (
      <Box key={`row-${i}`} flexDirection="row" hover={{ scope: `row-${i}` }}>
        <Box flexShrink={0}>
          <Text color={color}>{`${mark} `}</Text>
          {glyphOfTool === '' ? [] : [<Text color={palette.phase.tool}>{`${glyphOfTool} `}</Text>]}
        </Box>
        <Text bold={entry.kind === 'turn'} dimColor={isQuiet} wrap="truncate-end">
          {printable(entry.label, MAX_LABEL_CHARS)}
        </Text>
        <Box flexShrink={0}>
          <Text dimColor>{took}</Text>
          <Text color={color} dimColor>{bar}</Text>
        </Box>
        {full.length > CARD_FROM_CHARS ? [card(Box, Text, `row-${i}`, full, color)] : []}
      </Box>
    )
  })

  const earlier = hidden > 0 ? [<Text dimColor>{`… ${hidden} earlier`}</Text>] : []
  const empty = v.entries.length === 0 ? [<Text dimColor>No actions yet</Text>] : []
  const body = v.isOpen
    ? [<Box key="history" flexDirection="column" marginTop={1}>{earlier}{historyRows}{empty}</Box>]
    : []

  const fullLabel = printable(headline.label, MAX_CARD_CHARS)

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={borderOf(v)} paddingX={1} alignSelf="flex-start">
        <Box key="activity" flexDirection="row" hover={{ scope: 'headline' }}>
          <Button key="toggle" plain label={v.isOpen ? '▾' : '▸'} onPress={v.onToggle} />
          {/* On a narrow screen only the label gives way: the rest would wrap. */}
          <Box flexShrink={0}>
            <Text> </Text>
            {glyph}
            <Text> </Text>
            {name}
            <Text bold>{': '}</Text>
            {toolGlyph === '' ? [] : [<Text color={palette.phase[headline.phase]}>{`${toolGlyph} `}</Text>]}
          </Box>
          <Text wrap="truncate-end">{label}</Text>
          <Box flexShrink={0}>
            {headline.meter === undefined ? [] : [<Text color={palette.phase[headline.phase]}>{` ${headline.meter}`}</Text>]}
            <Text color={elapsed.color} dimColor={elapsed.color === undefined}>{elapsed.text}</Text>
            {sparkle}
          </Box>
        </Box>
        {fullLabel.length > CARD_FROM_CHARS ? [card(Box, Text, 'headline', fullLabel, borderOf(v))] : []}
        {stripRow}
        {teamBox}
        {body}
      </Box>
      {below}
    </Box>
  )
}

/**
 * The whole of a long label, shown while the pointer rests on its row: an
 * absolute Box, so its showing moves nothing.
 */
function card(
  Box: Elements['terminal']['Box'] | WebElements['Box'],
  Text: Elements['terminal']['Text'] | WebElements['Text'],
  scope: string,
  text: string,
  color: string,
): RenderElement {
  return (
    <Box
      key={`card-${scope}`}
      position="absolute"
      top={1}
      left={2}
      display="none"
      hover={{ scope, display: 'flex' }}
      borderStyle="round"
      borderColor={color}
      backgroundColor="inverseText"
      paddingX={1}
    >
      <Text>{text}</Text>
    </Box>
  )
}

/**
 * The strip as runs of cells: each cell takes the phase at its middle in
 * time, and neighbours of one phase join into one run.
 */
function stripCells(
  segments: readonly { phase: ActivityPhase; ms: number }[],
  width: number,
): { phase: ActivityPhase; cells: number }[] {
  const total = segments.reduce((sum, s) => sum + s.ms, 0)
  const runs: { phase: ActivityPhase; cells: number }[] = []

  if (total <= 0) {
    return runs
  }

  for (let cell = 0; cell < width; cell++) {
    const at = ((cell + 0.5) / width) * total
    let passed = 0
    const segment = segments.find(s => (passed += s.ms) >= at) ?? segments.at(-1)

    if (segment === undefined) {
      continue
    }

    const last = runs.at(-1)

    if (last?.phase === segment.phase) {
      last.cells += 1
    } else {
      runs.push({ phase: segment.phase, cells: 1 })
    }
  }

  return runs
}

/**
 * The box on the desktop (and every surface that draws `Svg`): the jellyfish
 * beside the headline, and SVG for the strip and the bars.
 */
export function drawDesktop(ui: WebElements, v: View, below: RenderElement): RenderElement {
  const { Box, Text, Button, Svg } = ui
  const { headline, palette, beat } = v
  const { phase } = headline
  const { listed, unlisted, shown, hidden, maxMs, strip } = layoutOf(v)
  const elapsed = elapsedOf(v)
  const toolGlyph = toolGlyphOf(headline.tool)
  const width = Math.max(140, Math.min(480, v.bodyColumns * 8 - 200))

  // A beat belongs to the phase it happened in, so its one-shot plays once.
  const halo = beat?.kind === 'flash' && beat.atMs >= headline.sinceMs
    ? { id: beat.id, color: palette.outcomeHex[beat.outcome] }
    : null
  const sparkle = beat?.kind === 'done' && phase === 'idle'
    ? { id: beat.id, color: palette.shimmer[3] ?? palette.hex.writing }
    : null

  const jelly = jellySvg({ phase, level: v.level, color: palette.hex[phase], halo, sparkle, size: 44 })

  const stripRow = strip.length > 0
    ? [<Svg key="strip" source={stripSvg(strip, p => palette.hex[p], width, v.level)} alt={`The turn so far: ${stripAlt(strip)}`} width={width} height={6} />]
    : []

  const agentRows = listed.map((agent, i) => {
    const color = agentColorOf(palette, agent.name)
    const isLast = i === listed.length - 1 && unlisted === 0
    const heat = heatOf(palette, v.nowMs - agent.sinceMs)

    return (
      <Box key={`agent-${i}`} flexDirection="row">
        <Box flexShrink={0}>
          <Text dimColor>{isLast ? '└─ ' : '├─ '}</Text>
          <Text color={color}>◆ </Text>
        </Box>
        <Text weight="semibold" color={color} wrap="truncate-end">{printable(agent.name, MAX_AGENT_NAME_CHARS)}</Text>
        <Text wrap="truncate-end">{` › ${printable(agent.label, MAX_LABEL_CHARS)}`}</Text>
        <Box flexShrink={0}>
          <Text tabular color={heat} dimColor={heat === undefined}>{`  ${durationOf(v.nowMs - agent.sinceMs)}`}</Text>
        </Box>
      </Box>
    )
  })

  const moreAgents = unlisted > 0 ? [<Text dimColor>{`└─ … ${plural(unlisted, 'more agent')}`}</Text>] : []
  const teamBox = agentRows.length > 0
    ? [<Box key="agents" flexDirection="column">{agentRows}{moreAgents}</Box>]
    : []

  const historyRows = shown.map((entry, i) => {
    const { mark, color } = markOf(v, entry)
    const isQuiet = entry.kind === 'thought' || entry.kind === 'end'
    const took = entry.durationMs === null ? '' : `  ${durationOf(entry.durationMs)}`
    const glyphOfTool = toolGlyphOf(entry.tool)
    const share = (entry.durationMs ?? 0) / maxMs
    const full = printable(entry.label, MAX_CARD_CHARS)

    return (
      <Box key={`row-${i}`} flexDirection="row" alignItems="center" gap={1} hover={{ scope: `row-${i}` }}>
        <Box flexShrink={0}>
          <Text color={color}>{mark}</Text>
          {glyphOfTool === '' ? [] : [<Text color={palette.phase.tool}>{` ${glyphOfTool}`}</Text>]}
        </Box>
        <Text weight={entry.kind === 'turn' ? 'semibold' : 'regular'} dimColor={isQuiet} wrap="truncate-end">
          {printable(entry.label, MAX_LABEL_CHARS)}
        </Text>
        <Box flexShrink={0} flexDirection="row" alignItems="center" gap={1}>
          <Text tabular dimColor>{took}</Text>
          {hasBar(entry)
            ? [<Svg key={`bar-${i}`} source={barSvg(share, colorHexOf(v, entry), 48)} alt={`${Math.round(share * 100)}% of the longest`} width={48} height={6} />]
            : []}
        </Box>
        {full.length > CARD_FROM_CHARS ? [card(Box, Text, `row-${i}`, full, color)] : []}
      </Box>
    )
  })

  const earlier = hidden > 0 ? [<Text dimColor>{`… ${hidden} earlier`}</Text>] : []
  const empty = v.entries.length === 0 ? [<Text dimColor>No actions yet</Text>] : []
  const body = v.isOpen
    ? [<Box key="history" flexDirection="column" marginTop={1}>{earlier}{historyRows}{empty}</Box>]
    : []

  const fullLabel = printable(headline.label, MAX_CARD_CHARS)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" gap={1} borderStyle="round" borderColor={borderOf(v)} paddingX={1} alignSelf="flex-start">
        <Svg key="jelly" source={jelly} alt={`Claude is ${phaseWords(phase)}`} width={44} height={44} />
        <Box flexDirection="column" flexShrink={1} gap={0}>
          <Box key="activity" flexDirection="row" alignItems="center" hover={{ scope: 'headline' }}>
            <Button key="toggle" plain label={v.isOpen ? '▾' : '▸'} onPress={v.onToggle} />
            <Box flexShrink={0}>
              <Text weight="semibold" color={palette.brand}>{' Claude: '}</Text>
              {toolGlyph === '' ? [] : [<Text color={palette.phase[phase]}>{`${toolGlyph} `}</Text>]}
            </Box>
            <Text wrap="truncate-end">{printable(headline.label, MAX_LABEL_CHARS)}</Text>
            <Box flexShrink={0}>
              {headline.meter === undefined ? [] : [<Text color={palette.phase[phase]}>{` ${headline.meter}`}</Text>]}
              <Text tabular color={elapsed.color} dimColor={elapsed.color === undefined}>{elapsed.text}</Text>
            </Box>
          </Box>
          {fullLabel.length > CARD_FROM_CHARS ? [card(Box, Text, 'headline', fullLabel, borderOf(v))] : []}
          {stripRow}
          {teamBox}
          {body}
        </Box>
      </Box>
      {below}
    </Box>
  )
}

function colorHexOf(v: View, entry: ActivityEntry): string {
  return entry.kind === 'thought'
    ? v.palette.hex.thinking
    : entry.kind === 'reply'
      ? v.palette.hex.writing
      : v.palette.outcomeHex[entry.outcome]
}

function stripAlt(strip: readonly { phase: ActivityPhase; ms: number }[]): string {
  return strip.map(s => `${phaseWords(s.phase)} ${durationOf(s.ms)}`).join(', ')
}

function phaseWords(phase: ActivityPhase): string {
  switch (phase) {
    case 'idle':
      return 'idle'
    case 'requesting':
      return 'reading'
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'writing the reply'
    case 'composing':
      return 'writing a tool call'
    case 'tool':
      return 'running a tool'
    case 'agent':
      return 'running an agent'
    case 'approval':
      return 'waiting for your approval'
    case 'question':
      return 'waiting for your answer'
    case 'compacting':
      return 'compacting'
  }
}
