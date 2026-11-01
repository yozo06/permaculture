import { describe, expect, it } from 'vitest'
import sampleFarm from '../game/sample-farm.json'
import { apply, check, fieldsToOpen, fold, initialState, parseEvent } from './fold'
import { run, smallCatalog as cat, smallFarm, started } from './fixtures'
import { terrain, wildKind, worldSize } from './land'
import { RULES, available, ripe, thirsty } from './rules'
import type { Crop, FarmEvent, FarmState } from './types'

const plant = (seed: string, x: number, y: number): FarmEvent => ({ type: 'planted', seed, x, y })
const sleep: FarmEvent = { type: 'slept' }
const crop = (s: FarmState, seed: string): Crop => {
  const c = s.crops.find((x) => x.seed === seed)
  if (!c) throw new Error('no crop ' + seed)
  return c
}
/** Plant corn in the garden and sleep until it is thirsty. */
const thirstyCorn = (): FarmState => run(cat, [plant('corn', 5, 5), sleep], smallFarm())
const sleepDays = (s: FarmState, n: number): FarmState => run(cat, Array.from({ length: n }, () => sleep), s)
const withCrop = (s: FarmState, patch: Partial<Crop>): FarmState => ({ ...s, crops: s.crops.map((c) => ({ ...c, ...patch })) })
const refusal = (s: FarmState, e: unknown): string => {
  const why = check(s, e, cat)
  if (why === null) throw new Error('expected a refusal for ' + JSON.stringify(e))
  expect(apply(s, e, cat)).toBe(s)
  return why
}
/** A tile in the wilderness of the given kind. */
function wildTile(s: FarmState, kinds: string[]): { x: number; y: number } {
  const n = worldSize(s.fields)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (terrain(x, y, s.fields, s.cleared) === 'wild' && kinds.includes(wildKind(x, y))) return { x, y }
  }
  throw new Error('no such tile')
}

describe('farm-started', () => {
  it('begins a fresh farm with the numbers given', () => {
    const s = run(cat, [started])
    expect(s).toMatchObject({ day: 1, energy: 90, energyMax: 90, coins: 140, barrel: 0, crops: [], fields: {}, night: null })
  })

  it('wipes whatever was there before', () => {
    const s = run(cat, [{ ...started, coins: 7 }], smallFarm())
    expect(s.fields).toEqual({})
    expect(s.coins).toBe(7)
  })

  it('refuses numbers that cannot be a farm, without throwing', () => {
    for (const bad of [{ ...started, day: 0 }, { ...started, coins: -1 }, { ...started, barrel: 6 }, { ...started, energy: 1.5 }, { ...started, day: '1' }]) {
      refusal(initialState(), bad)
    }
  })
})

describe('field-opened', () => {
  it('opens a field of a pack in a free slot', () => {
    expect(smallFarm().fields).toEqual({ garden: 0, shed: 1 })
  })

  it('refuses unknown packs, packs that already have a field and slots that are taken', () => {
    const s = run(cat, [started, { type: 'field-opened', pack: 'garden', slot: 0 }])
    refusal(s, { type: 'field-opened', pack: 'nowhere', slot: 1 })
    refusal(s, { type: 'field-opened', pack: 'garden', slot: 1 })
    refusal(s, { type: 'field-opened', pack: 'shed', slot: 0 })
    refusal(s, { type: 'field-opened', pack: 'shed', slot: -1 })
  })

  it('fieldsToOpen gives each missing pack the next free slot', () => {
    expect(fieldsToOpen({ fields: { shed: 0 } }, cat)).toEqual([{ type: 'field-opened', pack: 'garden', slot: 1 }])
    expect(fieldsToOpen(smallFarm(), cat)).toEqual([])
  })
})

describe('planted', () => {
  it('costs energy and coins, counts against the day and starts a seedling due tomorrow', () => {
    const s = run(cat, [plant('corn', 5, 5)], smallFarm())
    expect(s).toMatchObject({ energy: 80, coins: 130, today: { planted: 1, spent: { garden: 10 } } })
    expect(crop(s, 'corn')).toEqual({ seed: 'corn', x: 5, y: 5, stage: 0, due: 2, wilted: false, perennial: false })
  })

  it('refuses a seed that is unknown, locked, already planted, or in the wrong field', () => {
    const s = smallFarm()
    expect(refusal(s, plant('nope', 5, 5))).toMatch(/not in any pack/)
    expect(refusal(s, plant('squash', 5, 5))).toMatch(/locked/)
    expect(refusal(s, plant('bees', 5, 5))).toMatch(/locked/)
    expect(refusal(s, plant('corn', 12, 5))).toMatch(/belongs in the Garden field/)
    expect(refusal(run(cat, [plant('corn', 5, 5)], s), plant('corn', 6, 5))).toMatch(/already planted/)
  })

  it('refuses a tile with a crop on it, and tiles that are not soil', () => {
    const s = run(cat, [plant('corn', 5, 5)], smallFarm())
    expect(refusal(s, plant('beans', 5, 5))).toMatch(/already growing/)
    expect(refusal(s, plant('beans', 8, 5))).toMatch(/belongs in/)
  })

  it('refuses when a field is not open', () => {
    expect(refusal(run(cat, [started]), plant('corn', 5, 5))).toMatch(/not open/)
  })

  it('refuses without the energy or the coins', () => {
    expect(refusal({ ...smallFarm(), energy: 9 }, plant('corn', 5, 5))).toMatch(/10 energy and 10 coins/)
    expect(refusal({ ...smallFarm(), coins: 9 }, plant('corn', 5, 5))).toMatch(/10 energy and 10 coins/)
  })

  it('allows two new seeds a day and refuses the third', () => {
    const s = run(cat, [plant('corn', 5, 5), plant('beans', 6, 5)], smallFarm())
    expect(refusal(s, plant('saw', 12, 5))).toMatch(/2 new seeds a day/)
    expect(run(cat, [sleep, plant('saw', 12, 5)], s).crops).toHaveLength(3)
  })

  it('stops a capped field at its share of the day', () => {
    // Shed is capped at 30% of 90 = 27: two plantings fit (20), a third would make 30.
    const s = run(cat, [plant('saw', 12, 5), plant('plane', 13, 5)], smallFarm())
    expect(s.today.spent).toEqual({ shed: 20 })
    expect(refusal({ ...s, today: { planted: 0, spent: { shed: 20 } }, crops: [] }, plant('saw', 14, 7))).toBe('The Shed uses at most 27 energy a day.')
  })

  it('lets a seed be planted once everything it needs is rooted, or once it is unlocked', () => {
    const rooted = (seed: string, x: number, y: number): Crop => ({ seed, x, y, stage: 4, due: 20, wilted: false, perennial: true })
    const s: FarmState = { ...smallFarm(), crops: [rooted('corn', 5, 5), rooted('beans', 6, 5)] }
    expect(check(s, plant('squash', 7, 5), cat)).toBeNull()
    expect(check({ ...smallFarm(), unlocked: ['squash'] }, plant('squash', 7, 5), cat)).toBeNull()
  })
})

describe('watered', () => {
  it('grows a thirsty crop one stage and sets the next thirst', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: true }], thirstyCorn())
    expect(crop(s, 'corn')).toMatchObject({ stage: 1, due: 2 + 2, wilted: false })
    expect(s.energy).toBe(90 - 6)
    expect(s.today.spent).toEqual({ garden: 6 })
  })

  it('wilts a crop on a wrong answer, drops a stage, adds it to the compost and sets it due tomorrow', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: true }], thirstyCorn())
    const w = run(cat, [sleep, sleep, { type: 'watered', seed: 'corn', ok: false }], s)
    expect(crop(w, 'corn')).toMatchObject({ stage: 0, wilted: true, due: w.day + 1 })
    expect(w.compost).toEqual(['corn'])
  })

  it('revives a wilted crop once its day has come, and takes it out of the compost', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: false }, sleep, { type: 'watered', seed: 'corn', ok: true }], thirstyCorn())
    expect(crop(s, 'corn').wilted).toBe(false)
    expect(s.compost).toEqual([])
  })

  it('refuses a crop that is not thirsty, not planted, or a wilted one before its day', () => {
    const s = run(cat, [plant('corn', 5, 5)], smallFarm())
    expect(refusal(s, { type: 'watered', seed: 'corn', ok: true })).toMatch(/not thirsty/)
    expect(refusal(s, { type: 'watered', seed: 'beans', ok: true })).toMatch(/not planted/)
    const w = run(cat, [{ type: 'watered', seed: 'corn', ok: false }], thirstyCorn())
    expect(refusal(w, { type: 'watered', seed: 'corn', ok: true })).toMatch(/has wilted. Revive it on day 3/)
  })

  it('refuses without energy, and past a field cap', () => {
    expect(refusal({ ...thirstyCorn(), energy: 5 }, { type: 'watered', seed: 'corn', ok: true })).toMatch(/Out of energy/)
    const capped = { ...thirstyCorn(), crops: [{ seed: 'saw', x: 12, y: 5, stage: 0, due: 1, wilted: false, perennial: false }], today: { planted: 0, spent: { shed: 24 } } }
    expect(refusal(capped, { type: 'watered', seed: 'saw', ok: true })).toMatch(/at most 27/)
  })

  it('checks a perennial in without changing its stage, and wilts it until tomorrow on a wrong check-in', () => {
    const s = withCrop(thirstyCorn(), { perennial: true, stage: 4, due: 2 })
    const ok = run(cat, [{ type: 'watered', seed: 'corn', ok: true }], s)
    expect(crop(ok, 'corn')).toMatchObject({ stage: 4, perennial: true, due: 12, wilted: false })
    const bad = run(cat, [{ type: 'watered', seed: 'corn', ok: false }], s)
    expect(crop(bad, 'corn')).toMatchObject({ stage: 4, perennial: true, wilted: true, due: 3 })
  })

  it('is never thirsty on the same day after watering', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: true }], thirstyCorn())
    expect(thirsty(crop(s, 'corn'), s.day)).toBe(false)
  })
})

describe('harvested', () => {
  const ripeCorn = (): FarmState => ({ ...thirstyCorn(), crops: [{ seed: 'corn', x: 5, y: 5, stage: 4, due: 9, wilted: false, perennial: false }], day: 5 })

  it('pays out and roots a crop on a premium harvest', () => {
    const s = run(cat, [{ type: 'harvested', seed: 'corn', ok: true }], ripeCorn())
    expect(crop(s, 'corn')).toMatchObject({ perennial: true, stage: 4, due: 15 })
    expect(s.coins).toBe(ripeCorn().coins + 30)
    expect(s.energy).toBe(ripeCorn().energy - 15)
    expect(available(cat.seed('squash')!, { ...s, crops: [...s.crops, { ...crop(s, 'corn'), seed: 'beans' }] })).toBe(true)
  })

  it('drops the crop back to stage 4 of 5, due tomorrow and in the compost, on seconds', () => {
    const s = run(cat, [{ type: 'harvested', seed: 'corn', ok: false }], ripeCorn())
    expect(crop(s, 'corn')).toMatchObject({ perennial: false, stage: 3, due: 6 })
    expect(s.compost).toEqual(['corn'])
    expect(s.coins).toBe(ripeCorn().coins)
  })

  it('refuses a crop that is not ripe: young, thirsty, wilted or not planted', () => {
    const e: FarmEvent = { type: 'harvested', seed: 'corn', ok: true }
    expect(refusal(thirstyCorn(), e)).toMatch(/not ready/)
    expect(refusal({ ...ripeCorn(), day: 9 }, e)).toMatch(/not ready/)
    expect(refusal(withCrop(ripeCorn(), { wilted: true }), e)).toMatch(/not ready/)
    expect(refusal(smallFarm(), e)).toMatch(/not planted/)
  })

  it('refuses a perennial, however it is asked', () => {
    const p = withCrop(ripeCorn(), { perennial: true })
    expect(ripe(crop(p, 'corn'), p.day)).toBe(false)
    expect(refusal(p, { type: 'harvested', seed: 'corn', ok: true })).toMatch(/rooted already/)
    expect(refusal(p, { type: 'harvested', seed: 'corn', ok: false })).toMatch(/rooted already/)
  })

  it('refuses without energy', () => {
    expect(refusal({ ...ripeCorn(), energy: 14 }, { type: 'harvested', seed: 'corn', ok: true })).toMatch(/15 energy/)
  })
})

describe('slept', () => {
  it('starts the next day with full energy and a clean tally, and fills the barrel when 30 or more is left', () => {
    const s = run(cat, [plant('corn', 5, 5), sleep], smallFarm())
    expect(s).toMatchObject({ day: 2, energy: 90, barrel: 1, today: { planted: 0, spent: {} } })
    expect(s.night).toEqual({ saved: [], wilted: [], barrelFilled: true })
  })

  it('does not fill the barrel when less than 30 is left, or when it is full', () => {
    expect(run(cat, [sleep], { ...smallFarm(), energy: 29 }).barrel).toBe(0)
    expect(run(cat, [sleep], { ...smallFarm(), barrel: 5 }).barrel).toBe(5)
    expect(run(cat, [sleep], { ...smallFarm(), barrel: 5 }).night?.barrelFilled).toBe(false)
  })

  // A crop planted on day 1 is thirsty from day 2 and wilts overnight into day 4.
  const tired = (s: FarmState): FarmState => ({ ...s, energy: 0 })
  const dayThree = (): FarmState => {
    const planted = run(cat, [plant('corn', 5, 5)], smallFarm())
    return run(cat, [sleep], tired(run(cat, [sleep], tired(planted))))
  }

  it('wilts a crop two days past thirsty when the barrel is empty, and puts it in the compost', () => {
    const a = dayThree()
    expect(a).toMatchObject({ day: 3, barrel: 0 })
    expect(crop(a, 'corn').wilted).toBe(false)
    const b = run(cat, [sleep], tired(a))
    expect(b.crops[0]).toMatchObject({ wilted: true, due: 4 })
    expect(b.night).toEqual({ saved: [], wilted: ['corn'], barrelFilled: false })
    expect(b.compost).toEqual(['corn'])
  })

  it('spends a barrel day to save a crop instead, leaving it thirsty', () => {
    const b = run(cat, [sleep], tired({ ...dayThree(), barrel: 1 }))
    expect(b.crops[0]).toMatchObject({ wilted: false, due: 4 })
    expect(b.barrel).toBe(0)
    expect(b.night?.saved).toEqual(['corn'])
  })

  it('fills the barrel before it is spent, so spare energy on the last night saves the crop', () => {
    const b = run(cat, [sleep], dayThree())
    expect(b.night).toEqual({ saved: ['corn'], wilted: [], barrelFilled: true })
    expect(b.barrel).toBe(0)
    expect(crop(b, 'corn').wilted).toBe(false)
  })

  it('never wilts perennials from neglect', () => {
    const p = withCrop(smallFarm(), {})
    const s = sleepDays({ ...p, crops: [{ seed: 'corn', x: 5, y: 5, stage: 4, due: 3, wilted: false, perennial: true }] }, 30)
    expect(crop(s, 'corn').wilted).toBe(false)
  })

  it('is refused on a farm that has not started', () => {
    expect(refusal(initialState(), sleep)).toMatch(/no farm/)
  })
})

describe('fenced', () => {
  it('adds the tile to the field for 25 coins on open ground', () => {
    const s = run(cat, [{ type: 'fenced', x: 8, y: 5, pack: 'garden' }], smallFarm())
    expect(s.cleared).toEqual({ '8,5': 'garden' })
    expect(s.coins).toBe(115)
    expect(run(cat, [plant('corn', 8, 5)], s).crops).toHaveLength(1)
  })

  it('costs 40 in forest', () => {
    const s = run(cat, [{ type: 'fenced', x: 4, y: 5, pack: 'garden' }, { type: 'fenced', x: 3, y: 5, pack: 'garden' }], smallFarm())
    expect(s.coins).toBe(140 - 25 - 40)
  })

  it('refuses tiles that are soil, path, a building, not next to the field or outside the world', () => {
    const s = smallFarm()
    expect(refusal(s, { type: 'fenced', x: 6, y: 6, pack: 'garden' })).toMatch(/cannot be fenced/)
    expect(refusal(s, { type: 'fenced', x: 9, y: 6, pack: 'garden' })).toMatch(/cannot be fenced/)
    expect(refusal(s, { type: 'fenced', x: 9, y: 5, pack: 'garden' })).toMatch(/cannot be fenced/)
    expect(refusal(s, { type: 'fenced', x: 8, y: 8, pack: 'garden' })).toMatch(/cannot be fenced/)
    expect(refusal(s, { type: 'fenced', x: 8, y: 12, pack: 'garden' })).toMatch(/next to the field/)
    expect(refusal(s, { type: 'fenced', x: -1, y: 5, pack: 'garden' })).toMatch(/outside/)
    expect(refusal(s, { type: 'fenced', x: 8, y: 5, pack: 'nowhere' })).toMatch(/not open/)
  })

  it('refuses without the coins', () => {
    expect(refusal({ ...smallFarm(), coins: 24 }, { type: 'fenced', x: 8, y: 5, pack: 'garden' })).toMatch(/Not enough coins/)
  })
})

describe('foraged', () => {
  const tree = () => wildTile(smallFarm(), ['tree', 'bush'])

  it('costs 5 energy, pays 3 coins and remembers the find', () => {
    const { x, y } = tree()
    const s = run(cat, [{ type: 'foraged', x, y, find: 'bee-find' }], smallFarm())
    expect(s).toMatchObject({ energy: 85, coins: 143, foraged: ['bee-find'], today: { spent: {} } })
  })

  it('refuses a find twice, an unknown find, land that is not forest, and no energy', () => {
    const { x, y } = tree()
    const s = run(cat, [{ type: 'foraged', x, y, find: 'bee-find' }], smallFarm())
    expect(refusal(s, { type: 'foraged', x, y, find: 'bee-find' })).toMatch(/already/)
    expect(refusal(smallFarm(), { type: 'foraged', x, y, find: 'nope' })).toMatch(/nothing to find/)
    expect(refusal(smallFarm(), { type: 'foraged', x: 5, y: 5, find: 'bee-find' })).toMatch(/wilderness/)
    const rock = wildTile(smallFarm(), ['rock', 'grass'])
    expect(refusal(smallFarm(), { type: 'foraged', ...rock, find: 'bee-find' })).toMatch(/trees/)
    expect(refusal({ ...smallFarm(), energy: 4 }, { type: 'foraged', x, y, find: 'bee-find' })).toMatch(/Out of energy/)
  })
})

describe('domesticated', () => {
  const found = (): FarmState => {
    const { x, y } = wildTile(smallFarm(), ['tree', 'bush'])
    return run(cat, [{ type: 'foraged', x, y, find: 'bee-find' }], smallFarm())
  }

  it('turns a wild seed into a volunteer once a find leads to it, which makes it plantable', () => {
    const s = run(cat, [{ type: 'domesticated', seed: 'bees' }], found())
    expect(s.volunteers).toEqual(['bees'])
    const rooted: Crop = { seed: 'corn', x: 5, y: 5, stage: 4, due: 20, wilted: false, perennial: true }
    expect(available(cat.seed('bees')!, { ...s, crops: [rooted] })).toBe(true)
  })

  it('refuses before the find, twice, and for seeds that are not wild', () => {
    expect(refusal(smallFarm(), { type: 'domesticated', seed: 'bees' })).toMatch(/Forage a find/)
    expect(refusal(run(cat, [{ type: 'domesticated', seed: 'bees' }], found()), { type: 'domesticated', seed: 'bees' })).toMatch(/already/)
    expect(refusal(found(), { type: 'domesticated', seed: 'corn' })).toMatch(/wild seeds/)
  })
})

describe('unlocked', () => {
  const lathe = (ok: boolean): FarmEvent => ({ type: 'unlocked', seed: 'lathe', ok })

  it('costs 10 energy and unlocks the seed on a pass', () => {
    const s = run(cat, [lathe(true)], smallFarm())
    expect(s.unlocked).toEqual(['lathe'])
    expect(s.energy).toBe(80)
    expect(s.today.spent).toEqual({ shed: 10 })
    expect(check(s, plant('lathe', 12, 5), cat)).toBeNull()
  })

  it('costs the energy and nothing else on a fail', () => {
    const s = run(cat, [lathe(false)], smallFarm())
    expect(s.unlocked).toEqual([])
    expect(s.energy).toBe(80)
  })

  it('refuses a seed that is not locked, hidden, planted, or too costly', () => {
    expect(refusal(smallFarm(), { type: 'unlocked', seed: 'saw', ok: true })).toMatch(/not locked/)
    expect(refusal(smallFarm(), { type: 'unlocked', seed: 'bees', ok: true })).toMatch(/not in your tree/)
    expect(refusal({ ...smallFarm(), energy: 9 }, lathe(true))).toMatch(/10 energy/)
    expect(refusal({ ...smallFarm(), today: { planted: 0, spent: { shed: 20 } } }, lathe(true))).toMatch(/at most 27/)
    expect(refusal(run(cat, [lathe(true)], smallFarm()), lathe(true))).toMatch(/not locked/)
  })
})

describe('focus-set', () => {
  it('sets and clears the focus branch of a field', () => {
    const s = run(cat, [{ type: 'focus-set', pack: 'garden', branch: 'leaves' }], smallFarm())
    expect(s.focus).toEqual({ garden: 'leaves' })
    expect(run(cat, [{ type: 'focus-set', pack: 'garden', branch: null }], s).focus).toEqual({})
  })

  it('refuses a branch that is not in the pack and a field that is not open', () => {
    expect(refusal(smallFarm(), { type: 'focus-set', pack: 'garden', branch: 'build' })).toMatch(/not in the Garden/)
    expect(refusal(run(cat, [started]), { type: 'focus-set', pack: 'garden', branch: null })).toMatch(/not open/)
  })
})

describe('snapshot-imported', () => {
  it('replaces the farm with the converted Phase 0 save', () => {
    const s = run(cat, [{ type: 'snapshot-imported', snapshot: { ...sampleFarm, crops: [], compost: [] } }], smallFarm())
    expect(s).toMatchObject({ day: 12, coins: 140, barrel: 2, crops: [] })
  })

  it('refuses what is not a v2 farm', () => {
    refusal(smallFarm(), { type: 'snapshot-imported', snapshot: { v: 3 } })
    refusal(smallFarm(), { type: 'snapshot-imported', snapshot: null })
  })
})

describe('anything else', () => {
  it('is refused without throwing, and leaves the state alone', () => {
    const s = smallFarm()
    for (const bad of [null, 3, 'planted', [], {}, { type: 'nope' }, { type: 'planted' }, { type: 'planted', seed: 'corn', x: '5', y: 5 }, { type: 'watered', seed: 'corn' }, { type: 'snapshot-imported' }, { type: 'focus-set', pack: 'garden' }]) {
      expect(check(s, bad, cat)).not.toBeNull()
      expect(apply(s, bad, cat)).toBe(s)
    }
  })

  it('parseEvent drops the id and time a logged event carries', () => {
    expect(parseEvent({ type: 'slept', id: 'a', at: 'now' })).toEqual({ type: 'slept' })
  })
})

describe('apply', () => {
  it('never changes the state it was given', () => {
    const before = thirstyCorn()
    const frozen = JSON.stringify(before)
    for (const e of [{ type: 'watered', seed: 'corn', ok: true }, { type: 'watered', seed: 'corn', ok: false }, sleep, plant('beans', 6, 5), { type: 'fenced', x: 8, y: 5, pack: 'garden' }, { type: 'focus-set', pack: 'garden', branch: 'roots' }] as FarmEvent[]) {
      apply(before, e, cat)
      expect(JSON.stringify(before)).toBe(frozen)
    }
  })

  it('fold ignores events that are not allowed and the id and time of the rest', () => {
    const log = [{ ...started, id: '1', at: 'a' }, { type: 'field-opened', pack: 'garden', slot: 0, id: '2', at: 'b' }, { type: 'planted', seed: 'squash', x: 5, y: 5, id: '3', at: 'c' }, { type: 'planted', seed: 'corn', x: 5, y: 5, id: '4', at: 'd' }]
    const s = fold(log, cat)
    expect(s.crops.map((c) => c.seed)).toEqual(['corn'])
  })
})
