import type { FindDef, HarvestType, Layer, Mcq, PackDef, SeedDef } from './types'

export const LAYER_NAMES: Record<Layer, string> = {
  canopy: 'Canopy',
  understory: 'Understory',
  shrub: 'Shrub',
  herb: 'Herb',
  'ground-cover': 'Ground cover',
  root: 'Root',
  vine: 'Vine',
}

/** The seven layers, from the canopy down, with the vines that climb through all of them last. */
export const LAYERS = Object.keys(LAYER_NAMES) as Layer[]

export const HARVEST_NAMES: Record<HarvestType, string> = {
  recall: 'recall',
  solve: 'solve',
  judged: 'judged',
  artifact: 'artifact',
}

/** The learning a seed asks for before it can be planted. */
export type Earned =
  /** This many seeds rooted in `pack`, or in any field but the seed's own when `pack` is null. */
  | { kind: 'rooted'; pack: string | null; count: number }
  /** `pack`'s readiness at this number or over. */
  | { kind: 'readiness'; pack: string; percent: number }

/** A seed with its pack and every list filled in, so callers never check for undefined. */
export interface Seed extends Omit<SeedDef, 'needs' | 'wild' | 'earned' | 'sources' | 'rubric' | 'questions' | 'prompts'> {
  pack: string
  needs: string[]
  wild: boolean
  /** Null when the seed asks for nothing. */
  earned: Earned | null
  sources: string[]
  rubric: string[]
  questions: { water: Mcq[]; harvest: Mcq[] }
  prompts: string[]
}

export interface Find extends FindDef {
  pack: string
}

export interface Catalog {
  /** In file order. */
  packs: readonly PackDef[]
  pack(id: string): PackDef | undefined
  /** Seed ids are unique across all packs. */
  seed(id: string): Seed | undefined
  find(id: string): Find | undefined
  seedsOf(packId: string): Seed[]
  findsOf(packId: string): Find[]
  /** Most energy a field may use in a day: the pack's `energy_cap` percent of `energyMax`, or Infinity. */
  capOf(packId: string, energyMax: number): number
}

/** The validator has already refused a seed that asks for both, for neither, or for a readiness with no pack. */
function earnedOf(e: SeedDef['earned']): Earned | null {
  if (!e) return null
  if (e.readiness !== undefined) return e.pack === undefined ? null : { kind: 'readiness', pack: e.pack, percent: e.readiness }
  return e.rooted === undefined ? null : { kind: 'rooted', pack: e.pack ?? null, count: e.rooted }
}

function normalise(pack: string, s: SeedDef): Seed {
  return {
    ...s,
    pack,
    needs: s.needs ?? [],
    wild: s.wild === true,
    earned: earnedOf(s.earned),
    sources: s.sources ?? [],
    rubric: s.rubric ?? [],
    questions: { water: s.questions?.water ?? [], harvest: s.questions?.harvest ?? [] },
    prompts: s.prompts ?? [],
  }
}

export function buildCatalog(packs: readonly PackDef[]): Catalog {
  const byPack = new Map<string, PackDef>()
  const seeds = new Map<string, Seed>()
  const seedsByPack = new Map<string, Seed[]>()
  const finds = new Map<string, Find>()
  const findsByPack = new Map<string, Find[]>()
  for (const p of packs) {
    byPack.set(p.pack, p)
    const mine = p.seeds.map((s) => normalise(p.pack, s))
    seedsByPack.set(p.pack, mine)
    for (const s of mine) seeds.set(s.id, s)
    const myFinds = (p.finds ?? []).map((f) => ({ ...f, pack: p.pack }))
    findsByPack.set(p.pack, myFinds)
    for (const f of myFinds) finds.set(f.id, f)
  }
  return {
    packs,
    pack: (id) => byPack.get(id),
    seed: (id) => seeds.get(id),
    find: (id) => finds.get(id),
    seedsOf: (id) => seedsByPack.get(id) ?? [],
    findsOf: (id) => findsByPack.get(id) ?? [],
    capOf: (id, energyMax) => {
      const pct = byPack.get(id)?.energy_cap
      return pct === undefined ? Infinity : Math.floor((energyMax * pct) / 100)
    },
  }
}
