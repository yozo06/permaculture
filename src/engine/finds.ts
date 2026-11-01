// Wild finds: facts foraged in the forest, picked by what is growing right now.
import type { Catalog, Find } from './catalog'
import { hash } from './land'

export interface Foraging {
  crops: readonly { seed: string; perennial: boolean }[]
  foraged: readonly string[]
}

/** Finds near a growing crop; else near any planted crop; else any find. Never one already foraged. */
export function findCandidates(s: Foraging, catalog: Catalog): Find[] {
  const all = catalog.packs.flatMap((p) => catalog.findsOf(p.pack)).filter((f) => !s.foraged.includes(f.id))
  const growing = new Set(s.crops.filter((c) => !c.perennial).map((c) => c.seed))
  const planted = new Set(s.crops.map((c) => c.seed))
  const near = (ids: Set<string>) => all.filter((f) => f.near.some((id) => ids.has(id)))
  for (const pool of [near(growing), near(planted)]) if (pool.length) return pool
  return all
}

/** The find for a tile on a day. The same tile on the same day always gives the same find. */
export function pickFind(cands: readonly Find[], x: number, y: number, day: number): Find | undefined {
  return cands[Math.min(cands.length - 1, Math.floor(hash(x, y, day) * cands.length))]
}
