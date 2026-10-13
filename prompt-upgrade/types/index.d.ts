/** One multiple-choice question the fast model asked. */
export type UpgradeQuestion = {
  text: string
  /** Two to four short options. */
  options: string[]
}

/** How the person answered one question. */
export type UpgradeAnswer =
  | { kind: 'option'; text: string }
  | { kind: 'other'; text: string }
  | { kind: 'skip' }

/** The upgraded prompt and the short list of details the model added. */
export type UpgradeRewrite = {
  text: string
  added: string[]
}

/**
 * Where an upgrade is. `reading` and `rewriting` wait on a model call; the
 * rest wait on the person.
 */
export type UpgradePhase = 'compose' | 'reading' | 'questions' | 'rewriting' | 'review' | 'error'

/** The upgrade in the pane, from the rough prompt to Run. */
export type UpgradeFlow = {
  /** Names this upgrade; a model call that lands for another id is dropped. */
  id: string
  /** Counts restarts of a step, so a call that lands late is dropped too. */
  attempt: number
  original: string
  phase: UpgradePhase
  questions: UpgradeQuestion[]
  /** One per question, in order; null while it is unanswered. */
  answers: (UpgradeAnswer | null)[]
  /** The question whose "Other" field is open. */
  typing: number | null
  rewrite: UpgradeRewrite | null
  isEditing: boolean
  /** The upgraded text as it stands while editing. */
  draft: string
  /** What the Copy button last did: a line shown beside it. */
  note: '' | 'copied' | 'no-clipboard'
  error: { where: 'questions' | 'rewrite'; message: string } | null
  /** Reopened from the history: nothing to put back in the prompt box. */
  isFromHistory: boolean
}

/** One finished upgrade in the history. */
export type UpgradeHistoryItem = {
  id: string
  at: number
  original: string
  text: string
  added: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-upgrade': {
      flow: UpgradeFlow | null
      /** What the pane shows when no upgrade is open. */
      view: 'flow' | 'history'
      /** Whether typed prompts go to the pane first. */
      auto: boolean
      history: UpgradeHistoryItem[]
    }
  }
}
