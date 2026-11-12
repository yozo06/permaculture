// A small farm for tests: two packs, one capped at 30%, a recall seed, an artifact seed and a wild seed with its find.
import { buildCatalog } from './catalog'
import { apply, initialState } from './fold'
import { explainChecklist, explainPasses, harvestWork, waterWork, writePasses } from './ladder'
import { RULES, cropOf } from './rules'
import type { FarmEvent, FarmState, PackDef, SeedDef } from './types'

const mcq = (q: string) => ({ q, answer: 'right', distractors: ['wrong', 'also wrong'], why: 'because' })

export const smallPacks: PackDef[] = [
  {
    pack: 'garden', version: 0, title: 'Garden', color: '#6DB24F',
    branches: [{ id: 'roots', title: 'Roots' }, { id: 'leaves', title: 'Leaves' }],
    guilds: [{ id: 'three-sisters', title: 'Three sisters', seeds: ['corn', 'beans', 'squash'] }],
    finds: [{ id: 'bee-find', near: ['corn'], text: 'Bees visit corn.', seed: 'bees' }, { id: 'worm-find', near: ['beans'], text: 'Worms like beans.' }],
    seeds: [
      { id: 'corn', name: 'Corn', layer: 'canopy', branch: 'roots', tier: 0, harvest: 'recall', questions: { water: [mcq('Corn?')], harvest: [mcq('Corn, harder?')] } },
      { id: 'beans', name: 'Beans', layer: 'vine', branch: 'leaves', tier: 0, harvest: 'recall', questions: { water: [mcq('Beans?')] } },
      { id: 'squash', name: 'Squash', layer: 'ground-cover', branch: 'leaves', tier: 1, needs: ['corn', 'beans'], harvest: 'judged', rubric: ['Says what it is'], prompts: ['Explain squash.'], questions: { water: [mcq('Squash?')] } },
      { id: 'bees', name: 'Bees', layer: 'herb', branch: 'roots', tier: 1, needs: ['corn'], wild: true, harvest: 'recall', questions: { water: [mcq('Bees?')] } },
    ],
  },
  {
    pack: 'shed', version: 0, title: 'Shed', color: '#A9A692', perennial: true, energy_cap: 30,
    branches: [{ id: 'build', title: 'Build' }],
    seeds: [
      { id: 'saw', name: 'Saw', layer: 'herb', branch: 'build', tier: 0, harvest: 'artifact', prompts: ['Link to the cut.'] },
      { id: 'plane', name: 'Plane', layer: 'herb', branch: 'build', tier: 0, harvest: 'artifact', prompts: ['Link to the board.'] },
      { id: 'lathe', name: 'Lathe', layer: 'root', branch: 'build', tier: 1, needs: ['saw'], harvest: 'artifact', prompts: ['Link to the bowl.'] },
    ],
  },
]

/** Notes and an explanation long enough to plant and to water with. */
export const NOTES = 'Corn is tall and the beans climb it, and squash covers the ground below.'
export const EXPLANATION = 'Corn gives the beans a pole to climb, the beans feed the soil with nitrogen, and the squash shades the ground so the water stays in. Together they need less than apart.'

export const smallCatalog = buildCatalog(smallPacks)

const tool = (id: string, name: string, more: Partial<SeedDef>): SeedDef =>
  ({ id, name, layer: 'herb', branch: 'build', tier: 0, harvest: 'artifact', prompts: ['Show it.'], ...more })
/**
 * The small farm with three more tools in the shed, each earned by what grows in the garden: the kiln by one tree
 * there, the forge by the garden's readiness, and the anvil (which also needs the saw) by one tree.
 */
export const earningCatalog = buildCatalog(smallPacks.map((p) => (p.pack !== 'shed' ? p : { ...p, seeds: [
  ...p.seeds,
  tool('kiln', 'Kiln', { earned: { rooted: 1 } }),
  tool('forge', 'Forge', { earned: { pack: 'garden', readiness: 50 } }),
  tool('anvil', 'Anvil', { tier: 1, needs: ['saw'], earned: { rooted: 1 } }),
] })))

/** Apply events in order; throws if one is refused, so a test that sets up a farm fails loudly. */
export function run(catalog: ReturnType<typeof buildCatalog>, events: FarmEvent[], from: FarmState = initialState()): FarmState {
  return events.reduce((s, e) => {
    const next = apply(s, e, catalog)
    if (next === s) throw new Error('refused: ' + JSON.stringify(e))
    return next
  }, from)
}

export const started: Extract<FarmEvent, { type: 'farm-started' }> = { type: 'farm-started', ...RULES.start, energy: RULES.energyMax }
/** A started farm with the small catalog's two fields open. */
export const smallFarm = (): FarmState =>
  run(smallCatalog, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }])

/** The event that waters a crop the way the ladder asks: a recall answer, or an explanation rated against the rubric. */
export function waterEvent(catalog: ReturnType<typeof buildCatalog>, s: FarmState, seedId: string, ok = true): FarmEvent | null {
  const crop = cropOf(s, seedId)
  const seed = catalog.seed(seedId)
  if (!crop || !seed) return null
  if (waterWork(crop, seed) === 'recall') return { type: 'watered', seed: seedId, ok, work: 'recall' }
  const of = explainChecklist(seed).length
  const ticked = ok ? of : 0
  return { type: 'watered', seed: seedId, ok: explainPasses(ticked, of), work: 'explain', text: EXPLANATION, ticked, of }
}

/** The event that harvests a crop the way the ladder asks: a recall answer, or a write-up that meets every line (or none). */
export function harvestEvent(catalog: ReturnType<typeof buildCatalog>, seedId: string, ok = true): FarmEvent | null {
  const seed = catalog.seed(seedId)
  if (!seed) return null
  const work = harvestWork(seed)
  if (work.kind === 'recall') return { type: 'harvested', seed: seedId, ok }
  const of = work.checklist.length
  const ticked = ok ? of : 0
  return { type: 'harvested', seed: seedId, ok: writePasses(ticked, of), text: EXPLANATION, ticked, of }
}
