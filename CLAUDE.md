# claude-mods

## Git workflow

- **Small or documentation-only changes go straight to `master`:** commit and push, no feature
  branch and no pull request. Examples: edits to `SETUP.md`, a README, or any other prose.
- **Use a branch and a pull request for anything larger:** a new mod, a new version of a mod, or
  any change to a mod's code under `hooks/`. This is how `subagent-progress` 2.0.0 and
  `prompt-upgrade` 0.1.0 landed.
- **If unsure which one it is, treat it as larger** and use a branch.
