// Fails when a mod's version row would say something other than its manifest.
//
// A hooks module cannot read its own plugin.json (no "node:fs", no JSON
// import), so every mod with a pane keeps a copy of its version in
// hooks/version.(ts|mjs) for the pane's last row. A test cannot compare the
// two either, so CI does: this script runs in the "validate manifests" job,
// and by hand from the repo root with `node .github/scripts/check-versions.mjs`.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = process.cwd()
const problems = []
let checked = 0

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifest = join(root, entry.name, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifest)) continue
  const file = ['version.ts', 'version.mjs'].map(f => join(root, entry.name, 'hooks', f)).find(existsSync)
  if (!file) continue // a mod without a pane has no version row to keep right

  const declared = JSON.parse(readFileSync(manifest, 'utf8')).version
  const copy = /export const VERSION = '([^']*)'/.exec(readFileSync(file, 'utf8'))?.[1]
  checked++
  if (copy === undefined) problems.push(`${entry.name}: ${basename(file)} has no "export const VERSION = '…'" line`)
  else if (copy !== declared) problems.push(`${entry.name}: plugin.json says ${declared}, hooks/${basename(file)} says ${copy}`)
}

if (problems.length) {
  console.error(`Version rows out of step with their manifests:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`${checked} mods: the version row matches plugin.json in each`)
