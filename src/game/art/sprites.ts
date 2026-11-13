// The sprite sheet, as the game reads it: where each sprite is (from atlas.json, which `npm run art` writes), which
// sprite a crop is, and how a field's colour is painted into the sheet. Pure: nothing here touches a canvas.
import type { Layer } from '../../engine/types'
import atlas from './atlas.json'

/**
 * A sprite on the sheet. (ax, ay) is the pixel that sits on the top corner of its tile. `top`, `left`, `right` and
 * `bottom` are the box of what is drawn in it: its first and last rows and columns with anything in them.
 */
export interface Sprite { x: number; y: number; w: number; h: number; ax: number; ay: number; top: number; left: number; right: number; bottom: number }

export const SHEET = { width: atlas.width, height: atlas.height }

const ENTRIES: Record<string, number[]> = atlas.sprites

export function sprite(name: string): Sprite | undefined {
  if (!Object.hasOwn(ENTRIES, name)) return undefined
  const [x = 0, y = 0, w = 0, h = 0, ax = 0, ay = 0, top = 0, left = 0, right = w - 1, bottom = h - 1] = ENTRIES[name] ?? []
  return { x, y, w, h, ax, ay, top, left, right, bottom }
}

/**
 * Whether the point (ix, iy) is on what is drawn of a sprite whose tile has its top corner at (sx, sy), or within
 * `margin` pixels of it. It goes by the box of what is drawn, so the empty space round a sprout takes no taps.
 */
export function holds(name: string, sx: number, sy: number, ix: number, iy: number, margin = 0): boolean {
  const s = sprite(name)
  if (!s) return false
  const x = ix - (Math.round(sx) - s.ax), y = iy - (Math.round(sy) - s.ay)
  return x >= s.left - margin && x < s.right + 1 + margin && y >= s.top - margin && y < s.bottom + 1 + margin
}

export const spriteNames = (): string[] => Object.keys(ENTRIES)

/** The six looks of a crop: stages 0 to 4, then the tree. A stage outside 0 to 4 is read as the nearest one. */
export const cropLook = (stage: number, perennial: boolean): number =>
  perennial ? 5 : Number.isNaN(stage) ? 0 : Math.min(4, Math.max(0, Math.floor(stage)))

/** The name of the sprite for a crop of this layer. A wilted crop has a sprite of its own: its leaves gone to straw, its fruit gone. */
export const cropSprite = (layer: Layer, stage: number, perennial: boolean, wilted = false): string =>
  'crop/' + layer + '/' + cropLook(stage, perennial) + (wilted ? '/wilted' : '')

/** The row of a crop's sprite that stands on the ground: a crop's foot is drawn 11 pixels below its tile's top corner. */
const FOOT = 11

/** How far a crop's sprite rises above the ground, in pixels: what floats over it has to clear this. */
export function cropHeight(name: string): number {
  const s = sprite(name)
  return s ? Math.max(0, s.ay + FOOT - s.top + 1) : 0
}

/* ---------- a field's colour ---------- */

/** The colours on the sheet that stand for "the field's own": its light, itself, its shade. */
export const KEYS = { light: [255, 153, 255], base: [255, 0, 255], dark: [153, 0, 153] } as const

const HEX = /^#[0-9A-Fa-f]{6}$/
/** The colour fruit and flags take when a field's own is not a plain hex colour. */
export const FALLBACK_COLOR = '#E0A93E'
/** Fruit in a picture that belongs to no field: the Almanac's legend, the layers on the Readiness sheet. */
export const NEUTRAL_COLOR = '#F4EAD0'

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt((HEX.test(hex) ? hex : FALLBACK_COLOR).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (c: readonly number[], to: number, by: number): [number, number, number] =>
  [0, 1, 2].map((i) => Math.round((c[i] ?? 0) + (to - (c[i] ?? 0)) * by)) as [number, number, number]

/** The three tones a field's colour is painted in: lighter, itself, darker. */
export function tones(color: string): { light: [number, number, number]; base: [number, number, number]; dark: [number, number, number] } {
  const base = rgb(color)
  return { light: mix(base, 255, 0.45), base, dark: mix(base, 0, 0.32) }
}

/**
 * How far from a key colour a pixel may be and still be one. Some browsers add a little noise to what a page reads
 * back from a canvas, so that it cannot be used to tell one visitor from another; a key colour must survive that.
 * Nothing else on the sheet is anywhere near as close.
 */
const KEY_SLACK = 2

/** Repaint every key-coloured pixel of some image data (RGBA, four bytes a pixel) with a field's colour. Changes `data` in place. */
export function paintKeys(data: Uint8ClampedArray | Uint8Array, color: string): void {
  const t = tones(color)
  const near = (v: number | undefined, k: number | undefined): boolean => Math.abs((v ?? 0) - (k ?? 0)) <= KEY_SLACK
  const same = (i: number, k: readonly number[]): boolean => near(data[i], k[0]) && near(data[i + 1], k[1]) && near(data[i + 2], k[2])
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const to = same(i, KEYS.base) ? t.base : same(i, KEYS.light) ? t.light : same(i, KEYS.dark) ? t.dark : null
    if (to) { data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2] }
  }
}

/* ---------- a sprite in a page of text ---------- */

/**
 * A sprite as a small picture for a sheet of text, `scale` screen pixels to each of its own. The picture comes from
 * the page's `--sheet` (the sprite sheet with fruit in a neutral colour), which the game sets once the sheet has loaded.
 * A crop is cut to what is drawn of it, so a sprout does not sit under a column of empty space.
 */
export function iconHtml(name: string, scale = 2): string {
  const s = sprite(name)
  if (!s) return ''
  const h = s.h - s.top
  return '<i class="spr" aria-hidden="true" style="width:' + s.w * scale + 'px;height:' + h * scale + 'px;background-position:-' + s.x * scale + 'px -' + (s.y + s.top) * scale +
    'px;background-size:' + SHEET.width * scale + 'px ' + SHEET.height * scale + 'px"></i>'
}
