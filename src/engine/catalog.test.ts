import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { LAYER_NAMES, buildCatalog } from './catalog'

const catalog = buildCatalog(collectPacks())

describe('catalog', () => {
  it('lists the packs in file order and finds seeds by global id', () => {
    const ids = catalog.packs.map((p) => p.pack)
    expect(ids).toEqual([...ids].sort())
    expect(ids).toEqual(expect.arrayContaining(['haskell-backend', 'infra', 'kannada', 'system-design', 'workshop']))
    expect(catalog.seed('raft')?.pack).toBe('system-design')
    expect(catalog.seed('nope')).toBeUndefined()
  })

  it('fills in every list on a seed', () => {
    const s = catalog.seed('repo')
    expect(s).toMatchObject({ pack: 'workshop', needs: [], sources: [], rubric: [], wild: false, questions: { water: [], harvest: [] } })
    expect(s?.prompts.length).toBeGreaterThan(0)
  })

  it('finds finds, per pack and by id', () => {
    expect(catalog.find('flexible-paxos')).toMatchObject({ pack: 'system-design', seed: 'fpaxos' })
    expect(catalog.findsOf('kannada').map((f) => f.id)).toEqual(['pandi-curry', 'kannada-numerals'])
    expect(catalog.findsOf('workshop')).toEqual([])
  })

  it('caps the Workshop at 30% of the day and nothing else', () => {
    expect(catalog.capOf('workshop', 90)).toBe(27)
    expect(catalog.capOf('workshop', 95)).toBe(28)
    expect(catalog.capOf('infra', 90)).toBe(Infinity)
    expect(catalog.capOf('missing', 90)).toBe(Infinity)
  })

  it('says what earns a seed in one shape, and null when nothing has to be earned', () => {
    const seed = (id: string, earned?: { pack?: string; rooted?: number; readiness?: number }) =>
      ({ id, name: id, layer: 'herb' as const, branch: 'b', tier: 0, harvest: 'artifact' as const, prompts: ['p'], ...(earned ? { earned } : {}) })
    const c = buildCatalog([{ pack: 'p', version: 0, title: 'P', branches: [{ id: 'b', title: 'B' }], seeds: [
      seed('free'), seed('any', { rooted: 2 }), seed('one', { pack: 'q', rooted: 3 }), seed('ready', { pack: 'q', readiness: 60 }), seed('empty', {}),
    ] }])
    expect(c.seed('free')?.earned).toBeNull()
    expect(c.seed('any')?.earned).toEqual({ kind: 'rooted', pack: null, count: 2 })
    expect(c.seed('one')?.earned).toEqual({ kind: 'rooted', pack: 'q', count: 3 })
    expect(c.seed('ready')?.earned).toEqual({ kind: 'readiness', pack: 'q', percent: 60 })
    expect(c.seed('empty')?.earned).toBeNull()
  })

  it('names the layers', () => {
    expect(LAYER_NAMES['ground-cover']).toBe('Ground cover')
  })
})
