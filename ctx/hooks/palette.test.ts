import { test, expect } from 'claude-code/testing'

import { breath, categoryTints, heatKeys, paletteOf, resolveLook, sparkColors, waterOf, type Look } from './palette'

const row = (name: string, color = 'promptBorder') => ({ name, color, kind: 'used' })
const LISTED = ['Messages', 'System prompt', 'System tools', 'MCP tools', 'Memory files', 'Skills', 'Custom agents']

test("the palettes are agent-pulse's", () => {
  expect(paletteOf('ember').hex.tool).toBe('#d97757')
  expect(paletteOf('neon').glow.thinking).toBe('#ff8ad8')
  expect(paletteOf('claude').phase.tool).toBe('claude')
  expect(paletteOf('nope')).toBe(paletteOf('ember'))
})

test('resolveLook follows agent-pulse, else ember/subtle', () => {
  const rows = [
    { key: 'agent-pulse.palette', value: 'neon' },
    { key: 'agent-pulse.animation', value: 'full' },
  ]
  expect(resolveLook({ palette: 'follow', animation: 'follow' }, rows)).toEqual({ palette: 'neon', level: 'full' })
  expect(resolveLook({ palette: 'follow', animation: 'follow' }, undefined)).toEqual({ palette: 'ember', level: 'subtle' })
  expect(resolveLook({ palette: 'mono', animation: 'off' }, rows)).toEqual({ palette: 'mono', level: 'off' })
  // two installs of agent-pulse: the first row wins
  const two = [
    { key: 'agent-pulse.palette', value: 'claude' },
    { key: 'agent-pulse.palette', value: 'ember' },
  ]
  expect(resolveLook({}, two).palette).toBe('claude')
})

test('every listed category gets its own hex in ember and neon', () => {
  for (const palette of ['ember', 'neon'] as const) {
    const t = categoryTints({ palette, level: 'subtle' }, LISTED.map(n => row(n)))
    const cores = LISTED.map(n => t[n]!.core)
    expect(cores.every(c => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
    expect(new Set(cores).size).toBe(LISTED.length)
  }
})

test('the mapping is the design table', () => {
  const p = paletteOf('ember')
  const t = categoryTints({ palette: 'ember', level: 'subtle' }, LISTED.map(n => row(n)))
  expect(t['Messages']).toEqual({ core: p.hex.tool, glow: p.glow.tool })
  expect(t['System prompt']!.core).toBe(p.hex.requesting)
  expect(t['System tools']!.core).toBe(p.hex.composing)
  expect(t['MCP tools']!.core).toBe(p.hex.agent)
  expect(t['Memory files']!.core).toBe(p.hex.writing)
  expect(t['Skills']!.core).toBe(p.hex.thinking)
})

test('a category keeps its colour when another comes or goes', () => {
  const look: Look = { palette: 'ember', level: 'subtle' }
  const few = categoryTints(look, [row('System prompt'), row('Messages')])
  const more = categoryTints(look, [row('System prompt'), row('Skills'), row('Messages'), row('Custom agents'), row('Plugin stuff')])
  expect(more['Messages']).toEqual(few['Messages'])
  expect(more['System prompt']).toEqual(few['System prompt'])
  // an unlisted name gets a colour nobody else has
  const cores = Object.values(more).map(x => x.core)
  expect(new Set(cores).size).toBe(cores.length)
})

test('claude and mono keep the engine colours, and have no water', () => {
  expect(categoryTints({ palette: 'claude', level: 'subtle' }, [row('Messages', 'permission')])['Messages']).toEqual({
    core: 'permission',
    glow: 'permission',
  })
  expect(categoryTints({ palette: 'mono', level: 'full' }, [row('Messages', 'permission')])['Messages']!.core).toBe('permission')
  expect(waterOf({ palette: 'mono', level: 'full' })).toBeUndefined()
  expect(waterOf({ palette: 'claude', level: 'full' })).toBeUndefined()
  expect(waterOf({ palette: 'ember', level: 'off' })).toEqual({ water: '#9fa8e0', foam: '#c79bd9' })
})

test('breath rises and falls; a theme key holds still', () => {
  const b = breath('#ff5c5c')
  expect(b.length).toBe(20)
  expect(b[10]).toBe('#ff5c5c')
  // a cycle: dim at 0, as bright at 1 as at 19
  expect(b[1]).toBe(b[19]!)
  expect(b[0]).not.toBe('#ff5c5c')
  expect(breath('error')).toEqual(['error'])
})

test('heat: the palette scale in ember and neon, the theme keys of 0.7 in claude and mono', () => {
  expect(heatKeys({ palette: 'ember', level: 'subtle' })).toEqual(['#f6d36b', '#ff9a4d', '#ff5c5c'])
  expect(heatKeys({ palette: 'claude', level: 'subtle' })).toEqual(['warning', 'warning', 'error'])
  expect(heatKeys({ palette: 'mono', level: 'off' })).toEqual(['warning', 'warning', 'error'])
})

test('sparkColors shades a dimmed core to the glow; none for a theme key', () => {
  const c = sparkColors({ palette: 'ember', level: 'subtle' }, { core: '#d97757', glow: '#f3a97c' }, 5)!
  expect(c).toHaveLength(5)
  expect(c[4]).toBe('#f3a97c')
  expect(c[0]).not.toBe('#d97757')
  expect(sparkColors({ palette: 'claude', level: 'subtle' }, { core: 'permission', glow: 'permission' }, 5)).toBeUndefined()
})
