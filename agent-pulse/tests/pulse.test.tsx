import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { barOf, meterOf } from '../hooks/glyphs'
import { jellySvg } from '../hooks/jelly'
import { heatOf, mix, paletteOf } from '../hooks/palette'

const BAND = {
  plugin: 'agent-pulse',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const DONE = {
  answer: 'All fixed.',
  durationMs: 1000,
  isAborted: false,
  reason: 'answer',
  category: null,
  explanation: null,
} as const

const SURFACES = ['terminal', 'desktop'] as const

type Mounted = Pick<Awaited<ReturnType<Engine['ui']['mount']>>, 'findAll'>

/**
 * The engine beneath: a band, turns, and tools that answer `ok` after
 * `beneath.onTool`, which a test sets to act while a call is in flight.
 */
function seat(on: On, beneath = { onTool: async () => {} }) {
  const clock = mock.clock(on, { now: 1_000_000 })

  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })
  // The dialog is the engine's own node, which a tree there must hold once.
  on('ui.render', { component: 'AskUserQuestion' }, () => ({ type: 'engine', ref: 0 }) as const)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', async () => {
    await beneath.onTool()

    return { result: 'ok', isError: false } as never
  })

  return clock
}

/** An SVG of the drawing by what it says to a reader (the kit keeps no `key` on an Svg). */
async function svgOf(ui: Mounted, alt: RegExp) {
  return (await ui.findAll({ type: 'Svg' })).find(svg => alt.test(String(svg.props['alt'])))
}

async function borderOf(ui: Mounted): Promise<unknown> {
  const boxes = await ui.findAll({ type: 'Box' })

  return boxes.find(box => box.props['borderStyle'] === 'round')?.props['borderColor']
}

describe('every level on every surface', () => {
  for (const animation of ['off', 'subtle', 'full'] as const) {
    test(`${animation}: the box draws idle and working on both surfaces`, { options: { animation } }, async ($, on) => {
      seat(on)

      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })

        expect((await ui.find({ key: 'activity' }))?.text ?? '').toContain('Idle')
        await ui.unmount()
      }

      await $.turn.start({ text: 'fix it', turnId: 't1' })

      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...BAND, surface })

        expect((await ui.find({ key: 'activity' }))?.text ?? '').toContain('Reading your prompt')
        const strip = surface === 'terminal' ? await ui.find({ key: 'strip' }) : await svgOf(ui, /^The turn so far/)

        expect(strip).toBeDefined()
        await ui.unmount()
      }
    })
  }
})

describe('terminal', () => {
  test('off draws a still dot and no animation', { options: { animation: 'off' } }, async ($, on) => {
    seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect((await ui.find({ key: 'activity' }))?.text ?? '').toContain('●')
  })

  test('subtle spins the status glyph on its own clock', { options: { animation: 'subtle' } }, async ($, on) => {
    seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const glyph = 'glyph-requesting'

    expect(await ui.find({ key: glyph, type: 'Client' })).toBeDefined()

    const before = (await ui.find({ type: 'Text', in: glyph }))?.text
    await ui.advance(140)
    const after = (await ui.find({ type: 'Text', in: glyph }))?.text

    expect(before).toBe('◐')
    expect(after).toBe('◓')
  })

  test('the headline is the step alone, with no name before it', { options: { animation: 'full' } }, async ($, on) => {
    seat(on)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })

      expect((await ui.find({ key: 'activity' }))?.text ?? '').not.toContain('Claude')
      await ui.unmount()
    }

    await $.turn.start({ text: 'fix it', turnId: 't1' })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const headline = (await ui.find({ key: 'activity' }))?.text ?? ''

      expect(headline).toContain('Reading your prompt')
      expect(headline).not.toContain('Claude')
      await ui.unmount()
    }
  })

  test('full sparkles once the turn ends', { options: { animation: 'full' } }, async ($, on) => {
    seat(on)
    const { turnId } = await $.turn.start({ text: 'fix it', turnId: 't1' })

    await $.turn.complete({ ...DONE, turnId })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const sparkle = (await ui.findAll({ type: 'Client' })).find(client => client.key?.startsWith('sparkle-'))

    expect(sparkle).toBeDefined()
  })

  test('a finished call flashes the border in its outcome, then lets go', { options: { animation: 'subtle' } }, async ($, on) => {
    const clock = seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.tool.call({ tool: 'Read', file_path: 'src/app.ts' })
    expect(await borderOf(ui)).toBe(paletteOf('claude').outcomeHex.ok)

    await clock.advance(400)
    expect(await borderOf(ui)).toBe('suggestion')
  })

  test('full breathes the border while it waits for approval', { options: { animation: 'full' } }, async ($, on) => {
    const beneath = { onTool: async () => {} }
    const clock = seat(on, beneath)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const seen: unknown[] = []

    beneath.onTool = async () => {
      await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' } })
      await clock.advance(400)
      seen.push(await borderOf(ui))
      await clock.advance(350)
      seen.push(await borderOf(ui))
    }

    await $.turn.start({ text: 'test it', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })

    expect(seen[0]).not.toBe(seen[1])
    expect(String(seen[0])).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('a long step heats its timer', { options: { animation: 'off' } }, async ($, on) => {
    const clock = seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })
    await clock.advance(31_000)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const timer = (await ui.findAll({ type: 'Text' })).find(text => text.text.startsWith(' · 31s'))

    expect(timer?.props['color']).toBe(paletteOf('claude').heat[0])
  })

  test('the neon palette paints the border its own color', { options: { palette: 'neon', animation: 'off' } }, async ($, on) => {
    seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect(await borderOf(ui)).toBe(paletteOf('neon').phase.requesting)
  })
})

describe('desktop', () => {
  test('the jellyfish swims beside the headline, named for the reader', { options: { animation: 'subtle' } }, async ($, on) => {
    seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const jelly = await svgOf(ui, /^Claude is/)

    expect(jelly?.props['alt']).toBe('Claude is reading')
    expect(String(jelly?.props['source'])).toContain('@keyframes')
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
  })

  test('the jellyfish keeps one source while the seconds tick', { options: { animation: 'full' } }, async ($, on) => {
    const clock = seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const before = (await svgOf(ui, /^Claude is/))?.props['source']

    await clock.advance(3000)

    expect(before).toBeDefined()
    expect((await svgOf(ui, /^Claude is/))?.props['source']).toBe(before)
  })

  test('the history draws a duration bar per timed row', { options: { animation: 'off' } }, async ($, on) => {
    seat(on)
    const { turnId } = await $.turn.start({ text: 'fix it', turnId: 't1' })

    await $.tool.call({ tool: 'Read', file_path: 'src/app.ts' })
    await $.turn.complete({ ...DONE, turnId })

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await ui.press({ key: 'toggle' })

    expect(await svgOf(ui, /of the longest$/)).toBeDefined()
  })
})

describe('the question dialog', () => {
  test('the box stays in sight above the dialog, on both surfaces', { options: { animation: 'full' } }, async ($, on) => {
    seat(on)
    await $.turn.start({ text: 'fix it', turnId: 't1' })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({
        plugin: 'agent-pulse',
        surface,
        component: 'AskUserQuestion',
        props: { tool: 'AskUserQuestion', questions: [{ question: 'Color the output?', header: 'Color', options: [], multiSelect: false }] },
      })
      const drawn = await ui.findAll({})
      const boxAt = drawn.findIndex(node => node.key === 'activity')
      const dialogAt = drawn.findIndex(node => node.type === 'engine')

      expect(drawn[boxAt]?.text ?? '').toContain('Reading your prompt')
      expect(dialogAt).toBeGreaterThan(boxAt)
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
      await ui.unmount()
    }
  })
})

describe('pieces', () => {
  test('off keeps the jellyfish still; reduced motion stills every level', async () => {
    const args = { phase: 'tool', color: '#d97757', halo: null, sparkle: null, size: 44 } as const

    expect(jellySvg({ ...args, level: 'off' })).not.toContain('@keyframes')
    expect(jellySvg({ ...args, level: 'full' })).toContain('prefers-reduced-motion')
  })

  test('meters, bars, heat and mixing', async () => {
    expect(meterOf(0, 800)).toBe('')
    expect(meterOf(800, 800)).toBe('█')
    expect(barOf(1, 6)).toBe('██████')
    expect(barOf(0.01, 6)).toBe('▏')
    expect(heatOf(paletteOf('claude'), 10_000)).toBeUndefined()
    expect(heatOf(paletteOf('claude'), 400_000)).toBe('error')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
