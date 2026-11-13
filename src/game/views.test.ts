import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
import type { Crop, PackDef, SeedDef } from '../engine/types'
import { bountifulCatalog, earningCatalog, layeredCatalog, run, smallCatalog, smallFarm, started } from '../engine/fixtures'
import { apply, fieldsToOpen, fold } from '../engine/fold'
import { RULES } from '../engine/rules'
import type { FarmState } from '../engine/types'
import sampleFarm from './sample-farm.json'
import { afterJump, bagView, cropView, edgeOf, guildNews, guildStatus, harvestPay, saplingNews, timesOver, readinessView, seedStatus, sourceLinks, splitName, tending, treeView, driftText, pickerView } from './views'

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

describe('tending', () => {
  const crop = (seed: string, patch: Partial<Crop>): Crop => ({ seed, x: 0, y: 0, stage: 1, best: 1, due: 5, wilted: false, perennial: false, notes: '', journal: [], ...patch })
  it('lists crops that are thirsty, waiting to be revived, or ripe, each by seed', () => {
    const state: FarmState = {
      ...fold([], catalog), day: 10,
      crops: [
        crop('thirst', { due: 10 }),
        crop('dead', { due: 8, wilted: true }),
        crop('harvest', { stage: RULES.maxStage, due: 20 }),
        crop('idle', { due: 20 }),
      ],
    }
    expect(tending(state)).toEqual({ thirsty: ['thirst'], revive: ['dead'], ripe: ['harvest'] })
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
    expect(shown).toBe(catalog.seedsOf('haskell-backend').filter((s) => !s.extra).length)
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
    expect(v?.nodes).toHaveLength(catalog.seedsOf('haskell-backend').filter((s) => !s.extra).length)
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
    // pgidx is a shrub with nothing it needs, but the Infra field has roots it could plant and none standing: it waits.
    expect([status('mvcc'), status('k8s'), status('tls'), status('pgidx'), status('mesh')]).toEqual(['rooted', 'growing', 'ready', 'held', 'locked'])
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
      { id: 'a1', name: 'a1', status: 'ready', sapling: false }, { id: 'b1', name: 'b1', status: 'ready', sapling: false }, { id: 'c1', name: 'c1', status: 'locked', sapling: false },
    ], rooted: 0, total: 3, whole: false, dragged: [] }])
  })
})

describe('a guild on the farm', () => {
  // The garden's guild is corn, beans and squash: see `smallPacks`.
  const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
    ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
  const on = (...crops: Crop[]): FarmState => ({ ...smallFarm(), crops })
  const sisters = (s: FarmState) => treeView('garden', s, smallCatalog)?.guilds[0]
  const seed = (id: string) => { const x = bountifulCatalog.seed(id); if (!x) throw new Error('no seed ' + id); return x }

  it('is growing, whole, or dragged by a wilted tree, and says so in a few words', () => {
    const growing = sisters(on(tree('corn'), tree('beans', { perennial: false })))
    expect(growing).toMatchObject({ rooted: 1, total: 3, whole: false, dragged: [] })
    expect(guildStatus(growing!, 5)).toBe('1 of 3 rooted')
    const whole = sisters(on(tree('corn'), tree('beans'), tree('squash')))
    expect(whole).toMatchObject({ rooted: 3, whole: true, dragged: [] })
    expect(guildStatus(whole!, 5)).toBe('whole · pays 5 coins a check-in')
    const dragged = sisters(on(tree('corn', { wilted: true }), tree('beans'), tree('squash', { wilted: true })))
    expect(dragged).toMatchObject({ rooted: 3, whole: false, dragged: ['Corn', 'Squash'] })
    expect(guildStatus(dragged!, 5)).toBe('Corn and Squash have wilted · no pay until revived')
    expect(guildStatus(sisters(on(tree('corn'), tree('beans', { wilted: true }), tree('squash')))!, 5)).toBe('Beans has wilted · no pay until revived')
  })

  it('shows on the crop sheet of each member, and not on a crop that is in no guild', () => {
    const s = on(tree('corn'), tree('beans'), tree('squash'), tree('saw'))
    expect(cropView(tree('corn'), s, smallCatalog)?.guilds).toEqual(['Three sisters guild: whole · pays ' + RULES.guild.coins + ' coins a check-in'])
    expect(cropView(tree('corn'), on(tree('corn')), smallCatalog)?.guilds).toEqual(['Three sisters guild: 1 of 3 rooted'])
    expect(cropView(tree('saw'), s, smallCatalog)?.guilds).toEqual([])
  })

  it('tells of each whole guild after a harvest or a check-in that passed', () => {
    const s = on(tree('corn'), tree('beans'))
    expect(guildNews(seed('corn'), s, bountifulCatalog, true)).toEqual({ coins: 2 * RULES.guild.coins, lines: ['The Tall guild is whole: +5 coins.', 'The Pole and climber guild is whole: +5 coins.'] })
    expect(guildNews(seed('beans'), s, bountifulCatalog, true)).toEqual({ coins: RULES.guild.coins, lines: ['The Pole and climber guild is whole: +5 coins.'] })
    expect(guildNews(seed('squash'), s, bountifulCatalog, true)).toEqual({ coins: 0, lines: [] })
  })

  it('tells which guilds a tree drags after a check-in that wilted it', () => {
    const s = on(tree('corn', { wilted: true }), tree('beans'))
    expect(guildNews(seed('corn'), s, bountifulCatalog, false)).toEqual({ coins: 0, lines: ['The Tall guild pays nothing until Corn is revived.', 'The Pole and climber guild pays nothing until Corn is revived.'] })
    expect(guildNews(seed('beans'), on(tree('corn'), tree('beans', { wilted: true })), bountifulCatalog, false).lines).toEqual(['The Pole and climber guild pays nothing until Beans is revived.'])
    // Another member was wilted already: reviving this one alone will not bring the pay back, so both are named.
    const both = on(tree('corn', { wilted: true }), tree('beans', { wilted: true }))
    expect(guildNews(seed('beans'), both, bountifulCatalog, false).lines).toEqual(['The Pole and climber guild pays nothing until Corn and Beans are revived.'])
    // A crop that is not a tree yet drags nothing: its guild was not whole to begin with.
    expect(guildNews(seed('squash'), on(tree('corn'), tree('beans'), tree('squash', { perennial: false, wilted: true })), bountifulCatalog, false).lines).toEqual([])
  })
})

describe('a seed on the edge of another field', () => {
  // In `bountifulCatalog` the beans sit on the edge of the shed.
  const rich = bountifulCatalog
  const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
    ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
  const on = (...crops: Crop[]): FarmState => ({ ...smallFarm(), crops })
  const seed = (id: string) => { const x = rich.seed(id); if (!x) throw new Error('no seed ' + id); return x }
  const bagged = (s: FarmState, id: string) => bagView(s, rich).flatMap((sec) => sec.seeds).find((x) => x.id === id)

  it('names the field it borders, and whether a harvest would pay double today', () => {
    expect(edgeOf(seed('beans'), on(), rich)).toEqual({ field: 'Shed', live: false })
    expect(edgeOf(seed('beans'), on(tree('saw')), rich)).toEqual({ field: 'Shed', live: true })
    expect(edgeOf(seed('corn'), on(tree('saw')), rich)).toBeNull()
  })

  it('is marked in the seed bag, whether it is waiting to be planted or in the ground', () => {
    expect(bagged(on(), 'beans')?.edge).toBe('Shed')
    expect(bagged(on(tree('beans', { perennial: false })), 'beans')?.edge).toBe('Shed')
    expect(bagged(on(), 'corn')?.edge).toBeNull()
  })

  it('says on its crop sheet what the edge will pay, what it pays, or just where it sits once it is a tree', () => {
    const growing = tree('beans', { perennial: false })
    expect(cropView(growing, on(growing), rich)?.edge).toBe('On the edge of the Shed field: its harvest pays double once you have a tree there.')
    expect(cropView(growing, on(growing, tree('saw')), rich)?.edge).toBe('On the edge of the Shed field: its harvest pays double.')
    expect(cropView(tree('beans'), on(tree('beans'), tree('saw')), rich)?.edge).toBe('On the edge of the Shed field.')
    expect(cropView(tree('corn'), on(tree('corn')), rich)?.edge).toBeNull()
  })

  it('is listed under the learning tree with how its edge stands', () => {
    expect(treeView('garden', on(), rich)?.borders).toEqual([{ id: 'beans', name: 'Beans', field: 'Shed', status: 'no tree there yet' }])
    expect(treeView('garden', on(tree('saw')), rich)?.borders[0]?.status).toBe('pays double')
    expect(treeView('garden', on(tree('saw'), tree('beans')), rich)?.borders[0]?.status).toBe('harvested')
    expect(treeView('shed', on(), rich)?.borders).toEqual([])
  })

  it('is listed under the tree of the field it borders too, so a farmer there knows what a tree is worth', () => {
    expect(treeView('shed', on(), rich)?.bordered).toEqual([{ id: 'beans', name: 'Beans', field: 'Garden', status: 'needs a tree here' }])
    expect(treeView('shed', on(tree('saw')), rich)?.bordered[0]?.status).toBe('pays double')
    expect(treeView('shed', on(tree('saw'), tree('beans')), rich)?.bordered[0]?.status).toBe('harvested')
    expect(treeView('garden', on(), rich)?.bordered).toEqual([])
    // Not from a field the farm does not have: there is nothing there to harvest.
    const shedOnly: FarmState = { ...on(), fields: { shed: 0 } }
    expect(treeView('shed', shedOnly, rich)?.bordered).toEqual([])
  })

  it('says how much more an edge pays in words', () => {
    expect([2, 3, 4].map(timesOver)).toEqual(['double', 'triple', '4 times over'])
  })

  it('says what a harvest paid, and names the field when it paid double', () => {
    expect(harvestPay(seed('beans'), on(tree('beans')), rich)).toEqual({ coins: RULES.harvest.coins, edge: null })
    expect(harvestPay(seed('beans'), on(tree('beans'), tree('saw')), rich)).toEqual({ coins: RULES.edge.times * RULES.harvest.coins, edge: 'Shed' })
    expect(harvestPay(seed('corn'), on(tree('corn'), tree('saw')), rich)).toEqual({ coins: RULES.harvest.coins, edge: null })
  })
})

describe('saplings', () => {
  // In `bountifulCatalog` corn drops popcorn when it is harvested, and popcorn drops the kernel.
  const rich = bountifulCatalog
  const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
    ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
  const on = (...crops: Crop[]): FarmState => ({ ...smallFarm(), crops })
  const seed = (id: string) => { const x = rich.seed(id); if (!x) throw new Error('no seed ' + id); return x }
  const bagged = (s: FarmState, id: string) => bagView(s, rich).flatMap((sec) => sec.seeds).find((x) => x.id === id)
  const growingCorn = tree('corn', { perennial: false })

  it('are out of sight until their tree is harvested, then in the seed bag with where they came from', () => {
    expect(bagged(on(growingCorn), 'popcorn')).toBeUndefined()
    expect(bagged(on(tree('corn')), 'popcorn')).toMatchObject({ status: 'ready', sapling: 'Corn' })
    expect(bagged(on(tree('corn')), 'kernel')).toBeUndefined()
    expect(bagged(on(tree('corn')), 'corn')?.sapling).toBeNull()
  })

  it('join the learning tree when they drop, marked as saplings and tied to the tree they came from', () => {
    const before = treeView('garden', on(growingCorn), rich)
    expect(before?.nodes.map((n) => n.id)).toEqual(['corn', 'beans', 'squash'])
    const after = treeView('garden', on(tree('corn')), rich)
    const corn = after?.nodes.find((n) => n.id === 'corn')
    const popcorn = after?.nodes.find((n) => n.id === 'popcorn')
    expect(popcorn).toMatchObject({ sapling: true, wild: false, status: 'ready' })
    expect(corn?.sapling).toBe(false)
    expect(after?.edges).toContainEqual({ from: { x: corn!.x, y: corn!.y }, to: { x: popcorn!.x, y: popcorn!.y }, rooted: true })
  })

  it('are promised by the tree before they drop: how many, never which', () => {
    expect(treeView('garden', on(), rich)?.drops).toEqual([{ id: 'corn', name: 'Corn', count: 1 }])
    // Corn has dropped its one; the popcorn it dropped now promises one of its own.
    expect(treeView('garden', on(tree('corn')), rich)?.drops).toEqual([{ id: 'popcorn', name: 'Popcorn', count: 1 }])
    expect(treeView('garden', on(tree('corn'), tree('popcorn')), rich)?.drops).toEqual([])
    expect(treeView('shed', on(), rich)?.drops).toEqual([])
  })

  it('say on the crop sheet what a harvest will drop, what it dropped, and where a sapling came from', () => {
    expect(cropView(growingCorn, on(growingCorn), rich)?.saplings).toEqual(['Harvesting it drops 1 sapling: a new seed that grows from this one.'])
    expect(cropView(tree('corn'), on(tree('corn')), rich)?.saplings).toEqual(['It dropped a sapling: Popcorn.'])
    const popcorn = tree('popcorn', { perennial: false })
    expect(cropView(popcorn, on(tree('corn'), popcorn), rich)?.saplings).toEqual(['A sapling of Corn.', 'Harvesting it drops 1 sapling: a new seed that grows from this one.'])
    expect(cropView(tree('beans'), on(tree('beans')), rich)?.saplings).toEqual([])
  })

  it('are announced by the harvest that drops them', () => {
    expect(saplingNews(seed('corn'), rich)).toBe('It dropped a sapling: Popcorn. Find it in your seed bag.')
    expect(saplingNews(seed('beans'), rich)).toBeNull()
    const three = buildCatalog([{ pack: 'p', version: 0, title: 'P', branches: [{ id: 'b', title: 'B' }], seeds: [
      { id: 'oak', name: 'Oak', layer: 'canopy', branch: 'b', tier: 0, harvest: 'artifact', prompts: ['p'] },
      ...['Acorn', 'Gall', 'Leaf'].map((name) => ({ id: name.toLowerCase(), name, layer: 'herb' as const, branch: 'b', tier: 1, sapling_of: 'oak', harvest: 'artifact' as const, prompts: ['p'] })),
    ] }])
    expect(saplingNews(three.seed('oak')!, three)).toBe('It dropped 3 saplings: Acorn, Gall and Leaf. Find them in your seed bag.')
  })

  it('are left out of the count of seeds a field holds, like wild seeds', () => {
    expect(pickerView(rich, on(), []).find((p) => p.pack === 'garden')?.seeds).toBe(3)
    expect(readinessView(on(tree('corn'), tree('popcorn')), rich).rows.find((r) => r.pack === 'garden')).toMatchObject({ rooted: 1, total: 3 })
  })

  it('show in a guild as a sapling, not by name, until they drop', () => {
    const guilded = buildCatalog(bountifulCatalog.packs.map((p) => (p.pack !== 'garden' ? p : { ...p, guilds: [{ id: 'cob', title: 'Cob', seeds: ['corn', 'popcorn'] }] })))
    expect(treeView('garden', on(), guilded)?.guilds[0]?.members).toEqual([
      { id: 'corn', name: 'Corn', status: 'ready', sapling: false }, { id: 'popcorn', name: null, status: 'locked', sapling: true },
    ])
    expect(treeView('garden', on(tree('corn')), guilded)?.guilds[0]?.members[1]).toMatchObject({ name: 'Popcorn', status: 'ready' })
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
    return cropView({ ...crop, ...patch }, { ...s, day }, catalog)
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
    expect(cropView({ seed: 'gone', x: 0, y: 0, stage: 0, best: 0, due: 1, wilted: false, perennial: false, notes: '', journal: [] }, { day: 1, crops: [] }, catalog)).toBeNull()
  })
})

describe('driftText', () => {
  it('says how many entries no longer fit, in the singular and the plural', () => {
    expect(driftText(1)).toMatch(/^1 thing in this farm's history no longer fits/)
    expect(driftText(4)).toMatch(/^4 things in this farm's history no longer fit /)
  })
})

describe('pickerView', () => {
  it('lists every pack with what it is, whether the farm has it, and what is ticked', () => {
    const v = pickerView(catalog, { fields: { kannada: 0 } }, ['infra'])
    expect(v.map((p) => p.pack)).toEqual(catalog.packs.map((p) => p.pack))
    const kannada = v.find((p) => p.pack === 'kannada')
    expect(kannada).toMatchObject({ title: 'Kannada', open: true, ticked: false })
    expect(kannada?.description).toMatch(/Everyday Kannada/)
    expect(kannada?.seeds).toBe(catalog.seedsOf('kannada').length)
    expect(v.find((p) => p.pack === 'infra')).toMatchObject({ open: false, ticked: true })
  })
})

/* ---------- readiness and earned seeds ---------- */

// The small farm whose shed has a kiln, a forge and an anvil that the garden has to earn (see `earningCatalog`).
const c = earningCatalog
const open = (...packs: string[]): FarmState => run(c, [started, ...packs.map((pack, slot) => ({ type: 'field-opened' as const, pack, slot }))])
const standing = (seed: string, patch: Partial<Crop> = {}): Crop => ({ seed, x: 0, y: 0, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
const withCrops = (s: FarmState, ...crops: Crop[]): FarmState => ({ ...s, crops: [...s.crops, ...crops] })
const seedOf = (id: string) => { const seed = c.seed(id); if (!seed) throw new Error('no seed ' + id); return seed }

describe('a seed that has to be earned', () => {
  it('is locked until the learning is on the farm, then ready like any other', () => {
    const s = open('garden', 'shed')
    expect(seedStatus(seedOf('kiln'), s, c)).toBe('locked')
    expect(seedStatus(seedOf('kiln'), withCrops(s, standing('corn')), c)).toBe('ready')
    expect(seedStatus(seedOf('saw'), s, c)).toBe('ready')
  })

  it('stays out of the seed bag, counted with the locked ones, until it is earned', () => {
    const s = open('garden', 'shed')
    const shed = (state: FarmState) => bagView(state, c).find((x) => x.pack === 'shed')
    expect(shed(s)?.seeds.map((x) => x.id)).toEqual(['saw', 'plane'])
    expect(shed(s)?.lockedCount).toBe(4)
    expect(shed(withCrops(s, standing('corn')))?.seeds.map((x) => x.id)).toEqual(['saw', 'plane', 'kiln'])
  })

  it('is offered no jump over the fence, because a jump would not clear it', () => {
    const tree = treeView('shed', open('garden', 'shed'), c)
    // The lathe and the anvil need the saw. The kiln and the forge need nothing: they only have to be earned.
    expect(tree?.locked.map((x) => x.id)).toEqual(['lathe', 'anvil'])
    // A jump clears what the anvil needs and not what it is earned by, and its row says so before energy is spent.
    expect(tree?.locked.map((x) => x.earned)).toEqual([null, 'a seed rooted in another field'])
    const earnedIt = treeView('shed', withCrops(open('garden', 'shed'), standing('corn')), c)
    expect(earnedIt?.locked.map((x) => x.earned)).toEqual([null, null])
    expect(tree?.nodes.filter((n) => n.status === 'locked').map((n) => n.id).sort()).toEqual(['anvil', 'forge', 'kiln', 'lathe'])
  })

  it('says in the tree what earns it and how far along the farm is', () => {
    const s = open('garden', 'shed')
    expect(treeView('shed', s, c)?.earned).toEqual([
      { id: 'kiln', name: 'Kiln', pack: 'shed', line: 'a seed rooted in another field', have: 0, want: 1, met: false, locked: false, held: null },
      { id: 'forge', name: 'Forge', pack: 'shed', line: 'the Garden field at readiness 50', have: 0, want: 50, met: false, locked: false, held: null },
      { id: 'anvil', name: 'Anvil', pack: 'shed', line: 'a seed rooted in another field', have: 0, want: 1, met: false, locked: true, held: null },
    ])
    const one = treeView('shed', withCrops(s, standing('corn')), c)?.earned
    expect(one?.map((x) => [x.id, x.have, x.met])).toEqual([['kiln', 1, true], ['forge', 33, false], ['anvil', 1, true]])
    expect(treeView('garden', s, c)?.earned).toEqual([])
  })

  it('says when a seed has been earned but is still locked by what it needs', () => {
    const rows = treeView('shed', withCrops(open('garden', 'shed'), standing('corn')), c)?.earned
    expect(rows?.map((x) => [x.id, x.met, x.locked])).toEqual([['kiln', true, false], ['forge', false, false], ['anvil', true, true]])
  })

  it('leaves the list once it is in the ground', () => {
    const s = withCrops(open('garden', 'shed'), standing('corn'), standing('kiln', { perennial: false, stage: 0 }))
    expect(treeView('shed', s, c)?.earned.map((x) => x.id)).toEqual(['forge', 'anvil'])
  })
})

describe('readinessView', () => {
  it('has a row for each field the farm has, in pack order, and a number only for a field with an end', () => {
    const v = readinessView(open('garden', 'shed'), c)
    expect(v.rows.map((r) => [r.pack, r.title, r.rooted, r.total, r.growing])).toEqual([['garden', 'Garden', 0, 3, 0], ['shed', 'Shed', 0, 6, 0]])
    expect(v.rows[0]?.readiness).toEqual({
      percent: 0, bar: RULES.readiness.bar, atBar: false, hollow: ['Canopy', 'Ground cover', 'Vine'],
      layers: [{ layer: 'canopy', name: 'Canopy', rooted: 0, total: 1 }, { layer: 'ground-cover', name: 'Ground cover', rooted: 0, total: 1 }, { layer: 'vine', name: 'Vine', rooted: 0, total: 1 }],
    })
    expect(v.rows[1]?.readiness).toBeNull()
    expect(readinessView(open('shed'), c).rows.map((r) => r.pack)).toEqual(['shed'])
  })

  it('counts what stands, what is growing, and the fields at their bar', () => {
    const s = run(c, [{ type: 'bar-set', pack: 'garden', bar: 60 }], open('garden', 'shed'))
    const part = readinessView(withCrops(s, standing('corn'), standing('beans'), standing('squash', { perennial: false, stage: 2 }), standing('saw')), c)
    expect(part.rows[0]).toMatchObject({ rooted: 2, growing: 1, readiness: { percent: 66, bar: 60, atBar: false, hollow: ['Ground cover'] } })
    expect(part.rows[1]).toMatchObject({ rooted: 1, growing: 0 })
    expect({ atBar: part.atBar, withBar: part.withBar }).toEqual({ atBar: 0, withBar: 1 })
    const all = readinessView(withCrops(s, standing('corn'), standing('beans'), standing('squash')), c)
    expect(all.rows[0]?.readiness).toMatchObject({ percent: 100, atBar: true, hollow: [] })
    expect({ atBar: all.atBar, withBar: all.withBar }).toEqual({ atBar: 1, withBar: 1 })
  })

  it('does not count a wild seed, rooted or growing, on either side', () => {
    const v = readinessView(withCrops(open('garden', 'shed'), standing('bees')), c)
    expect(v.rows[0]).toMatchObject({ rooted: 0, total: 3, growing: 0 })
  })

  it("gives the learning tree its field's readiness in a line, and none for a field with no end", () => {
    const s = withCrops(open('garden', 'shed'), standing('corn'))
    expect(treeView('garden', s, c)?.readiness).toEqual({ percent: 33, bar: RULES.readiness.bar, atBar: false, hollow: ['Ground cover', 'Vine'] })
    expect(treeView('shed', s, c)?.readiness).toBeNull()
  })

  it('lists what is still to be earned in the fields the farm has, and nothing from a field it has not', () => {
    expect(readinessView(open('garden', 'shed'), c).earned.map((x) => x.id)).toEqual(['kiln', 'forge', 'anvil'])
    expect(readinessView(open('garden'), c).earned).toEqual([])
  })
})

describe('a seed that layer balance holds back', () => {
  // The garden from the ground up: beet (root), squash (ground cover, locked), thyme (herb), corn (canopy), and beans (a vine).
  const lc = layeredCatalog
  const fresh = (): FarmState => run(lc, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }])
  const of = (id: string) => { const seed = lc.seed(id); if (!seed) throw new Error('no seed ' + id); return seed }

  it('is held, not ready and not locked', () => {
    const s = fresh()
    expect(['corn', 'thyme', 'beet', 'beans', 'squash'].map((id) => seedStatus(of(id), s, lc))).toEqual(['held', 'held', 'ready', 'ready', 'locked'])
    const planted = withCrops(s, standing('beet', { perennial: false, stage: 0 }))
    expect(['corn', 'thyme'].map((id) => seedStatus(of(id), planted, lc))).toEqual(['held', 'ready'])
  })

  it('stays in the seed bag with the layer to plant in first, and cannot be picked up', () => {
    const garden = bagView(fresh(), lc).find((x) => x.pack === 'garden')
    expect(garden?.seeds.map((x) => [x.id, x.status, x.below])).toEqual([['corn', 'held', 'Root'], ['beans', 'ready', null], ['beet', 'ready', null], ['thyme', 'held', 'Root']])
    // Locked: the squash and the maple by what they need, the elm because it is not earned.
    expect(garden?.lockedCount).toBe(3)
  })

  it('is never the seed in hand, even if it was picked up before it was held', () => {
    const garden = bagView(fresh(), lc, 'corn').find((x) => x.pack === 'garden')
    expect(garden?.seeds.find((x) => x.id === 'corn')).toMatchObject({ status: 'held', selected: false })
  })

  it('is drawn as held in the learning tree, which lists what each one waits for', () => {
    const tree = treeView('garden', fresh(), lc)
    expect(tree?.nodes.filter((n) => n.status === 'held').map((n) => n.id).sort()).toEqual(['corn', 'thyme'])
    expect(tree?.held).toEqual([{ id: 'corn', name: 'Corn', layer: 'Canopy', below: 'Root' }, { id: 'thyme', name: 'Thyme', layer: 'Herb', below: 'Root' }])
    expect(tree?.locked.map((x) => x.id)).toEqual(['squash', 'maple'])
    expect(treeView('shed', fresh(), lc)?.held).toEqual([])
  })

  it('warns before a jump that the seed will still wait for a lower layer, and says so after it', () => {
    const s = fresh()
    expect(treeView('garden', s, lc)?.locked).toEqual([
      { id: 'squash', name: 'Squash', needs: 'Corn + Beans', earned: null, held: null },
      { id: 'maple', name: 'Maple', needs: 'Thyme', earned: null, held: 'Root' },
    ])
    const jumped = { ...s, unlocked: ['maple', 'squash'] }
    expect(afterJump(of('maple'), jumped, lc)).toBe('It waits for a lower layer: the Root layer of the Garden field is hollow, so plant there first.')
    expect(afterJump(of('squash'), jumped, lc)).toBe('Plant it from the seed bag.')
  })

  it('says after a jump that a seed has still to be earned, before anything about layers', () => {
    const s = { ...open('garden', 'shed'), unlocked: ['anvil'] }
    expect(afterJump(seedOf('anvil'), s, c)).toBe('It has still to be earned: that takes a seed rooted in another field.')
  })

  it('never calls an earned seed ready to plant while a lower layer holds it', () => {
    // The elm is earned by a tree in the shed. With the saw rooted it is earned, and it still waits for the root layer.
    const s = withCrops(fresh(), standing('saw'))
    expect(seedStatus(of('elm'), s, lc)).toBe('held')
    expect(treeView('garden', s, lc)?.earned).toEqual([{ id: 'elm', name: 'Elm', pack: 'garden', line: 'a seed rooted in another field', have: 1, want: 1, met: true, locked: false, held: 'Root' }])
  })
})
