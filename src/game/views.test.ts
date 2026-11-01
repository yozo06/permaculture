import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
import type { PackDef, SeedDef } from '../engine/types'
import { apply, fieldsToOpen, fold } from '../engine/fold'
import type { FarmState } from '../engine/types'
import sampleFarm from './sample-farm.json'
import { bagView, cropView, sourceLinks, splitName, treeView } from './views'

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
    // The live Haskell pack keeps growing, so the geometry is pinned on the shape of its Phase 0 tree.
    const seed = (id: string, branch: string, tier: number, needs: string[] = []): SeedDef => ({ id, name: id, layer: 'root', branch, tier, needs, harvest: 'recall' })
    const phase0: PackDef = {
      pack: 'haskell-backend', version: 0, title: 'Backend · Haskell',
      branches: [{ id: 'runtime-and-performance', title: 'Runtime & performance' }, { id: 'types-and-effects', title: 'Types & effects' }],
      seeds: [
        seed('laziness', 'types-and-effects', 0), seed('gc', 'runtime-and-performance', 1), seed('leaks', 'runtime-and-performance', 1),
        seed('stm', 'types-and-effects', 1), seed('bracket', 'types-and-effects', 1), seed('rts', 'runtime-and-performance', 2, ['gc']),
        seed('lockfree', 'types-and-effects', 2, ['stm']), seed('gadts', 'types-and-effects', 2, ['laziness']),
        seed('effects', 'types-and-effects', 3, ['gadts', 'bracket']),
      ],
    }
    const old = buildCatalog([phase0])
    const v = treeView('haskell-backend', farm(old), old)
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

describe('cropView', () => {
  const s = farm()
  const view = (seed: string, patch: Partial<FarmState['crops'][number]> = {}, day = s.day) => {
    const crop = s.crops.find((c) => c.seed === seed)
    if (!crop) throw new Error('no crop ' + seed)
    return cropView({ ...crop, ...patch }, { day }, catalog)
  }

  it('says where a crop that is not thirsty stands, with nothing to do', () => {
    const v = view('con', { due: 20 })
    expect(v).toMatchObject({ name: 'Consistent hashing', stageLine: 'Stage 1 of 5 · Z1 · Sprout', nextWork: null })
    expect(v?.statusLine).toMatch(/^Growing\. Thirsty again on day \d+\.$/)
  })

  it('knows a stage-4 crop explains when thirsty, and a Workshop crop explains at any stage', () => {
    const bp = view('bp')
    expect(bp).toMatchObject({ stageLine: 'Stage 4 of 5 · Z3 · Explain', statusLine: 'Thirsty now.' })
    expect(bp?.nextWork).toMatch(/explanation in your own words/)
  })

  it('shows a notes-less sample crop as having no notes and no journal', () => {
    expect(view('bp')).toMatchObject({ notes: '', journal: [] })
  })

  it('shows notes, and the journal newest first', () => {
    const v = view('con', { notes: 'my notes', journal: [{ day: 3, kind: 'explain', text: 'first', ok: false }, { day: 5, kind: 'harvest', text: 'second', ok: true }] })
    expect(v?.notes).toBe('my notes')
    expect(v?.journal).toEqual([{ day: 5, label: 'Harvest write-up', text: 'second', ok: true }, { day: 3, label: 'Explained', text: 'first', ok: false }])
  })

  it('describes a perennial, a ripe crop and a wilted crop that cannot be revived yet', () => {
    expect(view('bracket')).toMatchObject({ stageLine: 'Stage 5 of 5 · Z4 · Perennial' })
    expect(view('bracket')?.statusLine).toMatch(/^Rooted\. Next check-in on day/)
    expect(view('leaks')).toMatchObject({ statusLine: 'Ready to harvest.', stageLine: 'Stage 5 of 5 · Z3 · Harvest' })
    expect(view('leaks')?.nextWork).toBe('Harvest: a harder question.')
    expect(view('con', { due: 20, stage: 2 })?.statusLine).toBe('Growing. Thirsty again on day 20.')
    const wilted = view('gc', { wilted: true, due: 30 })
    expect(wilted?.statusLine).toBe('Wilted. It can be revived on day 30.')
    expect(wilted?.nextWork).toBeNull()
  })

  it('links a source only when it has an http(s) address', () => {
    const seed = catalog.seed('con')
    if (!seed) throw new Error('no seed')
    const bad: PackDef = { pack: 'p', version: 0, title: 'P', branches: [{ id: 'b', title: 'B' }], sources: [{ id: 'a', title: 'A', url: 'javascript:alert(1)' }, { id: 'b', title: 'B', url: 'https://example.org/b' }, { id: 'c', title: 'C' }], seeds: [{ id: 'x', name: 'X', layer: 'herb', branch: 'b', tier: 0, harvest: 'artifact', prompts: ['p'], sources: ['a', 'b', 'c', 'missing'] }] }
    const x = buildCatalog([bad]).seed('x')
    if (!x) throw new Error('no seed x')
    expect(sourceLinks(x, buildCatalog([bad]))).toEqual([{ title: 'A', url: null }, { title: 'B', url: 'https://example.org/b' }, { title: 'C', url: null }])
  })

  it('is null for a seed no pack has', () => {
    expect(cropView({ seed: 'gone', x: 0, y: 0, stage: 0, due: 1, wilted: false, perennial: false, notes: '', journal: [] }, { day: 1 }, catalog)).toBeNull()
  })
})
