// Saplings: seeds a tree drops when it is harvested. In `bountifulCatalog` corn drops popcorn, and popcorn the kernel.
import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { bountifulCatalog as rich, bountifulPacks, harvestEvent, NOTES, run, smallFarm, waterEvent } from './fixtures'
import { allowed, check, fold, refusedCount } from './fold'
import { earnedProgress, heldBy, readiness } from './readiness'
import { available, visible } from './rules'
import type { Crop, FarmEvent, FarmState } from './types'

const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
  ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
const farm = (...crops: Crop[]): FarmState => ({ ...smallFarm(), crops })
const seed = (id: string) => { const s = rich.seed(id); if (!s) throw new Error('no seed ' + id); return s }
const plant = (id: string, x = 5, y = 5): FarmEvent => ({ type: 'planted', seed: id, x, y, notes: NOTES })

describe('the catalogue', () => {
  it('knows which tree a sapling drops from, and which saplings a tree drops', () => {
    expect(seed('popcorn').saplingOf).toBe('corn')
    expect(seed('corn').saplingOf).toBeNull()
    expect(rich.saplingsOf('corn').map((s) => s.id)).toEqual(['popcorn'])
    expect(rich.saplingsOf('popcorn').map((s) => s.id)).toEqual(['kernel'])
    expect(rich.saplingsOf('beans')).toEqual([])
    expect(rich.saplingsOf('nope')).toEqual([])
  })

  it('counts a sapling as an extra, like a wild seed, and nothing else as one', () => {
    expect(['popcorn', 'kernel', 'bees', 'corn', 'saw'].map((id) => seed(id).extra)).toEqual([true, true, true, false, false])
    expect(seed('popcorn').wild).toBe(false)
  })
})

describe('a sapling', () => {
  it('is hidden until the tree it drops from is rooted', () => {
    expect(visible(seed('popcorn'), farm())).toBe(false)
    expect(visible(seed('popcorn'), farm(tree('corn', { perennial: false })))).toBe(false)
    expect(visible(seed('popcorn'), farm(tree('corn')))).toBe(true)
  })

  it('stays in the bag when its parent wilts: it has dropped, and a tree is rooted all the same', () => {
    expect(visible(seed('popcorn'), farm(tree('corn', { wilted: true })))).toBe(true)
  })

  it('drops its own saplings in turn, and not before', () => {
    expect(visible(seed('kernel'), farm(tree('corn')))).toBe(false)
    expect(visible(seed('kernel'), farm(tree('corn'), tree('popcorn', { perennial: false })))).toBe(false)
    expect(visible(seed('kernel'), farm(tree('corn'), tree('popcorn')))).toBe(true)
  })

  it('is not found by foraging: a place in the bag of volunteers does not show it', () => {
    expect(visible(seed('popcorn'), { ...farm(), volunteers: ['popcorn'] })).toBe(false)
    expect(check(farm(tree('corn')), { type: 'domesticated', seed: 'popcorn' }, rich)).toBe('Only wild seeds can be domesticated.')
  })

  it('cannot be planted or jumped to while it is hidden, and can be planted once it has dropped', () => {
    expect(available(seed('popcorn'), farm())).toBe(false)
    expect(check(farm(), plant('popcorn'), rich)).toBe('Popcorn is still locked.')
    expect(check(farm(), { type: 'unlocked', seed: 'popcorn', ok: true }, rich)).toBe('That seed is not in your tree yet.')
    const dropped = farm(tree('corn'))
    expect(available(seed('popcorn'), dropped)).toBe(true)
    expect(check(dropped, plant('popcorn'), rich)).toBeNull()
  })

  it('is dropped by a harvest, in a log as on a farm', () => {
    const ripe = farm(tree('corn', { perennial: false, due: 9 }))
    expect(check(ripe, plant('popcorn', 6, 5), rich)).toBe('Popcorn is still locked.')
    const harvested = run(rich, [{ type: 'harvested', seed: 'corn', ok: true }], ripe)
    expect(check(harvested, plant('popcorn', 6, 5), rich)).toBeNull()
    expect(run(rich, [plant('popcorn', 6, 5)], harvested).crops.map((c) => c.seed)).toEqual(['corn', 'popcorn'])
  })
})

describe('a sapling is an extra', () => {
  it("never changes a field's readiness: dropping one does not lower it, and rooting one does not raise it", () => {
    const bare = buildCatalog(bountifulPacks.map((p) => ({ ...p, seeds: p.seeds.filter((s) => s.sapling_of === undefined) })))
    for (const s of [farm(), farm(tree('corn')), farm(tree('corn'), tree('popcorn')), farm(tree('corn'), tree('popcorn'), tree('kernel'))]) {
      expect(readiness('garden', s, rich)).toEqual(readiness('garden', s, bare))
    }
    expect(readiness('garden', farm(tree('corn'), tree('popcorn')), rich)).toMatchObject({ total: 3, rooted: 1 })
  })

  it('does not fill a layer, and never holds another seed back', () => {
    // The garden has no root and no herb of its own: only the saplings are in those layers.
    expect(readiness('garden', farm(tree('corn')), rich)?.layers.map((l) => l.layer)).toEqual(['canopy', 'ground-cover', 'vine'])
    expect(heldBy(seed('corn'), farm(), rich)).toBeNull()
    expect(heldBy(seed('popcorn'), farm(tree('corn')), rich)).toBeNull()
  })

  it('does not count towards what earns a seed', () => {
    const kiln = { ...seed('saw'), earned: { kind: 'rooted' as const, pack: 'garden', count: 1 } }
    expect(earnedProgress(kiln, farm(tree('popcorn')), rich)).toMatchObject({ have: 0, met: false })
    expect(earnedProgress(kiln, farm(tree('corn'), tree('popcorn')), rich)).toMatchObject({ have: 1, met: true })
  })
})

describe('a pack that gains saplings', () => {
  const before = buildCatalog(bountifulPacks.map((p) => ({ ...p, seeds: p.seeds.filter((s) => s.sapling_of === undefined) })))
  /** A farm played before the pack had saplings: corn is planted, watered up the ladder and harvested. */
  function played(): FarmEvent[] {
    const log: FarmEvent[] = [
      { type: 'farm-started', day: 1, energy: 90, coins: 140, barrel: 0 },
      { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 },
      plant('corn'),
    ]
    let s = fold(log, before)
    for (let day = 0; day < 30 && !s.crops.some((c) => c.perennial); day++) {
      for (const e of [harvestEvent(before, 'corn'), waterEvent(before, s, 'corn'), { type: 'slept' } as FarmEvent]) {
        if (e && check(s, e, before) === null) { log.push(e); s = fold(log, before) }
      }
    }
    return log
  }

  it('leaves a saved farm that harvested the tree as it was: nothing in its log is refused, and the farm is the same', () => {
    const log = played()
    expect(log.some((e) => e.type === 'harvested')).toBe(true)
    expect(fold(log, before).crops.map((c) => [c.seed, c.perennial])).toEqual([['corn', true]])
    expect(refusedCount(log, rich)).toBe(0)
    // Corn is a guild of one in the new pack, so its harvest and check-ins now pay: the coins may only have grown.
    const then = fold(log, before)
    const now = fold(log, rich)
    expect({ ...now, coins: 0 }).toEqual({ ...then, coins: 0 })
    expect(now.coins).toBeGreaterThanOrEqual(then.coins)
  })

  it('has dropped the new seed from the tree that farm already harvested', () => {
    const s = fold(played(), rich)
    expect(visible(seed('popcorn'), s)).toBe(true)
    expect(allowed(s, plant('popcorn', 6, 5), rich)).toBeNull()
    expect(visible(seed('kernel'), s)).toBe(false)
  })
})
