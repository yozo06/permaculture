import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { GROUND_UP, earnedLine, earnedProgress, heldBy, isEarned, readiness } from './readiness'
import { RULES } from './rules'
import type { Crop, Layer, PackDef, SeedDef } from './types'

const seed = (id: string, layer: Layer, more: Partial<SeedDef> = {}): SeedDef =>
  ({ id, name: id, layer, branch: 'b', tier: 0, harvest: 'artifact', prompts: ['Show it.'], ...more })
const pack = (id: string, seeds: SeedDef[], more: Partial<PackDef> = {}): PackDef =>
  ({ pack: id, version: 0, title: id, branches: [{ id: 'b', title: 'B' }], seeds, ...more })

/** Two canopy seeds, a herb, a root, and a wild vine that has to be found first. */
const orchard = pack('orchard', [seed('oak', 'canopy'), seed('elm', 'canopy'), seed('mint', 'herb'), seed('beet', 'root'), seed('hop', 'vine', { wild: true })])
const catalog = buildCatalog([orchard, pack('other', [seed('fern', 'herb')]), pack('tongue', [seed('word', 'herb')], { perennial: true })])

const crop = (id: string, more: Partial<Crop> = {}): Crop =>
  ({ seed: id, x: 0, y: 0, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...more })
const of = (...crops: Crop[]) => readiness('orchard', { crops, bars: {} }, catalog)

describe('readiness', () => {
  it('is nothing for a field with nothing rooted, and every layer it has is hollow', () => {
    expect(of()).toMatchObject({ pack: 'orchard', total: 4, rooted: 0, percent: 0, hollow: ['canopy', 'herb', 'root'] })
  })

  it('counts a tree, and not a crop that is still growing', () => {
    expect(of(crop('oak'), crop('mint', { perennial: false, stage: 3 }))).toMatchObject({ rooted: 1, percent: 25, hollow: ['herb', 'root'] })
  })

  it('does not count a tree that has wilted, and its layer is hollow until it comes back', () => {
    expect(of(crop('oak'), crop('beet', { wilted: true }))).toMatchObject({ rooted: 1, percent: 25, hollow: ['herb', 'root'] })
  })

  it('rounds down, so only a field with every seed rooted reads 100', () => {
    const three = buildCatalog([pack('orchard', [seed('oak', 'canopy'), seed('elm', 'canopy'), seed('mint', 'herb')])])
    const at = (...ids: string[]) => readiness('orchard', { crops: ids.map((id) => crop(id)), bars: {} }, three)?.percent
    expect([at('oak'), at('oak', 'elm'), at('oak', 'elm', 'mint')]).toEqual([33, 66, 100])
  })

  it('lists each layer the catalogue has, from the canopy down, with how much of it stands', () => {
    expect(of(crop('oak'), crop('mint'))?.layers).toEqual([
      { layer: 'canopy', total: 2, rooted: 1 },
      { layer: 'herb', total: 1, rooted: 1 },
      { layer: 'root', total: 1, rooted: 0 },
    ])
  })

  it('leaves wild seeds out altogether: finding one never lowers readiness, and rooting one never raises it', () => {
    const r = of(crop('oak'), crop('hop'))
    expect(r).toMatchObject({ total: 4, rooted: 1, percent: 25 })
    expect(r?.layers.map((l) => l.layer)).not.toContain('vine')
  })

  it('looks only at the crops of its own field', () => {
    expect(of(crop('fern'))).toMatchObject({ rooted: 0, percent: 0 })
  })

  it('has no answer for a field with no end, or for a pack it does not know', () => {
    expect(readiness('tongue', { crops: [crop('word')], bars: {} }, catalog)).toBeNull()
    expect(readiness('nowhere', { crops: [], bars: {} }, catalog)).toBeNull()
  })

  it('reads 0, not a broken number, for a field whose every seed is wild', () => {
    const wild = buildCatalog([pack('orchard', [seed('hop', 'vine', { wild: true })])])
    expect(readiness('orchard', { crops: [crop('hop')], bars: {} }, wild)).toMatchObject({ total: 0, rooted: 0, percent: 0, hollow: [] })
  })

  it("takes its bar from the farmer, else from the pack, else from the rules", () => {
    const withBar = buildCatalog([{ ...orchard, readiness_bar: 60 }])
    expect(of()?.bar).toBe(RULES.readiness.bar)
    expect(readiness('orchard', { crops: [], bars: {} }, withBar)?.bar).toBe(60)
    expect(readiness('orchard', { crops: [], bars: { orchard: 45 } }, withBar)?.bar).toBe(45)
    expect(readiness('orchard', { crops: [], bars: { other: 45 } }, withBar)?.bar).toBe(60)
  })

  it('is at its bar only when the number is there and no layer is hollow', () => {
    const at = (bar: number, ...ids: string[]) => readiness('orchard', { crops: ids.map((id) => crop(id)), bars: { orchard: bar } }, catalog)?.atBar
    // Three of four is 75, but nothing stands in the root layer.
    expect(at(75, 'oak', 'elm', 'mint')).toBe(false)
    expect(at(75, 'oak', 'mint', 'beet')).toBe(true)
    expect(at(76, 'oak', 'mint', 'beet')).toBe(false)
    expect(at(100, 'oak', 'elm', 'mint', 'beet')).toBe(true)
  })

  it('is never at its bar with nothing to root', () => {
    const wild = buildCatalog([pack('orchard', [seed('hop', 'vine', { wild: true })], { readiness_bar: 0 })])
    expect(readiness('orchard', { crops: [], bars: {} }, wild)?.atBar).toBe(false)
  })
})

describe('what a seed is earned by', () => {
  // A workshop whose tools are earned by what grows in the orchard and the other field.
  const tools = pack('tools', [
    seed('free', 'herb'),
    seed('any', 'herb', { earned: { rooted: 2 } }),
    seed('one', 'herb', { earned: { rooted: 1 } }),
    seed('oaks', 'herb', { earned: { pack: 'orchard', rooted: 2 } }),
    seed('ready', 'herb', { earned: { pack: 'orchard', readiness: 50 } }),
    seed('never', 'herb', { earned: { pack: 'tongue', readiness: 10 } }),
    seed('gone', 'herb', { earned: { pack: 'nowhere', rooted: 1 } }),
  ], { perennial: true })
  const c = buildCatalog([orchard, pack('other', [seed('fern', 'herb')]), pack('tongue', [seed('word', 'herb')], { perennial: true }), tools])
  const progress = (id: string, ...crops: Crop[]) => {
    const s = c.seed(id)
    if (!s) throw new Error('no seed ' + id)
    return earnedProgress(s, { crops, bars: {} }, c)
  }
  const line = (id: string) => { const e = c.seed(id)?.earned; return e ? earnedLine(e, c) : null }

  it('is nothing for a seed that asks for nothing, which is always earned', () => {
    expect(progress('free')).toBeNull()
    const free = c.seed('free')
    expect(free && isEarned(free, { crops: [], bars: {} }, c)).toBe(true)
  })

  it('counts trees in every field but its own', () => {
    expect(progress('any')).toEqual({ have: 0, want: 2, met: false })
    expect(progress('any', crop('oak'))).toEqual({ have: 1, want: 2, met: false })
    expect(progress('any', crop('oak'), crop('fern'))).toEqual({ have: 2, want: 2, met: true })
    expect(progress('any', crop('oak'), crop('free'), crop('one'))).toEqual({ have: 1, want: 2, met: false })
  })

  it('counts a tree and not a crop that is still growing, and never a wild seed', () => {
    expect(progress('one', crop('oak', { perennial: false, stage: 4 }))).toMatchObject({ have: 0, met: false })
    expect(progress('one', crop('hop'))).toMatchObject({ have: 0, met: false })
    expect(progress('one', crop('word'))).toMatchObject({ have: 1, met: true })
  })

  it('keeps counting a tree that a wrong check-in has wilted: what was rooted stays earned', () => {
    expect(progress('one', crop('oak', { wilted: true }))).toMatchObject({ have: 1, met: true })
  })

  it('counts trees in the one field it names', () => {
    expect(progress('oaks', crop('oak'), crop('fern'), crop('word'))).toEqual({ have: 1, want: 2, met: false })
    expect(progress('oaks', crop('oak'), crop('mint'))).toEqual({ have: 2, want: 2, met: true })
  })

  it("follows a field's readiness as it stands today, so it can be lost again", () => {
    expect(progress('ready', crop('oak'))).toEqual({ have: 25, want: 50, met: false })
    expect(progress('ready', crop('oak'), crop('elm'))).toEqual({ have: 50, want: 50, met: true })
    expect(progress('ready', crop('oak'), crop('elm', { wilted: true }))).toEqual({ have: 25, want: 50, met: false })
  })

  it('is never earned from a field with no readiness or a pack that is not there', () => {
    expect(progress('never', crop('word'))).toEqual({ have: 0, want: 10, met: false })
    expect(progress('gone', crop('oak'))).toEqual({ have: 0, want: 1, met: false })
  })

  it('says it in words a farmer can act on', () => {
    expect(line('one')).toBe('a seed rooted in another field')
    expect(line('any')).toBe('2 seeds rooted in other fields')
    expect(line('oaks')).toBe('2 seeds rooted in the orchard field')
    expect(line('ready')).toBe('the orchard field at readiness 50')
    expect(line('gone')).toBe('a seed rooted in the nowhere field')
    expect(line('free')).toBeNull()
  })
})

describe('layer balance', () => {
  // A field with every layer. The second root needs the first, and one seed of the ground cover has to be earned.
  const tall = pack('tall', [
    seed('tap', 'root'), seed('deep', 'root', { tier: 1, needs: ['tap'] }),
    seed('moss', 'ground-cover'), seed('clover', 'ground-cover', { earned: { rooted: 1 } }),
    seed('mint', 'herb'), seed('rose', 'shrub'), seed('hazel', 'understory'), seed('oak', 'canopy'), seed('hop', 'vine'),
    seed('truffle', 'root', { wild: true }),
  ])
  const c = buildCatalog([tall, pack('other', [seed('fern', 'herb'), seed('pine', 'canopy')]), pack('tongue', [seed('word', 'root'), seed('song', 'canopy')], { perennial: true })])
  const farm = (crops: Crop[] = [], more: { unlocked?: string[]; volunteers?: string[] } = {}) => ({ crops, bars: {}, unlocked: [], volunteers: [], ...more })
  const held = (id: string, crops: Crop[] = [], more: { unlocked?: string[]; volunteers?: string[] } = {}) => {
    const s = c.seed(id)
    if (!s) throw new Error('no seed ' + id)
    return heldBy(s, farm(crops, more), c)
  }
  const growing = (id: string) => crop(id, { perennial: false, stage: 1 })

  it('builds a field from the ground up, with the vines left out', () => {
    expect(GROUND_UP).toEqual(['root', 'ground-cover', 'herb', 'shrub', 'understory', 'canopy'])
  })

  it('holds a seed while a layer two or more below it is hollow and has something to plant', () => {
    expect(held('mint')).toBe('root')
    expect(held('rose')).toBe('root')
    expect(held('oak')).toBe('root')
  })

  it('never holds the two lowest layers, or a layer only one above a hollow one', () => {
    expect(held('tap')).toBeNull()
    expect(held('moss')).toBeNull()
    // The root has a tree; the ground cover is hollow, and the herb is only one layer above it.
    expect(held('mint', [crop('tap')])).toBeNull()
    expect(held('rose', [crop('tap')])).toBe('ground-cover')
  })

  it('lets go once everything that could be planted in the hollow layer is in the ground', () => {
    // The first root is growing and the second still needs it: the root layer is hollow, with nothing left to plant.
    expect(held('mint', [growing('tap')])).toBeNull()
    expect(held('rose', [growing('tap')])).toBe('ground-cover')
    expect(held('rose', [growing('tap'), growing('moss')])).toBeNull()
  })

  it('lets go once a tree stands in the layer, whatever else could be planted there', () => {
    expect(held('rose', [crop('tap'), crop('moss')])).toBeNull()
    expect(held('oak', [crop('tap'), crop('moss'), crop('mint'), crop('rose')])).toBeNull()
  })

  it('names the lowest layer in the way, so there is always somewhere to begin', () => {
    expect(held('oak', [crop('tap')])).toBe('ground-cover')
    expect(held('oak', [crop('tap'), crop('moss')])).toBe('herb')
    expect(held('oak', [crop('tap'), crop('moss'), crop('mint')])).toBe('shrub')
    // The understory is hollow, but it is only one below the canopy.
    expect(held('oak', [crop('tap'), crop('moss'), crop('mint'), crop('rose')])).toBeNull()
  })

  it('holds again when the only tree in a layer wilts and there is something to plant there', () => {
    // The first root is a wilted tree. It still counts as rooted for what the second root needs, so that one can be planted.
    expect(held('mint', [crop('tap', { wilted: true })])).toBe('root')
    expect(held('mint', [crop('tap', { wilted: true }), growing('deep')])).toBeNull()
  })

  it('does not count a seed that cannot be planted today: one that is locked, not earned, or wild', () => {
    // Ground cover: moss is growing, clover is not earned. Nothing there can be planted, so the shrub is free.
    expect(held('rose', [crop('tap'), growing('moss')])).toBeNull()
    // Once clover is earned (a tree in another field), it can be planted, and the shrub waits for it.
    expect(held('rose', [crop('tap'), growing('moss'), crop('fern')])).toBe('ground-cover')
    // A wild root that has been found is an extra: it never holds anything back.
    expect(held('mint', [growing('tap')], { volunteers: ['truffle'] })).toBeNull()
  })

  it('counts a seed that a jump over the fence has made plantable', () => {
    expect(held('mint', [growing('tap')], { unlocked: ['deep'] })).toBe('root')
  })

  it('leaves vines alone: they climb through every layer', () => {
    expect(held('hop')).toBeNull()
  })

  it('looks only at its own field, and never at a field with no end', () => {
    // The other field has a herb and a canopy seed. Its herb holds its canopy back; the tall field's hollow root does not.
    expect(held('pine')).toBe('herb')
    expect(held('pine', [growing('fern')])).toBeNull()
    // The tongue has a root and a canopy seed and no end, so it has no hollow layers and nothing waits.
    expect(held('song')).toBeNull()
  })

  it('never leaves a field with nothing to plant: of the seeds that could go in, the lowest is always free', () => {
    const seeds = c.seedsOf('tall')
    const states = [[], [growing('tap')], [crop('tap')], [crop('tap', { wilted: true })], [crop('tap'), growing('moss'), crop('fern')], [growing('moss')], [crop('moss'), crop('mint')]]
    for (const crops of states) {
      const could = seeds.filter((x) => !x.wild && !crops.some((k) => k.seed === x.id) && (x.needs.every((n) => crops.some((k) => k.seed === n && k.perennial))) && isEarned(x, farm(crops), c))
      expect(could.some((x) => heldBy(x, farm(crops), c) === null), JSON.stringify(crops.map((k) => k.seed))).toBe(true)
    }
  })
})
