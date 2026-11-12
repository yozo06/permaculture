import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { readiness } from './readiness'
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
