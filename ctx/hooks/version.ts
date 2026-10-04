// The host gives a hooks module no way to read its own manifest (not through
// "node:fs", not as a JSON import), so the pane's footer carries a copy.
// Bump it with plugin.json on every release.
export const VERSION = '0.6.2'
