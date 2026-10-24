// The host gives a hooks module no way to read its own manifest (not through
// "node:fs", not as a JSON import), so the pane's last row carries a copy.
// Bump VERSION with plugin.json on every release, and set RELEASED to the day
// the release is made.
export const VERSION = '0.4.5'
export const RELEASED = '2026-10-24'
