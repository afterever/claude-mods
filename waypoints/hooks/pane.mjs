// When the pane opens and closes by itself. Pure bookkeeping, no engine calls, so the rules
// the design lists (a person's close sticks, an unload's does not) can be tested: the test
// engine cannot raise a ui.close with an origin.
//
// - It opens on a goal's first plan, unless the setting is off, the person closed the pane
//   during this goal, or it is open already.
// - A pane the mod opened is the mod's until the person opens it themselves; the mod closes
//   only its own, once the band has gone.

export function createAutoPane() {
  const closedGoals = new Set() // startedAt of each goal whose pane the person closed
  let owned = false // the mod opened the pane and the person has not taken it over

  return {
    canOpen: (mode, goal, isOpen) => mode !== 'off' && !!goal && !isOpen && !closedGoals.has(goal.startedAt),
    // the mod opened it
    opened: () => {
      owned = true
    },
    // the person asked for it (/waypoints, g): theirs from now on
    takenOver: () => {
      owned = false
    },
    // ui.close arrived: only the person's own close is remembered; a plugin's call or the
    // engine dropping the pane (unload) is not a decision about this goal
    closed: (origin, goal) => {
      owned = false
      if (origin && origin.kind === 'person' && goal) closedGoals.add(goal.startedAt)
    },
    // the band has gone: the mod takes back a pane it opened
    shouldClose: (isOpen, bandUp) => owned && isOpen && !bandUp,
    owns: () => owned,
  }
}
