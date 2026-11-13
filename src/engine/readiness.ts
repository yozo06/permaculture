// How ready a field is: how much of its catalogue stands as trees today, and which of its layers are hollow.
// What a seed is earned by: learning that has to be on the farm before the seed can be planted.
// And layer balance: a seed waits while a layer well below it is hollow.
// Pure, and never part of a saved farm: all three are worked out from the crops each time they are asked for.
import { LAYERS, type Catalog, type Earned, type Seed } from './catalog'
import { RULES, available, cropOf } from './rules'
import type { FarmState, Layer } from './types'

export interface LayerCount {
  layer: Layer
  /** Seeds the catalogue has in this layer. */
  total: number
  /** Of those, the trees standing today. */
  rooted: number
}

export interface Readiness {
  pack: string
  /** Seeds that count. Wild seeds and saplings are extras: finding one never lowers readiness, and rooting one never raises it. */
  total: number
  /** Trees standing today: rooted, and not wilted by a wrong check-in. */
  rooted: number
  /** `rooted` as a share of `total`, rounded down, so only a field with every seed rooted reads 100. */
  percent: number
  /** One entry per layer the catalogue has, from the canopy down. */
  layers: LayerCount[]
  /** Layers the catalogue has seeds in but the farm has no standing tree in. */
  hollow: Layer[]
  /** What the field is held to: the farmer's bar, else the pack's, else the rules'. (A bar kept for a pack that has since lost its end is never read: such a pack has no readiness.) */
  bar: number
  /** The number is at the bar and no layer is hollow. */
  atBar: boolean
}

/** A field's readiness, or null for a pack with no end (a language, the Workshop) or one that is not in the catalogue. */
export function readiness(packId: string, s: Pick<FarmState, 'crops' | 'bars'>, catalog: Catalog): Readiness | null {
  const pack = catalog.pack(packId)
  if (!pack || pack.perennial === true) return null
  const standing = new Set(s.crops.filter((c) => c.perennial && !c.wilted).map((c) => c.seed))
  const seeds = catalog.seedsOf(packId).filter((seed) => !seed.extra)
  const layers = LAYERS.flatMap((layer): LayerCount[] => {
    const mine = seeds.filter((seed) => seed.layer === layer)
    return mine.length ? [{ layer, total: mine.length, rooted: mine.filter((seed) => standing.has(seed.id)).length }] : []
  })
  const rooted = layers.reduce((n, l) => n + l.rooted, 0)
  const percent = seeds.length ? Math.floor((100 * rooted) / seeds.length) : 0
  const hollow = layers.filter((l) => l.rooted === 0).map((l) => l.layer)
  const bar = (Object.hasOwn(s.bars, packId) ? s.bars[packId] : undefined) ?? pack.readiness_bar ?? RULES.readiness.bar
  return { pack: packId, total: seeds.length, rooted, percent, layers, hollow, bar, atBar: seeds.length > 0 && percent >= bar && hollow.length === 0 }
}

/* ---------- earned seeds ---------- */

export interface EarnedProgress {
  /** Trees counted so far, or the field's readiness today. */
  have: number
  want: number
  met: boolean
}

/**
 * How far the farm is towards what a seed asks to be earned by, or null for a seed that asks for nothing.
 * Trees count once rooted, wilted or not, and extras (wild seeds, saplings) never do. A readiness is today's, so it can be lost again.
 */
export function earnedProgress(seed: Seed, s: Pick<FarmState, 'crops' | 'bars'>, catalog: Catalog): EarnedProgress | null {
  const e = seed.earned
  if (!e) return null
  if (e.kind === 'readiness') {
    const have = readiness(e.pack, s, catalog)?.percent ?? 0
    return { have, want: e.percent, met: have >= e.percent }
  }
  const counts = (id: string): boolean => {
    const grown = catalog.seed(id)
    return grown !== undefined && !grown.extra && (e.pack === null ? grown.pack !== seed.pack : grown.pack === e.pack)
  }
  const have = s.crops.filter((c) => c.perennial && counts(c.seed)).length
  return { have, want: e.count, met: have >= e.count }
}

/** True for a seed that asks for nothing, and for one whose learning is on the farm. */
export const isEarned = (seed: Seed, s: Pick<FarmState, 'crops' | 'bars'>, catalog: Catalog): boolean =>
  earnedProgress(seed, s, catalog)?.met ?? true

/** What a seed is earned by, to finish the sentences "It is earned by …" and "It takes …". */
export function earnedLine(e: Earned, catalog: Catalog): string {
  const field = (id: string): string => 'the ' + (catalog.pack(id)?.title ?? id) + ' field'
  if (e.kind === 'readiness') return field(e.pack) + ' at readiness ' + e.percent
  const seeds = e.count === 1 ? 'a seed' : e.count + ' seeds'
  return seeds + ' rooted in ' + (e.pack === null ? (e.count === 1 ? 'another field' : 'other fields') : field(e.pack))
}

/* ---------- layer balance ---------- */

/** The layers a field is built up through, from the ground. Vines climb through all of them and have no place in the order. */
export const GROUND_UP: readonly Layer[] = LAYERS.filter((l) => l !== 'vine').reverse()

/**
 * The layer that holds this seed back, or null if nothing does. A seed waits while a layer `RULES.balance.below` or
 * more beneath its own is hollow and has a seed that could be planted today. The lowest such layer is the one named.
 *
 * "Could be planted today" is what keeps a field from ever being stuck: a hollow layer whose seeds are all locked, not
 * earned or already in the ground holds nothing back, and the lowest layer that does hold something back is itself
 * held by nothing. Extras (wild seeds, saplings) never count: a found one neither holds a seed back nor, as a tree,
 * fills a layer. A field with no end has no hollow layers, so nothing waits.
 */
export function heldBy(seed: Seed, s: Pick<FarmState, 'crops' | 'bars' | 'unlocked' | 'volunteers'>, catalog: Catalog): Layer | null {
  const height = GROUND_UP.indexOf(seed.layer)
  if (height < RULES.balance.below) return null
  const hollow = readiness(seed.pack, s, catalog)?.hollow ?? []
  if (hollow.length === 0) return null
  const plantable = catalog.seedsOf(seed.pack).filter((x) => !x.extra && !cropOf(s, x.id) && available(x, s) && isEarned(x, s, catalog))
  return GROUND_UP.slice(0, height - RULES.balance.below + 1).find((layer) => hollow.includes(layer) && plantable.some((x) => x.layer === layer)) ?? null
}
