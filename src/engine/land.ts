// The shape of the world. Pure geometry: no DOM, no state.
//
// Fields sit on a grid with a 7-tile pitch, filled in "shells" around the first one:
//   slot: 0 1 4 9      (col, row)
//         2 3 5 10
//         6 7 8 11
// A base field is 3x3. The world grows by one shell (7 tiles) when a new ring of slots is opened.

export const PITCH = 7
export const FIELD_SIZE = 3
const ORIGIN = 5

export const BARN = { x: 9, y: 4 }
export const WELL = { x: 15, y: 9 }
export const COMPOST = { x: 15, y: 10 }
export const SIGN = { x: 8, y: 8 }
const BLOCKED = new Set(['9,4', '10,4', '9,5', '10,5', '15,9', '15,10', '8,8'])

export type Terrain = 'soil' | 'path' | 'grass' | 'wild'
export type WildKind = 'tree' | 'bush' | 'rock' | 'grass'
/** pack id -> slot */
export type Fields = Readonly<Record<string, number>>
/** "x,y" -> the pack id of a fenced-in tile, or 'grass' for a cleared one */
export type Cleared = Readonly<Record<string, string>>

export const tileKey = (x: number, y: number): string => x + ',' + y

/** Deterministic pseudo-random number in [0, 1] from a tile and a salt. */
export function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 982451653) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

/** Slot i -> grid cell, in shell order. */
export function slotCell(i: number): { col: number; row: number } {
  const s = Math.floor(Math.sqrt(i))
  const j = i - s * s
  return j < s ? { col: s, row: j } : { col: j - s, row: s }
}

export function fieldOrigin(slot: number): { x0: number; y0: number } {
  const { col, row } = slotCell(slot)
  return { x0: ORIGIN + PITCH * col, y0: ORIGIN + PITCH * row }
}

/** Number of shells needed for these fields; never fewer than two (the Phase 0 farm). */
export function shells(fields: Fields): number {
  let n = 2
  for (const slot of Object.values(fields)) {
    const { col, row } = slotCell(slot)
    n = Math.max(n, Math.max(col, row) + 1)
  }
  return n
}

/** Tiles per side: 20 for up to four fields, 27 for up to nine. */
export const worldSize = (fields: Fields): number => PITCH * shells(fields) + 6

export interface Homestead { lo: number; hi: number }
export const homestead = (fields: Fields): Homestead => ({ lo: 4, hi: PITCH * shells(fields) + 1 })

export function inHomestead(x: number, y: number, fields: Fields): boolean {
  const h = homestead(fields)
  return x >= h.lo && x <= h.hi && y >= h.lo && y <= h.hi
}

const mod = (a: number, n: number): number => ((a % n) + n) % n
const isPathLine = (v: number): boolean => mod(v - 9, PITCH) <= 1

export const isBuildingTile = (x: number, y: number): boolean => BLOCKED.has(tileKey(x, y))

/** The pack whose base 3x3 field covers this tile. */
function baseFieldOf(x: number, y: number, fields: Fields): string | null {
  for (const [pack, slot] of Object.entries(fields)) {
    const { x0, y0 } = fieldOrigin(slot)
    if (x >= x0 && x < x0 + FIELD_SIZE && y >= y0 && y < y0 + FIELD_SIZE) return pack
  }
  return null
}

/** The pack whose field this tile belongs to: its base field, or a tile fenced in for it. */
export function fieldOf(x: number, y: number, fields: Fields, cleared: Cleared): string | null {
  const c = cleared[tileKey(x, y)]
  if (c && c !== 'grass' && Object.hasOwn(fields, c)) return c
  return baseFieldOf(x, y, fields)
}

export function terrain(x: number, y: number, fields: Fields, cleared: Cleared): Terrain {
  if (fieldOf(x, y, fields, cleared)) return 'soil'
  if (cleared[tileKey(x, y)] === 'grass') return 'grass'
  if (inHomestead(x, y, fields)) return isPathLine(x) || isPathLine(y) ? 'path' : 'grass'
  return 'wild'
}

export function wildKind(x: number, y: number): WildKind {
  const v = hash(x, y, 1)
  return v > 0.42 ? 'tree' : v > 0.27 ? 'bush' : v > 0.19 ? 'rock' : 'grass'
}

/** Packs whose field touches this tile on one of its four sides, in the order up, left, right, down. */
export function neighbourFields(x: number, y: number, fields: Fields, cleared: Cleared): string[] {
  const out: string[] = []
  for (const [nx, ny] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]] as const) {
    const f = fieldOf(nx, ny, fields, cleared)
    if (f && !out.includes(f)) out.push(f)
  }
  return out
}

/** Coins to fence a tile in: forest costs more than open ground. */
export const fenceCost = (t: Terrain): number => (t === 'wild' ? 40 : 25)

/** The lowest slot no field uses. */
export function nextFreeSlot(fields: Fields): number {
  const used = new Set(Object.values(fields))
  let i = 0
  while (used.has(i)) i++
  return i
}
