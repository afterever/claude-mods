/** The model and effort the main loop last ran, as the header shows them. */
export type ArsenalRunning = {
  /** As the engine gave it: a resolved id (`claude-opus-5-5`) or `/model`'s alias (`opus`). */
  model: string
  /** `low` … `max`, a number written out, or null for a model without effort. */
  effort: string | null
}

/** Which tools this session has, from $.command.list() at session start. */
export type ArsenalTools = { 'prompt-upgrade': boolean; 'work-report': boolean }

/** One of the person's own commands, as a row shows it. */
export type OwnCommand = { name: string; description: string; takesArgs: boolean }

/** What the last scan found, by section, each sorted by name. */
export type ArsenalOwn = { user: OwnCommand[]; project: OwnCommand[] }

/** The names turned off in edit mode. `project` is keyed by the project key (the repo's shared `.git` folder). */
export type ArsenalOff = { user: string[]; project: Record<string, string[]> }

/** The sound notifications' two settings. `sound` is a name from the list; empty means the default. */
export type ArsenalChime = { isOn: boolean; sound: string }

declare module 'claude-code' {
  interface PluginState {
    arsenal: {
      isOpen: boolean
      running: ArsenalRunning | null
      tools: ArsenalTools
      /** One line under the menu: what the switch sent or ran, or why a press failed. */
      note: string
      own: ArsenalOwn
      off: ArsenalOff
      /** The section in edit mode, if any. */
      editing: 'user' | 'project' | null
      /** The key into `off.project` for this session's repo, from the last scan. */
      projectKey: string
    }
  }
}
