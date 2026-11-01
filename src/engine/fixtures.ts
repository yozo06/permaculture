// A small farm for tests: two packs, one capped at 30%, a recall seed, an artifact seed and a wild seed with its find.
import { buildCatalog } from './catalog'
import { apply, initialState } from './fold'
import { RULES } from './rules'
import type { FarmEvent, FarmState, PackDef } from './types'

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

export const smallCatalog = buildCatalog(smallPacks)

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
