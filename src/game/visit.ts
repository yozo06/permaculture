// What the neighbours sheets show, worked out with no DOM: what a farm link will hold, a neighbour's crop seen from
// your own farm, the list of neighbours, and what to say when a link lands.
import { LAYER_NAMES, type Catalog, type Seed } from '../engine/catalog'
import { layOut, makePicture, readPicture, type Picture } from '../engine/picture'
import { earnedLine, heldBy, isEarned } from '../engine/readiness'
import { RULES, available, cropOf, visible } from '../engine/rules'
import type { Crop, FarmState } from '../engine/types'
import { linkHash } from './links'
import { ageText, tooOld, type Arrival, type Book } from './neighbours'
import { needsText, parentName } from './views'

/* ---------- sharing ---------- */

export interface ShareView {
  picture: Picture
  /** The part of the link after the `#`. */
  hash: string
  fields: number
  /** Crops still growing that a neighbour will see, and trees. */
  crops: number
  trees: number
  /** What a neighbour's game will leave out because hidden fields made the shown ones close ranks. */
  lostCrops: number
  lostLand: number
}

/**
 * The picture for the ticked fields, opened the way a neighbour's game would open it, so the Share sheet shows what
 * they will get and not what we meant to send. Null when there is nothing to send: no name yet, or no field ticked.
 */
export function shareView(state: FarmState, show: readonly string[], opts: { code: string; at: string; game: string }, catalog: Catalog, nowMs: number): ShareView | null {
  const picture = makePicture(state, { ...opts, show })
  if (picture.fields.length === 0) return null
  const read = readPicture(JSON.parse(JSON.stringify(picture)), catalog, nowMs)
  if (!read) return null
  const laid = layOut(read.picture, catalog)
  const sent = picture.fields.reduce((n, f) => n + f.crops.length, 0)
  const land = picture.fields.reduce((n, f) => n + f.land.length, 0)
  const trees = laid.state.crops.filter((c) => c.perennial).length
  return {
    picture, hash: linkHash('farm', picture), fields: picture.fields.length,
    crops: laid.state.crops.length - trees, trees,
    lostCrops: sent - laid.state.crops.length, lostLand: land - Object.keys(laid.state.cleared).length,
  }
}

/* ---------- a neighbour's crop ---------- */

export interface NeighbourCropView {
  seed: string
  name: string
  pack: string
  packTitle: string
  layer: string
  /** "Grown to stage 3 of 5", or "A rooted tree". The furthest it has grown: a neighbour is never shown less. */
  stageLine: string
  /** How the same seed stands on your own farm. Seeing what a friend grows is how you find what to plant next. */
  yours: string
}

/** What to say of a seed that layer balance holds back on your own farm, or null if nothing holds it. */
function heldLine(seed: Seed, mine: FarmState, catalog: Catalog, packTitle: string): string | null {
  const below = heldBy(seed, mine, catalog)
  return below ? 'Waiting on your farm: the ' + LAYER_NAMES[below] + ' layer of your ' + packTitle + ' field is hollow. Plant there first.' : null
}

/** A crop on a neighbour's farm, seen from `mine`. Null for a seed this game does not know. */
export function neighbourCropView(crop: Crop, mine: FarmState, catalog: Catalog): NeighbourCropView | null {
  const seed = catalog.seed(crop.seed)
  if (!seed) return null
  const packTitle = catalog.pack(seed.pack)?.title ?? seed.pack
  const own = cropOf(mine, seed.id)
  let yours: string
  if (own) yours = own.perennial ? 'You have rooted this too.' : 'You grow this too.'
  else if (Object.keys(mine.fields).length === 0) yours = 'Start a farm of your own and you can grow this too.'
  else if (!Object.hasOwn(mine.fields, seed.pack)) yours = 'You do not have the ' + packTitle + ' field. Open it from the learning tree to grow this.'
  else if (!visible(seed, mine)) {
    const parent = parentName(seed, catalog)
    yours = parent === null
      ? 'A wild seed. You have not found it yet: forage in the forest near what you grow.'
      : 'A sapling of ' + parent + '. Harvest ' + parent + ' on your farm and it drops into your seed bag.'
  }
  else if (!available(seed, mine)) yours = 'Locked for you: it needs ' + needsText(seed, catalog) + '.'
  else if (seed.earned && !isEarned(seed, mine, catalog)) yours = 'Locked for you: you have not earned it yet. It takes ' + earnedLine(seed.earned, catalog) + '.'
  else yours = heldLine(seed, mine, catalog, packTitle) ?? 'In your seed bag, ready to plant.'
  return {
    seed: seed.id, name: seed.name, pack: seed.pack, packTitle, layer: LAYER_NAMES[seed.layer],
    stageLine: crop.perennial ? 'A rooted tree' : 'Grown to stage ' + (crop.best + 1) + ' of ' + (RULES.maxStage + 1),
    yours,
  }
}

/* ---------- the list ---------- */

export interface NeighbourRow {
  code: string
  name: string
  day: number
  /** How old the picture is. */
  age: string
  /** Too old to visit: the picture has been forgotten and a new link is needed. */
  stale: boolean
}

/** In the order they were added. A name, a day and the age of the picture: nothing that could be compared. */
export const neighbourRows = (book: Book, nowMs: number): NeighbourRow[] =>
  book.neighbours.map((n) => ({ code: n.picture.code, name: n.picture.name, day: n.picture.day, age: ageText(n.picture.at, nowMs), stale: tooOld(n.picture.at, nowMs) }))

/** What to say when a farm link has been opened. */
export function arrivalText(result: Arrival, name: string): string {
  switch (result) {
    case 'added': return name + ' is now your neighbour.'
    case 'updated': return 'You now have a newer picture of ' + name + "'s farm."
    case 'not-newer': return 'You already have a newer picture.'
    case 'too-old': return 'This picture is too old. Ask for a new link.'
    case 'full': return 'You have ' + RULES.neighbours.max + ' neighbours, which is as many as the game keeps. Remove one first.'
    case 'own': return 'That is a link to your own farm.'
  }
}
