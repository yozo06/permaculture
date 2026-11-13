// What the catalogues promise, checked in CI: farms saved by the Phase 0 prototype still import
// (the seed and find ids they mention still exist), and the full catalogues keep their bar.
import { describe, expect, it } from 'vitest'
import { LAYER_NAMES, buildCatalog } from '../src/engine/catalog'
import { apply, fieldsToOpen, initialState } from '../src/engine/fold'
import { heldBy, isEarned } from '../src/engine/readiness'
import { RULES, available } from '../src/engine/rules'
import { fromV2 } from '../src/engine/v2'
import sampleFarm from '../src/game/sample-farm.json'
import { collectPacks } from './packs-lib.mjs'

const packs = collectPacks()
const catalog = buildCatalog(packs)

/** Every seed id in the Phase 0 prototype. Old saves refer to these, so they never go away. */
const PHASE0_SEEDS = [
  'laziness', 'stm', 'bracket', 'gc', 'leaks', 'rts', 'lockfree', 'gadts', 'effects', 'nonmoving',
  'cap', 'con', 'replication', 'raft', 'cell', 'bp', 'rl', 'idem', 'fpaxos', 'jump',
  'tcp', 'k8s', 'tls', 'mesh', 'mvcc', 'pgidx', 'kafka', 'slo',
  'food', 'water', 'num', 'market', 'dirs', 'script', 'verbs', 'talk',
]

describe('Phase 0 farms', () => {
  it('still find every seed they mention', () => {
    expect(PHASE0_SEEDS.filter((id) => !catalog.seed(id))).toEqual([])
  })

  it('still find every wild find they foraged', () => {
    const foraged = Array.from({ length: 12 }, (_, i) => 'f' + (i + 1))
    const state = fromV2({ ...sampleFarm, foraged }, catalog)
    expect(state?.foraged).toHaveLength(12)
    for (const id of state?.foraged ?? []) expect(catalog.find(id), id).toBeDefined()
  })
})

describe.each(['haskell-backend', 'system-design', 'infra', 'dsa', 'leadership'])('the %s catalogue', (id) => {
  const pack = packs.find((p) => p.pack === id)
  const seeds = pack?.seeds ?? []
  const sources = new Set((pack?.sources ?? []).map((s) => s.id))

  it('has 30 to 40 seeds, with perennials possible in all seven layers', () => {
    expect(seeds.length).toBeGreaterThanOrEqual(30)
    expect(seeds.length).toBeLessThanOrEqual(40)
    for (const layer of Object.keys(LAYER_NAMES)) expect(seeds.some((s) => s.layer === layer), layer).toBe(true)
  })

  it('gives every seed a rubric, two recall cards and a source', () => {
    for (const s of seeds) {
      expect(s.rubric?.length ?? 0, s.id).toBeGreaterThanOrEqual(3)
      expect(s.questions?.water?.length ?? 0, s.id).toBeGreaterThanOrEqual(2)
      expect(s.sources?.length ?? 0, s.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('cites a declared source on every card', () => {
    for (const s of seeds) {
      for (const q of [...(s.questions?.water ?? []), ...(s.questions?.harvest ?? [])]) {
        expect(sources.has(q.source ?? ''), s.id + ': ' + q.q).toBe(true)
      }
    }
  })
})

describe('the Workshop', () => {
  it('holds three of its features back until the learning is on the farm', () => {
    expect(catalog.seed('sprites')?.earned).toEqual({ kind: 'rooted', pack: null, count: 1 })
    expect(catalog.seed('seed-trading')?.earned).toEqual({ kind: 'rooted', pack: 'kannada', count: 4 })
    expect(catalog.seed('weather')?.earned).toEqual({ kind: 'readiness', pack: 'infra', percent: 60 })
  })

  it('asks nothing of the rest, and no other pack asks for anything', () => {
    const asking = catalog.packs.flatMap((p) => catalog.seedsOf(p.pack)).filter((s) => s.earned).map((s) => s.pack + '/' + s.id)
    expect(asking.sort()).toEqual(['workshop/seed-trading', 'workshop/sprites', 'workshop/weather'])
  })

  it('has a seed for readiness and one for earned unlocks', () => {
    expect(catalog.seed('readiness')).toMatchObject({ pack: 'workshop', harvest: 'artifact' })
    expect(catalog.seed('earned-unlocks')).toMatchObject({ pack: 'workshop', needs: ['readiness'] })
  })
})

describe('the edges between fields', () => {
  const edged = catalog.packs.flatMap((p) => catalog.seedsOf(p.pack)).filter((s) => s.edge !== null)

  it('are the seeds that belong to two fields at once', () => {
    expect(edged.map((s) => s.pack + '/' + s.id + ' -> ' + s.edge).sort()).toEqual([
      'dsa/hash-table-internals -> system-design',
      'haskell-backend/containers -> dsa',
      'haskell-backend/observability -> infra',
      'haskell-backend/servant-api -> system-design',
      'infra/load-balancing -> system-design',
      'infra/pg-replication -> system-design',
      'infra/slo -> leadership',
      'kannada/tech-words -> infra',
      'leadership/design-docs -> system-design',
      'leadership/error-budget-talk -> infra',
      'system-design/golden-signals -> infra',
      'system-design/lsm-vs-btree -> dsa',
      'system-design/slo-error-budgets -> leadership',
    ])
  })

  it('give every field but the Workshop a seed on an edge', () => {
    for (const p of catalog.packs.filter((x) => x.pack !== 'workshop')) {
      expect(edged.some((s) => s.pack === p.pack), p.pack + ' has an edge seed').toBe(true)
    }
  })

  it('include Kannada words for technology, on the edge of a technical field', () => {
    expect(catalog.seed('tech-words')).toMatchObject({ pack: 'kannada', edge: 'infra', harvest: 'recall', wild: false })
  })
})

describe('layer balance on a new farm', () => {
  let farm = apply(initialState(), { type: 'farm-started', ...RULES.start, energy: RULES.energyMax }, catalog)
  for (const e of fieldsToOpen(farm, catalog)) farm = apply(farm, e, catalog)

  it.each(packs.map((p) => p.pack))('lets the %s field start, and from the ground', (id) => {
    const could = catalog.seedsOf(id).filter((s) => !s.extra && available(s, farm) && isEarned(s, farm, catalog))
    const free = could.filter((s) => heldBy(s, farm, catalog) === null)
    expect(free.length).toBeGreaterThan(0)
    // Whatever waits on day one is waiting for a layer that has a free seed in it.
    for (const s of could) {
      const below = heldBy(s, farm, catalog)
      if (below) expect(free.some((f) => f.layer === below), s.id + ' waits for ' + below).toBe(true)
    }
  })
})
