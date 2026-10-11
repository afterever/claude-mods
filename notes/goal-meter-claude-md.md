# goal-meter line for the global CLAUDE.md

One line in `~/.claude/CLAUDE.md` (Windows: `C:\Users\<user>\.claude\CLAUDE.md`) that makes Claude
feed its task plan to the `goal-meter` tool, so the goal bar tracks multi-step work. Added on
2026-10-11. Set it up once per computer.

## The line

Add this as one bullet under the other global instructions:

```markdown
- **Goal meter:** For multi-step work (3+ steps), load `mcp__goal-meter__tasks` via ToolSearch and call action `plan` before starting, then `start`/`done` each task as you go. Skip it for small single-step requests. Subagents should not call `plan` (it would replace the main agent's pending tasks).
```

## What it does

- **Trigger:** work of 3 or more steps. Small single-step requests skip it.
- **Flow:** load `mcp__goal-meter__tasks`, call `plan` first with every task, then `start` and
  `done` each task as it progresses.
- **Subagents:** they must not call `plan`, because it replaces the main agent's pending tasks.

## Asking Claude on the other computer to add it

Paste this into a Claude Code session there:

> Read `notes/goal-meter-claude-md.md` in the claude-mods repo and add the bullet from "The line"
> to my global `~/.claude/CLAUDE.md`. If a "Goal meter" bullet is already there, update it in
> place instead of adding a second one. Show me the diff before saving.

## Checks

- **Needs the goal-meter mod installed** on that computer. Without it, `mcp__goal-meter__tasks`
  does not exist and the line points at nothing.
- **Edit the file, do not re-create it.** Keep the user's other global instructions as they are.
- **Hard links:** if `CLAUDE.md` is a hard link, an editor that replaces the file breaks the link.
  Write into it in place.
