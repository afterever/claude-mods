import { test, expect } from 'claude-code/testing'

// @ts-ignore plain JavaScript, shared with the module
import { paletteOf, levelOf, mix, shadeOf, shimmerOf, agentColorOf, rolesOf, resolveLook } from './palette.mjs'

test('the palettes still match the values copied from Agent-Pulse', async () => {
  expect(paletteOf('ember').hex.tool).toBe('#d97757')
  expect(paletteOf('ember').glow.tool).toBe('#f3a97c')
  expect(paletteOf('neon').hex.tool).toBe('#22e5f0')
  expect(paletteOf('claude').phase.tool).toBe('claude')
  expect(paletteOf('mono').outcome.ok).toBe('success')
  expect(paletteOf('nonsense').hex.tool).toBe(paletteOf('ember').hex.tool)
})

test('a flat palette follows the theme, a two-stop palette is hex', async () => {
  expect(shadeOf(paletteOf('claude'), 'tool', 0.5)).toBe('claude')
  expect(shimmerOf(paletteOf('claude'), 'tool')).toEqual(['claude'])
  expect(shadeOf(paletteOf('ember'), 'tool', 0)).toBe('#d97757')
  expect(shadeOf(paletteOf('ember'), 'tool', 1)).toBe('#f3a97c')
  expect(shimmerOf(paletteOf('ember'), 'tool')).toHaveLength(12)
})

test('mix runs from one colour to the other', async () => {
  expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
  expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
})

test('an agent keeps its colour, the same one Agent-Pulse gives it', async () => {
  const p = paletteOf('ember')
  expect(agentColorOf(p, 'reviewer')).toBe(agentColorOf(p, 'reviewer'))
  expect(p.agents).toContain(agentColorOf(p, 'reviewer'))
})

test('the roles map onto the palette\'s phase colours', async () => {
  const r = rolesOf('ember')
  expect(r.done(0)).toBe('#d97757')
  expect(r.pending).toBe('#857a74')
  expect(r.attention).toBe('#ffcf5c')
  expect(r.ok).toBe('#8fd694')
  expect(r.hex.done).toBe('#d97757')
  expect(r.hex.glow).toBe('#f3a97c')
  // an unknown name falls back to ember
  expect(rolesOf('x').name).toBe('ember')
})

test('follow takes Agent-Pulse\'s palette and animation', async () => {
  const rows = [{ key: 'agent-pulse.palette', value: 'neon' }, { key: 'agent-pulse.animation', value: 'full' }]
  expect(resolveLook({ palette: 'follow', animation: 'follow' }, rows)).toEqual({ palette: 'neon', level: 'full' })
})

test('follow without Agent-Pulse falls back to ember and subtle', async () => {
  expect(resolveLook({ palette: 'follow', animation: 'follow' }, [])).toEqual({ palette: 'ember', level: 'subtle' })
  expect(resolveLook(undefined, undefined)).toEqual({ palette: 'ember', level: 'subtle' })
  // a value Agent-Pulse could never hold does not break the look
  expect(resolveLook({ palette: 'follow' }, [{ key: 'agent-pulse.palette', value: 'plaid' }])).toEqual({ palette: 'ember', level: 'subtle' })
})

test('an explicit value wins over the link, each setting on its own', async () => {
  const rows = [{ key: 'agent-pulse.palette', value: 'neon' }, { key: 'agent-pulse.animation', value: 'full' }]
  expect(resolveLook({ palette: 'mono', animation: 'follow' }, rows)).toEqual({ palette: 'mono', level: 'full' })
  expect(resolveLook({ palette: 'follow', animation: 'off' }, rows)).toEqual({ palette: 'neon', level: 'off' })
})

test('levelOf keeps subtle for anything unknown', async () => {
  expect(levelOf('off')).toBe('off')
  expect(levelOf('full')).toBe('full')
  expect(levelOf('loud')).toBe('subtle')
})
