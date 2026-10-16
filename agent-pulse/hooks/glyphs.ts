import type { ActivityPhase } from '../types'

/** A one-cell mark per tool, Unicode symbols that keep the box aligned. */
export function toolGlyphOf(tool: string | undefined): string {
  if (tool === undefined) {
    return ''
  }

  if (tool.startsWith('mcp__')) {
    return '⧉'
  }

  switch (tool) {
    case 'Read':
      return '◧'
    case 'Edit':
    case 'NotebookEdit':
      return '✎'
    case 'Write':
      return '✚'
    case 'Bash':
    case 'PowerShell':
      return '❯'
    case 'Grep':
      return '⌕'
    case 'Glob':
      return '✱'
    case 'WebFetch':
    case 'WebSearch':
      return '⌁'
    case 'Agent':
    case 'Task':
      return '◆'
    case 'TodoWrite':
      return '☰'
    case 'AskUserQuestion':
      return '?'
    case 'Skill':
      return '✦'
    default:
      return '•'
  }
}

/** A spinner: its frames, one cell each, and how long each shows. */
export type Spinner = { frames: readonly string[]; ms: number }

const BRAILLE: Spinner = { frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], ms: 80 }

/** The status glyph's animation in each phase; idle stands still. */
export const SPINNERS: Record<ActivityPhase, Spinner> = {
  idle: { frames: ['○'], ms: 1000 },
  requesting: { frames: ['◐', '◓', '◑', '◒'], ms: 140 },
  thinking: { frames: ['·', '∘', '○', '◎', '●', '◎', '○', '∘'], ms: 130 },
  writing: { frames: ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿', '⣷', '⣶', '⣦', '⣤', '⣄'], ms: 90 },
  composing: { frames: ['▖', '▘', '▝', '▗'], ms: 110 },
  tool: BRAILLE,
  agent: BRAILLE,
  approval: { frames: ['●', '◉', '○', '◉'], ms: 260 },
  question: { frames: ['?', '?', ' ', '?'], ms: 260 },
  compacting: { frames: ['⣿', '⣶', '⣤', '⣀', '⣤', '⣶'], ms: 150 },
}

const LEVELS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

/**
 * A one-cell meter on a log scale: `▁` for a little, `█` from `full` on.
 *
 * @param amount the count so far (words, characters)
 * @param full the count that fills it
 */
export function meterOf(amount: number, full: number): string {
  if (amount <= 0) {
    return ''
  }

  const share = Math.log1p(amount) / Math.log1p(full)

  return LEVELS[Math.min(LEVELS.length - 1, Math.floor(share * LEVELS.length))] ?? '█'
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const

/**
 * A bar `width` cells wide at most, filled to `share` in eighths of a cell;
 * anything above nothing shows at least a sliver.
 */
export function barOf(share: number, width: number): string {
  const eighths = Math.max(share > 0 ? 1 : 0, Math.round(Math.min(1, Math.max(0, share)) * width * 8))

  return '█'.repeat(Math.floor(eighths / 8)) + EIGHTHS[eighths % 8]
}
