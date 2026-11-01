// What the catalogues promise, checked in CI: farms saved by the Phase 0 prototype still import
// (the seed and find ids they mention still exist), and the full catalogues keep their bar.
import { describe, expect, it } from 'vitest'
import { LAYER_NAMES, buildCatalog } from '../src/engine/catalog'
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
