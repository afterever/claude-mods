import { test, expect } from 'claude-code/testing'

import { levelOf, mix, paletteOf, resolveLook, shadeOf, shimmerOf } from './palette'

test('the palettes still match the values copied from Agent-Pulse', async () => {
  expect(paletteOf('ember').hex.agent).toBe('#8cc7b5')
  expect(paletteOf('ember').glow.agent).toBe('#b6d99a')
  expect(paletteOf('neon').hex.agent).toBe('#4ade80')
  expect(paletteOf('claude').phase.tool).toBe('claude')
  expect(paletteOf('mono').outcome.ok).toBe('success')
  expect(paletteOf('ember').outcome.ok).toBe('#8fd694')
  expect(paletteOf('nonsense').hex.agent).toBe(paletteOf('ember').hex.agent)
})

test('a flat palette follows the theme, a two-stop palette is hex', async () => {
  expect(shadeOf(paletteOf('mono'), 'agent', 0.5)).toBe('text')
  expect(shimmerOf(paletteOf('mono'), 'agent')).toEqual(['text'])
  expect(shadeOf(paletteOf('ember'), 'agent', 0)).toBe('#8cc7b5')
  expect(shadeOf(paletteOf('ember'), 'agent', 1)).toBe('#b6d99a')
  expect(shimmerOf(paletteOf('ember'), 'agent')).toHaveLength(12)
})

test('mix runs from one colour to the other', async () => {
  expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
  expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  expect(mix('#000000', '#ffffff', 7)).toBe('#ffffff')
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
