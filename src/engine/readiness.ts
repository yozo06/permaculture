// How ready a field is: how much of its catalogue stands as trees today, and which of its layers are hollow.
// Pure, and never part of a saved farm: it is worked out from the crops each time it is asked for.
import { LAYERS, type Catalog } from './catalog'
import { RULES } from './rules'
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
  /** Seeds that count. Wild seeds are extras: finding one never lowers readiness, and rooting one never raises it. */
  total: number
  /** Trees standing today: rooted, and not wilted by a wrong check-in. */
  rooted: number
  /** `rooted` as a share of `total`, rounded down, so only a field with every seed rooted reads 100. */
  percent: number
  /** One entry per layer the catalogue has, from the canopy down. */
  layers: LayerCount[]
  /** Layers the catalogue has seeds in but the farm has no standing tree in. */
  hollow: Layer[]
  /** What the field is held to: the farmer's bar, else the pack's, else the rules'. */
  bar: number
  /** The number is at the bar and no layer is hollow. */
  atBar: boolean
}

/** A field's readiness, or null for a pack with no end (a language, the Workshop) or one that is not in the catalogue. */
export function readiness(packId: string, s: Pick<FarmState, 'crops' | 'bars'>, catalog: Catalog): Readiness | null {
  const pack = catalog.pack(packId)
  if (!pack || pack.perennial === true) return null
  const standing = new Set(s.crops.filter((c) => c.perennial && !c.wilted).map((c) => c.seed))
  const seeds = catalog.seedsOf(packId).filter((seed) => !seed.wild)
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
