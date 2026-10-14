/** The six kinds a finished task is sorted into, by the tools it used. */
export type Kind = 'emails' | 'images' | 'code' | 'documents' | 'research' | 'other'

/** One calendar day: how many tasks of each kind, and how many each model did. */
export type DayRecord = {
  kinds: Partial<Record<Kind, number>>
  /** By the model's short name ("Sonnet 5.5"), never by an id. */
  models: Record<string, number>
}

/** What the estimate is worked out from. */
export type Settings = {
  /** What an hour is worth, in dollars. */
  rate: number
  /** Minutes one finished task of each kind saved. */
  minutes: Record<Kind, number>
}

export type Tab = 'today' | 'week' | 'month' | 'year'

declare module 'claude-code' {
  interface PluginState {
    'work-report': {
      /** Day records by local date ("2026-10-13"); mirrors the mod's store. */
      days: Record<string, DayRecord>
      settings: Settings
      /** The tab the pane is on. */
      tab: Tab
    }
  }
}
