import { describe, expect, it } from 'vitest'
import { LAYER_NAMES } from '../engine/catalog'
import type { Layer } from '../engine/types'
import { SHAPE_BOX, cropShape, partColor, shapeHeight, shapeSvg, type Part } from './shapes'

const LAYERS = Object.keys(LAYER_NAMES) as Layer[]
const STAGES = [0, 1, 2, 3, 4]
/** Every look a crop can have: its five stages, then the tree. */
const looks = (layer: Layer): (readonly Part[])[] => [...STAGES.map((s) => cropShape(layer, s, false)), cropShape(layer, 4, true)]

/** The pixels a shape covers, whatever their colour: what the eye reads from across the map. */
function outline(parts: readonly Part[]): Set<string> {
  const out = new Set<string>()
  for (const p of parts) for (let x = p.x; x < p.x + p.w; x++) for (let y = p.y; y < p.y + p.h; y++) out.add(x + ',' + y)
  return out
}
const differing = (a: Set<string>, b: Set<string>): number => [...a].filter((k) => !b.has(k)).length + [...b].filter((k) => !a.has(k)).length
const width = (parts: readonly Part[]): number => Math.max(...parts.map((p) => p.x + p.w)) - Math.min(...parts.map((p) => p.x))
const depth = (parts: readonly Part[]): number => Math.max(...parts.map((p) => p.y + p.h)) - Math.min(...parts.map((p) => p.y))
const pairs = LAYERS.flatMap((a, i) => LAYERS.slice(i + 1).map((b) => [a, b] as const))

describe('cropShape', () => {
  it('draws every layer at every stage, inside the space a tile gives a crop', () => {
    for (const layer of LAYERS) for (const parts of looks(layer)) {
      expect(parts.length, layer).toBeGreaterThan(0)
      for (const p of parts) {
        expect(p.w > 0 && p.h > 0, layer).toBe(true)
        expect(p.x, layer).toBeGreaterThanOrEqual(SHAPE_BOX.left)
        expect(p.x + p.w - 1, layer).toBeLessThanOrEqual(SHAPE_BOX.right)
        expect(p.y, layer).toBeGreaterThanOrEqual(SHAPE_BOX.top)
        expect(p.y + p.h - 1, layer).toBeLessThanOrEqual(SHAPE_BOX.bottom)
      }
    }
  })

  it('never makes a crop look smaller when it grows', () => {
    for (const layer of LAYERS) {
      const sizes = looks(layer).map((parts) => outline(parts).size)
      const heights = looks(layer).map(shapeHeight)
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i], layer + ' look ' + i).toBeGreaterThan(sizes[i - 1] ?? 0)
        expect(heights[i], layer + ' look ' + i).toBeGreaterThanOrEqual(heights[i - 1] ?? 0)
      }
    }
  })

  it('gives no two layers the same outline once a crop is past a sprout', () => {
    for (const [a, b] of pairs) for (const stage of [1, 2, 3]) {
      expect(differing(outline(cropShape(a, stage, false)), outline(cropShape(b, stage, false))), a + ' and ' + b + ' at stage ' + stage).toBeGreaterThan(0)
    }
  })

  it('makes grown crops of different layers easy to tell apart', () => {
    for (const [a, b] of pairs) for (const tree of [false, true]) {
      expect(differing(outline(cropShape(a, 4, tree)), outline(cropShape(b, 4, tree))), a + ' and ' + b).toBeGreaterThanOrEqual(12)
    }
  })

  it('stands the canopy tallest and lays ground cover flat', () => {
    for (const tree of [false, true]) {
      const canopy = shapeHeight(cropShape('canopy', 4, tree))
      for (const layer of LAYERS) if (layer !== 'canopy') expect(shapeHeight(cropShape(layer, 4, tree)), layer).toBeLessThan(canopy)
    }
    for (const parts of looks('ground-cover').slice(2)) expect(width(parts)).toBeGreaterThanOrEqual(2 * depth(parts))
    // A root crop is a mound: wider at the ground than anywhere above it.
    for (const parts of looks('root')) {
      const ground = parts.filter((p) => p.tone === 'earth')
      expect(ground.length).toBeGreaterThan(0)
      expect(width(ground)).toBe(width(parts))
    }
  })

  it('puts fruit on a ripe crop and on a tree, and on nothing younger', () => {
    const fruit = (parts: readonly Part[]): boolean => parts.some((p) => p.tone === 'fruit')
    for (const layer of LAYERS) {
      for (const stage of [0, 1, 2, 3]) expect(fruit(cropShape(layer, stage, false)), layer + ' ' + stage).toBe(false)
      expect(fruit(cropShape(layer, 4, false)), layer).toBe(true)
      expect(fruit(cropShape(layer, 4, true)), layer).toBe(true)
    }
  })

  it('keeps wood, poles and earth still in the wind', () => {
    for (const layer of LAYERS) for (const parts of looks(layer)) for (const p of parts) {
      if (p.tone === 'wood' || p.tone === 'pole' || p.tone === 'earth') expect(p.sway, layer).toBe(false)
    }
  })

  it('draws a tree the same whatever stage it was harvested from, and reads a stage outside 0 to 4 as the nearest one', () => {
    expect(cropShape('vine', 0, true)).toEqual(cropShape('vine', 4, true))
    expect(cropShape('herb', 9, false)).toEqual(cropShape('herb', 4, false))
    expect(cropShape('herb', -3, false)).toEqual(cropShape('herb', 0, false))
    expect(cropShape('herb', 2.7, false)).toEqual(cropShape('herb', 2, false))
    expect(cropShape('herb', Number.NaN, false)).toEqual(cropShape('herb', 0, false))
    expect(cropShape('herb', Number.POSITIVE_INFINITY, false)).toEqual(cropShape('herb', 4, false))
    expect(cropShape('herb', Number.NEGATIVE_INFINITY, false)).toEqual(cropShape('herb', 0, false))
  })
})

describe('shapeHeight', () => {
  it('is how far the shape rises above the ground', () => {
    expect(shapeHeight([{ x: 0, y: -5, w: 1, h: 5, tone: 'mid', sway: true }, { x: -1, y: -2, w: 3, h: 3, tone: 'earth', sway: false }])).toBe(5)
    expect(shapeHeight([])).toBe(0)
  })
})

describe('partColor', () => {
  it('paints fruit in the colour of the field', () => {
    expect(partColor('fruit', '#B089D6', false)).toBe('#B089D6')
  })

  it('turns the leaves of a wilted crop brown and takes its fruit away', () => {
    for (const tone of ['dark', 'mid', 'light'] as const) expect(partColor(tone, '#B089D6', true)).not.toBe(partColor(tone, '#B089D6', false))
    expect(partColor('fruit', '#B089D6', true)).toBeNull()
    expect(partColor('shine', '#B089D6', true)).toBeNull()
  })

  it('leaves wood, poles and earth as they are when a crop wilts', () => {
    for (const tone of ['wood', 'pole', 'earth'] as const) expect(partColor(tone, '#B089D6', true)).toBe(partColor(tone, '#B089D6', false))
  })
})

describe('shapeSvg', () => {
  const tree = cropShape('canopy', 4, true)

  it('draws a crop as a picture with one rectangle for each part', () => {
    const svg = shapeSvg(tree, '#B089D6')
    expect(svg.startsWith('<svg ') && svg.endsWith('</svg>')).toBe(true)
    expect(svg.split('<rect ').length - 1).toBe(tree.length)
    expect(svg).toContain('fill="#B089D6"')
    // The words beside it name the layer, so a screen reader skips the picture.
    expect(svg).toContain('aria-hidden="true"')
  })

  it('is as tall as the crop and sized by the scale', () => {
    const svg = shapeSvg(tree, '#B089D6', 2)
    expect(svg).toContain('height="' + shapeHeight(tree) * 2 + '"')
    expect(shapeSvg(cropShape('ground-cover', 4, true), '#B089D6', 2)).toContain('height="' + shapeHeight(cropShape('ground-cover', 4, true)) * 2 + '"')
  })

  it('never lets a field colour break out of the picture', () => {
    const svg = shapeSvg(tree, '"><script>alert(1)</script>')
    expect(svg).not.toContain('script')
    expect(svg.split('<rect ').length - 1).toBe(tree.length)
  })
})
