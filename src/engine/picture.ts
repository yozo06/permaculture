// A picture of a farm: what one farmer shows another. It travels inside a link, so it is small, it holds only what
// its owner chose to show, and whatever arrives is read as untrusted: keep what is usable, drop the rest, never throw.
// docs/neighbours.md says what may be in one and why. Everything here is pure; the clock is a parameter.
import type { Catalog } from './catalog'
import { initialState } from './fold'
import { fieldOf, fieldOrigin, isBuildingTile, tileKey, worldSize } from './land'
import { RULES, interval } from './rules'
import type { Crop, FarmState } from './types'
import { isRecord } from './util'

/** A crop in a picture: its seed, its place counted from its own field's corner, the furthest it has ever grown, and 1 if it is a tree. */
export type PictureCrop = [seed: string, east: number, south: number, best: number, tree: 0 | 1]

export interface PictureField {
  pack: string
  /** Fenced tiles, counted from the field's corner. They lie outside its first nine tiles, so a number may be negative. */
  land: [east: number, south: number][]
  crops: PictureCrop[]
}

/** No plot numbers and no map positions: a gap where a hidden field sits would say which field it is. */
export interface Picture {
  code: string
  name: string
  /** The farm's own day. */
  day: number
  /** When the picture was made, in UTC to the second. The later of two pictures of a farm is the one kept. */
  at: string
  /** The version of the game that made it. */
  game: string
  /** The fields the farmer chose to show, in the order of the farm's own plots. */
  fields: PictureField[]
}

/** The limits a picture is read within. A link is written by someone else. */
export const PICTURE_LIMITS = { crops: 400, land: 60, fields: 40, min: -40, max: 45, game: 40 } as const

const CODE = /^[0-9a-z]{13}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const DAY_MS = 24 * 60 * 60 * 1000

/** True for a farm code: 13 characters of 0-9 and a-z. */
export const isFarmCode = (v: unknown): v is string => typeof v === 'string' && CODE.test(v)

/** The UTF-8 bytes of a string. (The engine has no TextEncoder to lean on.) */
function utf8(text: string): number[] {
  const bytes: number[] = []
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return bytes
}

/**
 * A farm's code: the 64-bit FNV-1a hash of the UTF-8 bytes of the id of the first event in its log, in base 36,
 * lower case, padded with zeros to 13 characters. This recipe is permanent: neighbours know a farm by it.
 * It needs no storage, lasts the life of the farm, and travels with an export. Hash the whole id, never a prefix.
 */
export function farmCode(firstEventId: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of utf8(firstEventId)) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn
  return hash.toString(36).padStart(13, '0')
}

/** The moment a picture was made, as the picture holds it: UTC, to the second. */
export const momentOf = (ms: number): string => new Date(ms).toISOString().slice(0, 19) + 'Z'

const byPlace = (a: readonly [number, number], b: readonly [number, number]): number => a[1] - b[1] || a[0] - b[0]

/**
 * The picture of a farm for the fields in `show`. It holds the name, the day, each shown field's fenced land and its
 * crops at the furthest they have grown. Never notes, the journal, the compost heap, coins, energy, the barrel, finds,
 * whether a crop is wilted or where it stands today, or any trace of a field that is not shown.
 */
export function makePicture(s: FarmState, opts: { code: string; at: string; game: string; show: readonly string[] }): Picture {
  const shown = Object.entries(s.fields).filter(([pack]) => opts.show.includes(pack)).sort((a, b) => a[1] - b[1])
  const fields = shown.map(([pack, slot]): PictureField => {
    const { x0, y0 } = fieldOrigin(slot)
    const land: [number, number][] = []
    for (const [key, owner] of Object.entries(s.cleared)) {
      const [x, y] = key.split(',').map(Number)
      if (owner === pack && x !== undefined && y !== undefined) land.push([x - x0, y - y0])
    }
    const crops = s.crops
      .filter((c) => fieldOf(c.x, c.y, s.fields, s.cleared) === pack)
      .map((c): PictureCrop => [c.seed, c.x - x0, c.y - y0, c.perennial ? RULES.maxStage : c.best, c.perennial ? 1 : 0])
    return { pack, land: land.sort(byPlace), crops: crops.sort((a, b) => byPlace([a[1], a[2]], [b[1], b[2]])) }
  })
  return { code: opts.code, name: s.name, day: s.day, at: opts.at, game: opts.game, fields }
}

export interface Reading {
  /** The picture, cleaned: reading it again changes nothing. */
  picture: Picture
  /** Crops left out because this game does not know their seed or their field: they need a newer version of the game. */
  newer: number
  /** Crops left out because they could not be where the picture put them. */
  misfit: number
}

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const place = (v: unknown): v is number => whole(v) && v >= PICTURE_LIMITS.min && v <= PICTURE_LIMITS.max

/**
 * Read something that claims to be a picture. Null if it cannot be one (and that is all a player is told).
 * `nowMs` is this browser's clock: a picture cannot have been made more than a day ahead of it.
 */
export function readPicture(raw: unknown, catalog: Catalog, nowMs: number): Reading | null {
  if (!isRecord(raw) || !isFarmCode(raw.code) || typeof raw.name !== 'string' || !Array.isArray(raw.fields)) return null
  const name = raw.name.trim()
  if (name.length < 1 || name.length > RULES.farmName.max) return null
  if (!whole(raw.day) || raw.day < 1 || raw.day > 1_000_000) return null
  if (typeof raw.at !== 'string' || !MOMENT.test(raw.at)) return null
  const made = Date.parse(raw.at)
  if (!Number.isFinite(made) || made > nowMs + DAY_MS) return null
  if (raw.fields.length > PICTURE_LIMITS.fields) return null
  const listed = (f: unknown): unknown[] => (isRecord(f) && Array.isArray(f.crops) ? f.crops : [])
  if (raw.fields.reduce<number>((n, f) => n + listed(f).length, 0) > PICTURE_LIMITS.crops) return null

  let newer = 0
  let misfit = 0
  const fields: PictureField[] = []
  const seeds = new Set<string>()
  for (const f of raw.fields) {
    if (!isRecord(f) || typeof f.pack !== 'string') continue
    const pack = f.pack
    const crops = listed(f)
    if (!catalog.pack(pack)) { newer += crops.length; continue }
    if (fields.some((x) => x.pack === pack)) { misfit += crops.length; continue }
    const land: [number, number][] = []
    for (const t of Array.isArray(f.land) ? f.land : []) {
      if (land.length >= PICTURE_LIMITS.land) break
      if (!Array.isArray(t) || t.length !== 2 || !place(t[0]) || !place(t[1])) continue
      const [x, y] = [t[0], t[1]]
      if (!land.some((l) => l[0] === x && l[1] === y)) land.push([x, y])
    }
    const kept: PictureCrop[] = []
    for (const c of crops) {
      if (!Array.isArray(c) || c.length !== 5 || typeof c[0] !== 'string' || !whole(c[1]) || !whole(c[2]) || !whole(c[3]) || (c[4] !== 0 && c[4] !== 1)) continue
      const seed = catalog.seed(c[0])
      if (!seed) { newer++; continue }
      const taken = kept.some((k) => k[1] === c[1] && k[2] === c[2])
      if (seed.pack !== pack || seeds.has(seed.id) || taken || !place(c[1]) || !place(c[2]) || c[3] < 0 || c[3] > RULES.maxStage) { misfit++; continue }
      seeds.add(seed.id)
      kept.push([seed.id, c[1], c[2], c[4] === 1 ? RULES.maxStage : c[3], c[4]])
    }
    fields.push({ pack, land, crops: kept })
  }
  const game = typeof raw.game === 'string' ? raw.game.slice(0, PICTURE_LIMITS.game) : ''
  return { picture: { code: raw.code, name, day: raw.day, at: raw.at, game, fields }, newer, misfit }
}

export interface Laid {
  /** A farm the canvas can draw: the picture's fields on plots 0, 1, 2… with their land and crops. Nothing else is filled in. */
  state: FarmState
  /** Crops that could not be put back: their tile did not survive (see below). */
  misfit: number
}

/**
 * Turn a picture into a farm that can be drawn. The listed fields take plots 0, 1, 2… in order, so a farm shown
 * whole comes out exactly as it is, and one with hidden fields closes ranks. A fenced tile is kept unless it is off
 * the map, on a building, or already another field's (the earlier field wins); a tile that lands on a path is kept.
 * A crop is kept if it then stands on a tile of its own pack's field.
 */
export function layOut(p: Picture, catalog: Catalog): Laid {
  const fields: Record<string, number> = {}
  p.fields.forEach((f, slot) => { fields[f.pack] = slot })
  const size = worldSize(fields)
  const cleared: Record<string, string> = {}
  for (const f of p.fields) {
    const { x0, y0 } = fieldOrigin(fields[f.pack] ?? 0)
    for (const [dx, dy] of f.land) {
      const x = x0 + dx
      const y = y0 + dy
      if (x < 0 || y < 0 || x >= size || y >= size || isBuildingTile(x, y) || fieldOf(x, y, fields, cleared) !== null) continue
      cleared[tileKey(x, y)] = f.pack
    }
  }
  let misfit = 0
  const crops: Crop[] = []
  const tiles = new Set<string>()
  for (const f of p.fields) {
    const { x0, y0 } = fieldOrigin(fields[f.pack] ?? 0)
    for (const [seed, dx, dy, best, tree] of f.crops) {
      const x = x0 + dx
      const y = y0 + dy
      const known = catalog.seed(seed)
      if (!known || fieldOf(x, y, fields, cleared) !== known.pack || tiles.has(tileKey(x, y)) || crops.some((c) => c.seed === seed)) { misfit++; continue }
      tiles.add(tileKey(x, y))
      const perennial = tree === 1
      // A neighbour's crop is always drawn healthy, at its best, and never due: none of that is theirs to show.
      crops.push({ seed, x, y, stage: best, best, due: p.day + interval({ perennial, stage: best }), wilted: false, perennial, notes: '', journal: [] })
    }
  }
  return { state: { ...initialState(), name: p.name, day: p.day, fields, cleared, crops }, misfit }
}
