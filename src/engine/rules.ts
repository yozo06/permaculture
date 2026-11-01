// The Phase 0 rules the pack loader needs. B3 grows this into the full rule set.
import type { Catalog, Seed } from './catalog'

/** The part of a farm these rules read. */
export interface Rooting {
  crops: readonly { id: string; per: boolean }[]
  unlocked: readonly string[]
  volunteers: readonly string[]
}

/** Seed ids of perennial crops: the ones that count as rooted. */
export const rootedIds = (s: Rooting): Set<string> => new Set(s.crops.filter((c) => c.per).map((c) => c.id))

/** Wild seeds stay hidden until they have been domesticated. */
export const visible = (seed: Seed, s: Rooting): boolean => !seed.wild || s.volunteers.includes(seed.id)

/** Can this seed be planted now: it is visible and unlocked, or everything it needs is rooted. */
export function available(seed: Seed, s: Rooting): boolean {
  if (!visible(seed, s)) return false
  if (s.unlocked.includes(seed.id)) return true
  const rooted = rootedIds(s)
  return seed.needs.every((n) => rooted.has(n))
}

/** Energy this field may still spend today; Infinity when the pack has no cap. */
export function capLeft(
  packId: string,
  catalog: Catalog,
  energyMax: number,
  spent: Readonly<Record<string, number>>,
): number {
  return catalog.capOf(packId, energyMax) - (spent[packId] ?? 0)
}
