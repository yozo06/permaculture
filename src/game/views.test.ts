import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
import type { PackDef } from '../engine/types'
import { apply, fieldsToOpen, fold } from '../engine/fold'
import type { FarmState } from '../engine/types'
import sampleFarm from './sample-farm.json'
import { bagView, splitName, treeView } from './views'

const catalog = buildCatalog(collectPacks())

/** The prototype's farm with a field opened for every pack, as the game loads it. */
function farm(c = catalog): FarmState {
  const imported = fold([{ type: 'snapshot-imported', snapshot: sampleFarm }], c)
  return fieldsToOpen(imported, c).reduce((s, e) => apply(s, e, c), imported)
}

describe('the sample farm', () => {
  it('upgrades, and opens one field per pack', () => {
    expect(Object.keys(farm().fields)).toHaveLength(catalog.packs.length)
  })
})

describe('bagView', () => {
  const sections = bagView(farm(), catalog)
  const section = (id: string) => {
    const s = sections.find((x) => x.pack === id)
    if (!s) throw new Error('no section ' + id)
    return s
  }

  it('has one section per field, in pack order', () => {
    expect(sections.map((s) => s.pack)).toEqual(catalog.packs.map((p) => p.pack))
  })

  it('labels the Workshop perennial and capped, and nothing else', () => {
    expect(section('workshop')).toMatchObject({ perennial: true, capPercent: 30 })
    expect(section('infra')).toMatchObject({ perennial: false, capPercent: null })
  })

  it('collapses locked seeds to a count and keeps wild seeds out of sight', () => {
    const hs = section('haskell-backend')
    expect(hs.seeds.some((s) => s.id === 'nonmoving')).toBe(false)
    const shown = hs.seeds.length + hs.lockedCount
    expect(shown).toBe(catalog.seedsOf('haskell-backend').filter((s) => !s.wild).length)
    expect(hs.lockedCount).toBeGreaterThan(0)
  })

  it('shows seeds in the ground as growing or rooted, with a harvest tag', () => {
    const infra = section('infra')
    expect(infra.seeds.find((s) => s.id === 'mvcc')).toMatchObject({ status: 'rooted', harvest: 'recall' })
    expect(infra.seeds.find((s) => s.id === 'k8s')?.status).toBe('growing')
    expect(section('workshop').seeds.every((s) => s.harvest === 'artifact')).toBe(true)
  })

  it('puts the focus branch first, then orders by tier', () => {
    const s = farm()
    s.focus['system-design'] = 'traffic-and-resilience'
    const sd = bagView(s, catalog).find((x) => x.pack === 'system-design')
    expect(sd?.focusTitle).toBe('Traffic & resilience')
    const order = sd?.seeds.map((x) => catalog.seed(x.id)).filter((x) => x !== undefined) ?? []
    const firstOther = order.findIndex((x) => x.branch !== 'traffic-and-resilience')
    expect(order.slice(0, firstOther).every((x) => x.branch === 'traffic-and-resilience')).toBe(true)
    expect(order.slice(firstOther).every((x) => x.branch !== 'traffic-and-resilience')).toBe(true)
  })

  it('shows a wild seed once it is a volunteer', () => {
    const s = farm()
    s.volunteers.push('fpaxos')
    expect(bagView(s, catalog).find((x) => x.pack === 'system-design')?.lockedCount).toBe(
      (bagView(farm(), catalog).find((x) => x.pack === 'system-design')?.lockedCount ?? 0) + 1,
    )
  })

  it('marks the seed in hand', () => {
    expect(bagView(farm(), catalog, 'tls').flatMap((x) => x.seeds).filter((x) => x.selected).map((x) => x.id)).toEqual(['tls'])
  })
})

describe('treeView', () => {
  it('has a column per branch and a node per visible seed', () => {
    const v = treeView('haskell-backend', farm(), catalog)
    expect(v?.branches.map((b) => b.id)).toEqual(['runtime-and-performance', 'types-and-effects'])
    expect(v?.nodes).toHaveLength(catalog.seedsOf('haskell-backend').filter((s) => !s.wild).length)
    expect(v?.width).toBe(480)
  })

  it('matches the Phase 0 layout for two branches', () => {
    const v = treeView('haskell-backend', farm(), catalog)
    const stm = v?.nodes.find((n) => n.id === 'stm')
    const bracket = v?.nodes.find((n) => n.id === 'bracket')
    expect(v?.height).toBe(46 + 4 * 72)
    expect([stm?.y, bracket?.y]).toEqual([46 + 72, 46 + 72])
    expect([stm?.x, bracket?.x]).toEqual([240 + 60, 240 + 180])
    expect(stm?.width).toBe(100)
  })

  it('rates every node and draws needs as links', () => {
    const v = treeView('infra', farm(), catalog)
    const status = (id: string) => v?.nodes.find((n) => n.id === id)?.status
    expect([status('mvcc'), status('k8s'), status('pgidx'), status('mesh')]).toEqual(['rooted', 'growing', 'ready', 'locked'])
    expect(v?.nodes.find((n) => n.id === 'k8s')?.progress).toBe(3 / 5)
    expect(v?.edges.find((e) => e.to.y > e.from.y && e.rooted)).toBeDefined()
    expect(v?.locked.map((l) => l.id)).toEqual(expect.arrayContaining(['mesh', 'slo']))
  })

  it('has a tree for every pack, with the wild dot only on found wild seeds', () => {
    const s = farm()
    s.volunteers.push('nonmoving')
    for (const p of catalog.packs) expect(treeView(p.pack, s, catalog)?.nodes.length).toBeGreaterThan(0)
    expect(treeView('haskell-backend', s, catalog)?.nodes.find((n) => n.id === 'nonmoving')?.wild).toBe(true)
    expect(treeView('nope', s, catalog)).toBeNull()
  })
})

/** A pack with four branches and a wide tier, to exercise wrapping, and a guild. */
const wide: PackDef = {
  pack: 'wide', version: 0, title: 'Wide', branches: ['a', 'b', 'c', 'd'].map((id) => ({ id, title: 'Branch ' + id })),
  seeds: [
    ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => ({ id, name: id, layer: 'herb', branch: 'a', tier: 0, harvest: 'artifact' })),
    { id: 'b1', name: 'b1', layer: 'herb', branch: 'b', tier: 0, harvest: 'artifact' },
    { id: 'c1', name: 'c1', layer: 'herb', branch: 'c', tier: 1, needs: ['b1'], harvest: 'artifact' },
  ] as PackDef['seeds'],
  guilds: [{ id: 'g', title: 'G', seeds: ['a1', 'b1', 'c1'] }],
}

describe('treeView with wrapped tiers', () => {
  const only = buildCatalog([wide])
  const v = treeView('wide', farm(only), only)

  it('splits the width over the branches', () => {
    expect(v?.columnWidth).toBe(120)
    expect(v?.nodes[0]?.width).toBe(100)
  })

  it('wraps a tier into rows, one node per row in a narrow column', () => {
    const ys = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => v?.nodes.find((n) => n.id === id)?.y)
    expect(ys).toEqual([46, 94, 142, 190, 238, 286])
    expect(v?.nodes.find((n) => n.id === 'c1')?.y).toBe(46 + 5 * 48 + 72)
  })

  it('fits four nodes in a row of a single wide column', () => {
    const one: PackDef = { ...wide, branches: [{ id: 'a', title: 'A' }], seeds: wide.seeds.filter((s) => s.branch === 'a') }
    const cat = buildCatalog([one])
    const w = treeView('wide', farm(cat), cat)
    const row = (id: string) => w?.nodes.find((n) => n.id === id)
    expect([row('a1')?.x, row('a4')?.x, row('a5')?.x]).toEqual([60, 420, 120])
    expect([row('a1')?.y, row('a5')?.y]).toEqual([46, 94])
  })

  it('counts how many of a guild are rooted', () => {
    expect(v?.guilds).toEqual([{ id: 'g', title: 'G', members: [
      { id: 'a1', name: 'a1', status: 'ready' }, { id: 'b1', name: 'b1', status: 'ready' }, { id: 'c1', name: 'c1', status: 'locked' },
    ], rooted: 0, total: 3 }])
  })
})

describe('splitName', () => {
  it('keeps short names whole and splits long ones near the middle', () => {
    expect(splitName('Raft')).toEqual(['Raft'])
    expect(splitName('Idempotency & outbox')).toEqual(['Idempotency', '& outbox'])
  })
})
