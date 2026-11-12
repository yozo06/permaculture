// What a crop looks like: the rectangles it is made of, by its layer and how far it has grown.
// Pure: the screen only puts them on a tile. Each layer has a shape of its own, so the map says what kind of
// knowledge sits where: a canopy seed grows into a tall tree, a vine climbs a pole, a root is a mound of earth.

import type { Layer } from '../engine/types'

export type Tone = 'dark' | 'mid' | 'light' | 'wood' | 'pole' | 'earth' | 'fruit' | 'shine'

/** One rectangle. `x` is from the middle of the tile and `y` from the ground, so up is negative. */
export interface Part { x: number; y: number; w: number; h: number; tone: Tone; sway: boolean }

/** The space a tile gives a crop, in pixels, both ends included. */
export const SHAPE_BOX = { left: -8, right: 8, top: -24, bottom: -1 }

/** What each tone is painted with. Fruit takes the colour of the crop's field. */
const COLORS: Record<Exclude<Tone, 'fruit'>, string> = {
  dark: '#2E6E22', mid: '#3F8F2E', light: '#5BB83A', wood: '#6B4A2B', pole: '#B8804A', earth: '#A9744A', shine: '#FFFFFF',
}
const WILTED: Partial<Record<Tone, string>> = { dark: '#6E5426', mid: '#8E6E33', light: '#B3924A' }

/** The colour of a part, or null if it is not drawn: a wilted crop carries no fruit. */
export function partColor(tone: Tone, fieldColor: string, wilted: boolean): string | null {
  if (tone === 'fruit') return wilted ? null : fieldColor
  if (tone === 'shine') return wilted ? null : COLORS.shine
  return (wilted ? WILTED[tone] : undefined) ?? COLORS[tone]
}

const leaf = (x: number, y: number, w: number, h: number, tone: Tone = 'light'): Part => ({ x, y, w, h, tone, sway: true })
const still = (x: number, y: number, w: number, h: number, tone: Tone): Part => ({ x, y, w, h, tone, sway: false })
/** A fruit two pixels square, with a glint. */
const fruit = (x: number, y: number): Part[] => [leaf(x, y, 2, 2, 'fruit'), leaf(x, y, 1, 1, 'shine')]

/** Rows of leaves stacked upward from `base`, centred on the tile: dark at the bottom, light at the top. */
function crown(base: number, widths: number[]): Part[] {
  const n = widths.length
  return widths.map((w, i) => leaf(-Math.floor(w / 2), base - i, w, 1, i * 3 < n ? 'dark' : i * 3 < n * 2 ? 'mid' : 'light'))
}
/** A heap of earth on the ground, widest at the bottom. */
const mound = (widths: number[]): Part[] => widths.map((w, i) => still(-Math.floor(w / 2), -1 - i, w, 1, 'earth'))
/** A mat lying flat on the tile, seen from above: `rows` are [y, width], front row first. */
function mat(rows: [number, number][]): Part[] {
  return rows.map(([y, w], i) => still(-Math.floor(w / 2), y, w, 1, i === 0 ? 'dark' : y >= -4 ? 'mid' : 'light'))
}
const fleck = (x: number, y: number, tone: Tone = 'light'): Part => still(x, y, 1, 1, tone)

/** The six looks of each layer: stages 0 to 4, then the tree a harvested crop becomes. */
const LOOKS: Record<Layer, Part[][]> = {
  // A tall trunk under a wide crown.
  canopy: [
    [still(0, -3, 1, 3, 'wood'), ...crown(-3, [3, 1])],
    [still(0, -6, 1, 6, 'wood'), ...crown(-5, [3, 5, 3])],
    [still(-1, -9, 2, 9, 'wood'), ...crown(-7, [5, 9, 9, 7, 3])],
    [still(-1, -12, 2, 12, 'wood'), ...crown(-9, [7, 11, 13, 13, 11, 7])],
    [still(-1, -15, 2, 15, 'wood'), ...crown(-12, [9, 13, 15, 15, 13, 9]), ...fruit(-5, -14), ...fruit(3, -16), ...fruit(-1, -17)],
    [still(-1, -17, 3, 17, 'wood'), ...crown(-13, [9, 13, 15, 15, 15, 15, 13, 9, 5]), ...fruit(-6, -15), ...fruit(4, -16), ...fruit(-2, -19), ...fruit(1, -14)],
  ],
  // A small tree that comes to a point, close to the ground.
  understory: [
    [still(0, -2, 1, 2, 'wood'), ...crown(-3, [3])],
    [still(0, -2, 1, 2, 'wood'), ...crown(-3, [3, 3, 1])],
    [still(0, -3, 1, 3, 'wood'), ...crown(-4, [5, 5, 3, 3, 1])],
    [still(0, -3, 1, 3, 'wood'), ...crown(-4, [5, 7, 7, 5, 5, 3, 1])],
    [still(-1, -3, 2, 3, 'wood'), ...crown(-4, [7, 9, 9, 7, 7, 5, 3, 1]), ...fruit(-3, -6), ...fruit(2, -8)],
    [still(-1, -4, 2, 4, 'wood'), ...crown(-5, [9, 11, 11, 9, 9, 7, 5, 5, 3, 1]), ...fruit(-4, -7), ...fruit(3, -8), ...fruit(-1, -11)],
  ],
  // A round bush sitting on the ground, with no trunk.
  shrub: [
    crown(-1, [3, 3]),
    crown(-1, [5, 7, 5]),
    crown(-1, [7, 9, 9, 7, 3]),
    crown(-1, [9, 11, 11, 11, 9, 5]),
    [...crown(-1, [9, 13, 13, 13, 13, 11, 9, 5]), ...fruit(-5, -4), ...fruit(3, -6), ...fruit(-1, -8)],
    [...crown(-1, [11, 15, 15, 15, 15, 15, 13, 9, 5]), ...fruit(-6, -4), ...fruit(4, -5), ...fruit(-2, -8), ...fruit(1, -3)],
  ],
  // One thin stalk with leaves in pairs.
  herb: [
    [leaf(0, -3, 1, 3, 'mid'), leaf(-2, -3, 2, 1), leaf(1, -4, 2, 1)],
    [leaf(0, -6, 1, 6, 'mid'), leaf(-2, -2, 2, 1, 'dark'), leaf(1, -3, 2, 1, 'dark'), leaf(-3, -4, 3, 1), leaf(1, -5, 3, 1)],
    [leaf(0, -7, 1, 7, 'dark'), leaf(-3, -3, 3, 1, 'mid'), leaf(1, -4, 3, 1, 'mid'), leaf(-3, -5, 3, 1), leaf(1, -6, 3, 1), leaf(-1, -8, 3, 1)],
    [leaf(0, -8, 1, 8, 'dark'), leaf(-4, -3, 4, 1, 'mid'), leaf(1, -4, 4, 1, 'mid'), leaf(-4, -5, 4, 1), leaf(1, -6, 4, 1), leaf(-3, -7, 3, 1), leaf(1, -8, 3, 1), leaf(-1, -9, 3, 1)],
    [
      leaf(0, -9, 1, 9, 'dark'), leaf(-4, -3, 4, 1, 'mid'), leaf(1, -4, 4, 1, 'mid'), leaf(-4, -5, 4, 1), leaf(1, -6, 4, 1), leaf(-3, -7, 3, 1), leaf(1, -8, 3, 1), leaf(-1, -10, 3, 1),
      ...fruit(-4, -6), ...fruit(3, -9), ...fruit(-1, -11),
    ],
    [
      still(0, -11, 1, 11, 'wood'), leaf(-5, -3, 5, 1, 'dark'), leaf(1, -4, 5, 1, 'dark'), leaf(-5, -5, 5, 1, 'mid'), leaf(1, -6, 5, 1, 'mid'),
      leaf(-4, -7, 4, 1), leaf(1, -8, 4, 1), leaf(-3, -9, 3, 1), leaf(1, -10, 3, 1), leaf(-1, -12, 3, 1),
      ...fruit(-5, -6), ...fruit(4, -9), ...fruit(-1, -13),
    ],
  ],
  // A mat spreading flat over the soil.
  'ground-cover': [
    [...mat([[-4, 3]]), fleck(0, -5)],
    mat([[-3, 3], [-4, 7], [-5, 3]]),
    [...mat([[-2, 3], [-3, 7], [-4, 11], [-5, 7], [-6, 3]]), fleck(-2, -4), fleck(2, -3, 'dark')],
    [...mat([[-2, 5], [-3, 9], [-4, 13], [-5, 9], [-6, 5]]), fleck(-3, -4), fleck(3, -3, 'dark'), fleck(1, -5, 'mid')],
    [
      ...mat([[-1, 3], [-2, 7], [-3, 11], [-4, 15], [-5, 11], [-6, 7], [-7, 3]]), fleck(-2, -3, 'dark'), fleck(4, -5, 'mid'),
      fleck(-5, -4, 'fruit'), fleck(2, -3, 'fruit'), fleck(-1, -6, 'fruit'), fleck(4, -4, 'fruit'),
    ],
    [
      ...mat([[-1, 5], [-2, 9], [-3, 13], [-4, 15], [-5, 13], [-6, 9], [-7, 5]]), fleck(-3, -2, 'dark'), fleck(5, -5, 'mid'),
      fleck(-6, -4, 'fruit'), fleck(-2, -3, 'fruit'), fleck(2, -2, 'fruit'), fleck(5, -3, 'fruit'), fleck(-3, -6, 'fruit'), fleck(1, -5, 'fruit'), fleck(0, -7, 'fruit'),
    ],
  ],
  // A mound of earth with a fan of leaves; when ripe, the top of the root shows.
  root: [
    [...mound([3]), leaf(0, -2, 1, 1)],
    [...mound([5, 3]), leaf(0, -4, 1, 2, 'mid'), leaf(-1, -3, 1, 1), leaf(1, -3, 1, 1)],
    [...mound([7, 5]), leaf(0, -5, 1, 3, 'mid'), leaf(-1, -4, 1, 2), leaf(1, -4, 1, 2), leaf(-2, -3, 1, 1, 'dark'), leaf(2, -3, 1, 1, 'dark')],
    [...mound([9, 7, 5]), leaf(0, -6, 1, 3, 'mid'), leaf(-1, -5, 1, 2), leaf(1, -5, 1, 2), leaf(-2, -4, 1, 1, 'dark'), leaf(2, -4, 1, 1, 'dark')],
    [
      ...mound([11, 9, 5]), still(-2, -4, 5, 1, 'fruit'), still(-2, -4, 1, 1, 'shine'),
      leaf(0, -7, 1, 3, 'mid'), leaf(-1, -6, 1, 2), leaf(1, -6, 1, 2), leaf(-2, -5, 1, 1, 'dark'), leaf(2, -5, 1, 1, 'dark'),
    ],
    [
      ...mound([13, 11, 7, 5]), still(-2, -5, 5, 1, 'fruit'), still(-2, -5, 1, 1, 'shine'), still(-5, -3, 2, 1, 'fruit'), still(4, -3, 2, 1, 'fruit'),
      leaf(0, -9, 1, 4, 'mid'), leaf(-1, -8, 1, 3), leaf(1, -8, 1, 3), leaf(-2, -7, 1, 2, 'dark'), leaf(2, -7, 1, 2, 'dark'), leaf(-3, -7, 1, 1, 'dark'), leaf(3, -7, 1, 1, 'dark'),
    ],
  ],
  // A pole with leaves winding up it; the tree is a trellis.
  vine: [
    [still(0, -5, 1, 5, 'pole'), leaf(1, -1, 2, 1), leaf(-1, -2, 1, 1, 'mid')],
    [still(0, -8, 1, 8, 'pole'), leaf(1, -2, 2, 1, 'mid'), leaf(-2, -4, 2, 1), leaf(-1, -1, 1, 1, 'dark')],
    [still(0, -11, 1, 11, 'pole'), leaf(1, -2, 2, 1, 'dark'), leaf(-2, -4, 2, 1, 'mid'), leaf(1, -6, 2, 1, 'mid'), leaf(-2, -8, 2, 1)],
    [still(0, -14, 1, 14, 'pole'), leaf(1, -2, 3, 1, 'dark'), leaf(-3, -4, 3, 1, 'dark'), leaf(1, -6, 3, 1, 'mid'), leaf(-3, -8, 3, 1, 'mid'), leaf(1, -10, 3, 1), leaf(-3, -12, 3, 1)],
    [
      still(0, -14, 1, 14, 'pole'), still(-3, -14, 7, 1, 'pole'),
      leaf(1, -2, 3, 1, 'dark'), leaf(-3, -4, 3, 1, 'dark'), leaf(1, -6, 3, 1, 'mid'), leaf(-3, -8, 3, 1, 'mid'), leaf(1, -10, 3, 1), leaf(-3, -12, 3, 1), leaf(-4, -15, 3, 1), leaf(2, -15, 3, 1),
      ...fruit(-3, -13), ...fruit(2, -13),
    ],
    [
      still(-4, -15, 1, 15, 'pole'), still(4, -15, 1, 15, 'pole'), still(-4, -16, 9, 1, 'pole'), ...crown(-17, [11, 9, 5]),
      leaf(-6, -3, 2, 1, 'dark'), leaf(-3, -5, 2, 1, 'dark'), leaf(-6, -7, 2, 1, 'mid'), leaf(-3, -9, 2, 1, 'mid'), leaf(-6, -11, 2, 1), leaf(-3, -13, 2, 1),
      leaf(5, -3, 2, 1, 'dark'), leaf(2, -5, 2, 1, 'dark'), leaf(5, -7, 2, 1, 'mid'), leaf(2, -9, 2, 1, 'mid'), leaf(5, -11, 2, 1), leaf(2, -13, 2, 1),
      ...fruit(-1, -15), ...fruit(-6, -9), ...fruit(5, -9),
    ],
  ],
}

/** The parts of a crop of this layer. A stage outside 0 to 4 is read as the nearest one; a tree looks the same whatever its stage. */
export function cropShape(layer: Layer, stage: number, perennial: boolean): readonly Part[] {
  const look = perennial ? 5 : Number.isFinite(stage) ? Math.min(4, Math.max(0, Math.floor(stage))) : 0
  return LOOKS[layer][look] ?? []
}

/** How far a shape rises above the ground, in pixels. */
export const shapeHeight = (parts: readonly Part[]): number => Math.max(0, ...parts.map((p) => -p.y))

/** The colour fruit takes when a field's own is not a plain hex colour. */
const FALLBACK_FRUIT = '#E0A93E'

/**
 * A crop as a small picture for a page of text: one sharp-edged rectangle for each part, standing on the bottom edge.
 * `scale` is screen pixels for each pixel of the shape.
 */
export function shapeSvg(parts: readonly Part[], fieldColor: string, scale = 3): string {
  const field = /^#[0-9A-Fa-f]{6}$/.test(fieldColor) ? fieldColor : FALLBACK_FRUIT
  const width = SHAPE_BOX.right - SHAPE_BOX.left + 1
  const height = shapeHeight(parts)
  const rects = parts.map((p) => '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="' + (partColor(p.tone, field, false) ?? field) + '"/>').join('')
  return '<svg class="shape" aria-hidden="true" shape-rendering="crispEdges" width="' + width * scale + '" height="' + height * scale + '" viewBox="' + SHAPE_BOX.left + ' ' + -height + ' ' + width + ' ' + height + '">' + rects + '</svg>'
}
