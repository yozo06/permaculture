import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import sampleFarm from '../game/sample-farm.json'
import { buildCatalog } from './catalog'
import { fieldOf } from './land'
import { upgradeV2 } from './v2'

const catalog = buildCatalog(collectPacks())

function upgraded() {
  const s = upgradeV2(sampleFarm, catalog)
  if (!s) throw new Error('the sample farm should upgrade')
  return s
}

describe('upgradeV2 on the prototype farm', () => {
  it('keeps every crop, each inside its own pack field', () => {
    const s = upgraded()
    expect(s.crops).toHaveLength(sampleFarm.crops.length)
    for (const c of s.crops) expect(fieldOf(c.x, c.y, s.fields, s.cleared)).toBe(catalog.seed(c.id)?.pack)
  })

  it('gives the four Phase 0 fields their old places and opens the Workshop at slot 4', () => {
    expect(upgraded().fields).toEqual({ 'haskell-backend': 0, 'system-design': 1, infra: 2, kannada: 3, workshop: 4 })
  })

  it('starts the day with nothing spent', () => {
    expect(upgraded().today).toEqual({ spent: {} })
  })

  it('does not change a thing when run twice', () => {
    const once = upgraded()
    expect(upgradeV2(once, catalog)).toEqual(once)
    expect(upgradeV2(JSON.parse(JSON.stringify(once)), catalog)).toEqual(once)
  })
})

describe('upgradeV2 on older names', () => {
  const old = {
    ...sampleFarm,
    cleared: { '8,5': 'hs', '1,1': 'grass', '3,3': 'nowhere', 'x,y': 'sd' },
    focus: { hs: 1, sd: null, inf: 0, kn: 7 },
    foraged: ['f1', 'f12', 'f99'],
    volunteers: ['nonmoving', 'no-such-seed'],
  }

  it('renames field keys in cleared and focus, turning branch numbers into branch ids', () => {
    const s = upgradeV2(old, catalog)
    expect(s?.cleared).toEqual({ '8,5': 'haskell-backend', '1,1': 'grass' })
    expect(s?.focus).toEqual({ 'haskell-backend': 'types-and-effects', infra: 'network-and-platform' })
  })

  it('renames the Phase 0 finds and drops unknown ones', () => {
    expect(upgradeV2(old, catalog)?.foraged).toEqual(['flexible-paxos', 'whnf'])
  })

  it('drops seeds that are not in the packs', () => {
    expect(upgradeV2(old, catalog)?.volunteers).toEqual(['nonmoving'])
    const s = upgradeV2({ ...sampleFarm, crops: [...sampleFarm.crops, { id: 'gone', x: 5, y: 7, stage: 0, lw: 1, wilted: false, per: false }] }, catalog)
    expect(s?.crops).toHaveLength(sampleFarm.crops.length)
  })

  it('drops a crop that is not on its own field, or is planted twice', () => {
    const crop = { id: 'stm', x: 12, y: 5, stage: 0, lw: 1, wilted: false, per: false }
    expect(upgradeV2({ ...sampleFarm, crops: [crop] }, catalog)?.crops).toEqual([])
    const twice = [sampleFarm.crops[0], { ...sampleFarm.crops[0], x: 5, y: 7 }]
    expect(upgradeV2({ ...sampleFarm, crops: twice }, catalog)?.crops).toHaveLength(1)
  })

  it('keeps a field layout that is already there and places new packs after it', () => {
    const s = upgradeV2({ ...sampleFarm, fields: { kannada: 0, infra: 2 } }, catalog)
    expect(s?.fields).toEqual({ kannada: 0, infra: 2, 'haskell-backend': 1, 'system-design': 3, workshop: 4 })
  })
})

describe('upgradeV2 on anything else', () => {
  it('refuses what is not a v2 farm', () => {
    for (const v of [null, 3, 'farm', [], {}, { v: 2 }, { v: 2, crops: [] }, { v: 3, crops: [], farmer: {} }]) expect(upgradeV2(v, catalog)).toBeNull()
  })

  it('never throws on odd contents', () => {
    const junk = fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.array(fc.anything()), fc.dictionary(fc.string(), fc.anything()))
    fc.assert(
      fc.property(junk, junk, junk, junk, junk, (crops, farmer, fields, focus, today) => {
        const s = upgradeV2({ v: 2, crops, farmer, fields, focus, today, cleared: focus, foraged: crops }, catalog)
        if (s) expect(upgradeV2(s, catalog)).toEqual(s)
      }),
    )
  })
})
