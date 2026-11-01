import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import sampleFarm from '../game/sample-farm.json'
import { buildCatalog } from './catalog'
import { fieldOf } from './land'
import { RULES, interval } from './rules'
import { fromV2 } from './v2'

const catalog = buildCatalog(collectPacks())

function converted() {
  const s = fromV2(sampleFarm, catalog)
  if (!s) throw new Error('the sample farm should convert')
  return s
}

describe('fromV2 on the prototype farm', () => {
  it('keeps every crop, each inside its own pack field', () => {
    const s = converted()
    expect(s.crops).toHaveLength(sampleFarm.crops.length)
    for (const c of s.crops) expect(fieldOf(c.x, c.y, s.fields, s.cleared)).toBe(catalog.seed(c.seed)?.pack)
  })

  it('gives the four Phase 0 fields their old places and leaves the Workshop for the game to open', () => {
    expect(converted().fields).toEqual({ 'haskell-backend': 0, 'system-design': 1, infra: 2, kannada: 3 })
  })

  it('carries the numbers over and starts the day with nothing spent', () => {
    const s = converted()
    expect(s).toMatchObject({ day: 12, energy: 90, energyMax: 90, coins: 140, barrel: 2, night: null })
    expect(s.today).toEqual({ planted: 0, spent: {} })
    expect(s.compost).toEqual(['rl', 'gc'])
  })

  it('turns the day of the last watering into the day it is due', () => {
    const s = converted()
    for (const raw of sampleFarm.crops) {
      const c = s.crops.find((x) => x.seed === raw.id)
      expect(c?.perennial).toBe(raw.per)
      if (!raw.wilted) expect(c?.due).toBe(raw.lw + interval({ perennial: raw.per, stage: c?.stage ?? 0 }))
    }
  })

  it('keeps perennials at the top stage, and lets a wilted crop be revived at once', () => {
    const s = converted()
    expect(s.crops.filter((c) => c.perennial).every((c) => c.stage === RULES.maxStage)).toBe(true)
    for (const c of s.crops.filter((x) => x.wilted)) expect(c.due).toBeLessThanOrEqual(s.day)
  })

  it('shares nothing with the input', () => {
    const s = converted()
    s.crops[0] = { ...s.crops[0]!, x: 99 }
    expect(sampleFarm.crops[0]?.x).toBe(5)
  })
})

describe('fromV2 on older names', () => {
  const old = {
    ...sampleFarm,
    cleared: { '8,5': 'hs', '1,1': 'grass', '3,3': 'nowhere', 'x,y': 'sd' },
    focus: { hs: 1, sd: null, inf: 0, kn: 7 },
    foraged: ['f1', 'f12', 'f99'],
    volunteers: ['nonmoving', 'no-such-seed'],
  }

  it('renames field keys in cleared and focus, turning branch numbers into branch ids', () => {
    const s = fromV2(old, catalog)
    expect(s?.cleared).toEqual({ '8,5': 'haskell-backend', '1,1': 'grass' })
    expect(s?.focus).toEqual({ 'haskell-backend': 'types-and-effects', infra: 'network-and-platform' })
  })

  it('renames the Phase 0 finds and drops unknown ones', () => {
    expect(fromV2(old, catalog)?.foraged).toEqual(['flexible-paxos', 'whnf'])
  })

  it('drops seeds that are not in the packs', () => {
    expect(fromV2(old, catalog)?.volunteers).toEqual(['nonmoving'])
    const s = fromV2({ ...sampleFarm, crops: [...sampleFarm.crops, { id: 'gone', x: 5, y: 7, stage: 0, lw: 1, wilted: false, per: false }] }, catalog)
    expect(s?.crops).toHaveLength(sampleFarm.crops.length)
  })

  it('drops a crop that is not on its own field, or is planted twice', () => {
    const crop = { id: 'stm', x: 12, y: 5, stage: 0, lw: 1, wilted: false, per: false }
    expect(fromV2({ ...sampleFarm, crops: [crop] }, catalog)?.crops).toEqual([])
    const twice = [sampleFarm.crops[0], { ...sampleFarm.crops[0], x: 5, y: 7 }]
    expect(fromV2({ ...sampleFarm, crops: twice }, catalog)?.crops).toHaveLength(1)
  })

  it('keeps a field layout that is already there', () => {
    expect(fromV2({ ...sampleFarm, fields: { kannada: 0, infra: 2 } }, catalog)?.fields).toEqual({ kannada: 0, infra: 2 })
  })
})

describe('fromV2 on anything else', () => {
  it('refuses what is not a v2 farm', () => {
    for (const v of [null, 3, 'farm', [], {}, { v: 2 }, { v: 2, crops: [] }, { v: 3, crops: [], farmer: {} }]) expect(fromV2(v, catalog)).toBeNull()
  })

  it('never throws on odd contents, and always gives a farm that makes sense', () => {
    const junk = fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.array(fc.anything()), fc.dictionary(fc.string(), fc.anything()))
    fc.assert(
      fc.property(junk, junk, junk, junk, junk, (crops, farmer, fields, focus, today) => {
        const s = fromV2({ v: 2, crops, farmer, fields, focus, today, cleared: focus, foraged: crops }, catalog)
        if (!s) return
        expect(s.energy).toBeGreaterThanOrEqual(0)
        expect(s.energy).toBeLessThanOrEqual(s.energyMax)
        expect(s.crops.every((c) => c.stage >= 0 && c.stage <= RULES.maxStage && (!c.perennial || c.stage === RULES.maxStage))).toBe(true)
      }),
    )
  })
})
