/** The model and effort the main loop last ran, as the header shows them. */
export type ArsenalRunning = {
  /** As the engine gave it: a resolved id (`claude-opus-5-5`) or `/model`'s alias (`opus`). */
  model: string
  /** `low` … `max`, a number written out, or null for a model without effort. */
  effort: string | null
}

/** Which tools this session has, from $.command.list() at session start. */
export type ArsenalTools = { better: boolean; report: boolean }

declare module 'claude-code' {
  interface PluginState {
    arsenal: {
      isOpen: boolean
      running: ArsenalRunning | null
      tools: ArsenalTools
      /** One line under the menu: what the last press ran or queued, or why it failed. */
      note: string
    }
  }
}
