import { describe, expect, it } from 'vitest'
import sampleFarm from '../game/sample-farm.json'
import { allowed, apply, check, fieldsToOpen, fold, initialState, parseEvent, refusedCount } from './fold'
import { EXPLANATION, NOTES, earningCatalog as earnCat, layeredCatalog as layerCat, run, smallCatalog as cat, smallFarm, started } from './fixtures'
import { fieldOf, terrain, wildKind, worldSize } from './land'
import { RULES, available, ripe, thirsty } from './rules'
import type { Crop, FarmEvent, FarmState } from './types'

const plant = (seed: string, x: number, y: number, notes: string = NOTES): FarmEvent => ({ type: 'planted', seed, x, y, notes })
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
    for (const bad of [{ ...started, day: 0 }, { ...started, coins: -1 }, { ...started, barrel: -1 }, { ...started, energy: 1.5 }, { ...started, day: '1' }]) {
      refusal(initialState(), bad)
    }
  })

  it('clamps a barrel above the most it holds, so lowering that number can never empty a farm', () => {
    const s = run(cat, [{ ...started, barrel: RULES.barrel.max + 3 }, { type: 'slept' }])
    expect(s.day).toBe(2)
    expect(s.barrel).toBe(RULES.barrel.max)
  })
})

describe('bar-set', () => {
  const bar = (pack: string, n: unknown) => ({ type: 'bar-set', pack, bar: n })

  it("sets a field's bar, and the last one set is the one that stands", () => {
    const s = run(cat, [{ type: 'bar-set', pack: 'garden', bar: 60 }], smallFarm())
    expect(s.bars).toEqual({ garden: 60 })
    expect(run(cat, [{ type: 'bar-set', pack: 'garden', bar: 95 }], s).bars).toEqual({ garden: 95 })
  })

  it('costs nothing', () => {
    const before = smallFarm()
    const s = run(cat, [{ type: 'bar-set', pack: 'garden', bar: 60 }], before)
    expect({ energy: s.energy, coins: s.coins, today: s.today }).toEqual({ energy: before.energy, coins: before.coins, today: before.today })
  })

  it('takes any whole number from 1 to 100 and nothing else', () => {
    const s = smallFarm()
    for (const ok of [1, 80, 100]) expect(check(s, bar('garden', ok), cat)).toBeNull()
    for (const bad of [0, 101, -5, 79.5, '80', null, undefined, Number.NaN, Infinity]) refusal(s, bar('garden', bad))
    // A number that cannot be a bar is refused in words a farmer can use, the same as one out of range.
    for (const bad of [0, 79.5, Number.NaN]) expect(refusal(s, bar('garden', bad))).toBe('A bar is a whole number from 1 to 100.')
  })

  it('refuses a field that is not open, a pack that does not exist, and a field with no end', () => {
    const unopened = run(cat, [started, { type: 'field-opened', pack: 'shed', slot: 0 }])
    expect(refusal(unopened, bar('garden', 60))).toBe('The Garden field is not open yet.')
    refusal(smallFarm(), bar('nowhere', 60))
    expect(check(smallFarm(), bar('shed', 60), cat)).toBe('The Shed field has no end, so it has no bar.')
  })

  it('keeps a bar a log already holds for a field that has since lost its end: only a farmer today is told no', () => {
    // A pack can be marked as having no end after a farmer set a bar for it. Replay must not drop the event.
    const s = smallFarm()
    const e = bar('shed', 60)
    expect(allowed(s, e, cat)).toBeNull()
    expect(refusedCount([started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }, e], cat)).toBe(0)
    expect(apply(s, e, cat).bars).toEqual({ shed: 60 })
  })

  it('keeps only what an event of this kind holds', () => {
    expect(parseEvent({ type: 'bar-set', pack: 'garden', bar: 60, id: 'x', at: 'y', extra: 1 })).toEqual({ type: 'bar-set', pack: 'garden', bar: 60 })
  })

  it('starts every farm with no bars set', () => {
    expect(initialState().bars).toEqual({})
    expect(smallFarm().bars).toEqual({})
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
    // Only the packs asked for, when the farmer chose.
    expect(fieldsToOpen({ fields: {} }, cat, ['shed'])).toEqual([{ type: 'field-opened', pack: 'shed', slot: 0 }])
    expect(fieldsToOpen({ fields: {} }, cat, ['shed', 'garden', 'no-such-pack'])).toEqual([
      { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 },
    ])
  })
})

describe('planted', () => {
  it('costs energy and coins, counts against the day and starts a seedling due tomorrow', () => {
    const s = run(cat, [plant('corn', 5, 5)], smallFarm())
    expect(s).toMatchObject({ energy: 80, coins: 130, today: { planted: 1, spent: { garden: 10 } } })
    expect(crop(s, 'corn')).toEqual({ seed: 'corn', x: 5, y: 5, stage: 0, best: 0, due: 2, wilted: false, perennial: false, notes: NOTES, journal: [] })
  })

  it('keeps the notes on the crop, trimmed', () => {
    const s = run(cat, [plant('corn', 5, 5, '  ' + NOTES + '\n')], smallFarm())
    expect(crop(s, 'corn').notes).toBe(NOTES)
  })

  it('refuses notes that are too short, counting without the spaces around them, and notes that are far too long', () => {
    const s = smallFarm()
    expect(refusal(s, plant('corn', 5, 5, ''))).toMatch(/at least 40 characters of notes/)
    expect(refusal(s, plant('corn', 5, 5, 'x'.repeat(39)))).toMatch(/You have 39/)
    expect(refusal(s, plant('corn', 5, 5, ' '.repeat(10) + 'x'.repeat(30) + ' '.repeat(10)))).toMatch(/You have 30/)
    expect(check(s, plant('corn', 5, 5, 'x'.repeat(40)), cat)).toBeNull()
    expect(refusal(s, plant('corn', 5, 5, 'x'.repeat(RULES.textMax + 1)))).toMatch(/under 5000/)
    expect(refusal(s, { type: 'planted', seed: 'corn', x: 5, y: 5 })).toMatch(/not something/)
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
    const rooted = (seed: string, x: number, y: number): Crop => ({ seed, x, y, stage: 4, best: 4, due: 20, wilted: false, perennial: true, notes: '', journal: [] })
    const s: FarmState = { ...smallFarm(), crops: [rooted('corn', 5, 5), rooted('beans', 6, 5)] }
    expect(check(s, plant('squash', 7, 5), cat)).toBeNull()
    expect(check({ ...smallFarm(), unlocked: ['squash'] }, plant('squash', 7, 5), cat)).toBeNull()
  })
})

describe('watered', () => {
  it('grows a thirsty crop one stage and sets the next thirst', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }], thirstyCorn())
    expect(crop(s, 'corn')).toMatchObject({ stage: 1, best: 1, due: 2 + 2, wilted: false })
    expect(s.energy).toBe(90 - 6)
    expect(s.today.spent).toEqual({ garden: 6 })
  })

  it('wilts a crop on a wrong answer, drops a stage, adds it to the compost and sets it due tomorrow', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }], thirstyCorn())
    const w = run(cat, [sleep, sleep, { type: 'watered', seed: 'corn', ok: false, work: 'recall' }], s)
    expect(crop(w, 'corn')).toMatchObject({ stage: 0, wilted: true, due: w.day + 1 })
    expect(w.compost).toEqual(['corn'])
  })

  it('revives a wilted crop once its day has come, and takes it out of the compost', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: false, work: 'recall' }, sleep, { type: 'watered', seed: 'corn', ok: true, work: 'recall' }], thirstyCorn())
    expect(crop(s, 'corn').wilted).toBe(false)
    expect(s.compost).toEqual([])
  })

  it('refuses a crop that is not thirsty, not planted, or a wilted one before its day', () => {
    const s = run(cat, [plant('corn', 5, 5)], smallFarm())
    expect(refusal(s, { type: 'watered', seed: 'corn', ok: true, work: 'recall' })).toMatch(/not thirsty/)
    expect(refusal(s, { type: 'watered', seed: 'beans', ok: true, work: 'recall' })).toMatch(/not planted/)
    const w = run(cat, [{ type: 'watered', seed: 'corn', ok: false, work: 'recall' }], thirstyCorn())
    expect(refusal(w, { type: 'watered', seed: 'corn', ok: true, work: 'recall' })).toMatch(/has wilted. Revive it on day 3/)
  })

  it('refuses without energy, and past a field cap', () => {
    expect(refusal({ ...thirstyCorn(), energy: 5 }, { type: 'watered', seed: 'corn', ok: true, work: 'recall' })).toMatch(/Out of energy/)
    const capped = { ...thirstyCorn(), crops: [{ seed: 'saw', x: 12, y: 5, stage: 0, best: 0, due: 1, wilted: false, perennial: false, notes: '', journal: [] }], today: { planted: 0, spent: { shed: 24 } } }
    expect(refusal(capped, { type: 'watered', seed: 'saw', ok: true, work: 'recall' })).toMatch(/at most 27/)
  })

  it('checks a perennial in without changing its stage, and wilts it until tomorrow on a wrong check-in', () => {
    const s = withCrop(thirstyCorn(), { perennial: true, stage: 4, best: 4, due: 2 })
    const ok = run(cat, [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }], s)
    expect(crop(ok, 'corn')).toMatchObject({ stage: 4, perennial: true, due: 12, wilted: false })
    const bad = run(cat, [{ type: 'watered', seed: 'corn', ok: false, work: 'recall' }], s)
    expect(crop(bad, 'corn')).toMatchObject({ stage: 4, perennial: true, wilted: true, due: 3 })
  })

  const explain = (ok: boolean, text = EXPLANATION, ticked = 2, of = 3): FarmEvent => ({ type: 'watered', seed: 'corn', ok, work: 'explain', text, ticked, of })

  it('writes an explanation into the journal with the day and how it was rated, whether or not it passed', () => {
    const s = run(cat, [explain(true)], thirstyCorn())
    expect(crop(s, 'corn')).toMatchObject({ stage: 1, journal: [{ day: 2, kind: 'explain', text: EXPLANATION, ok: true }] })
    const w = run(cat, [explain(false, '  ' + EXPLANATION + '  ', 1, 3)], thirstyCorn())
    expect(crop(w, 'corn')).toMatchObject({ stage: 0, wilted: true, journal: [{ day: 2, kind: 'explain', text: EXPLANATION, ok: false }] })
    const again = run(cat, [sleep, explain(true)], w)
    expect(crop(again, 'corn').journal.map((j) => j.ok)).toEqual([false, true])
  })

  it('does not journal a recall answer, and records the work it is told rather than working it out', () => {
    expect(crop(run(cat, [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }], thirstyCorn()), 'corn').journal).toEqual([])
    // Stage 0 would normally be recall; an explanation there is still taken as given.
    expect(crop(run(cat, [explain(true)], thirstyCorn()), 'corn').journal).toHaveLength(1)
  })

  it('refuses an explanation that is too short, or a rating that does not add up', () => {
    const s = thirstyCorn()
    expect(refusal(s, explain(true, 'short'))).toMatch(/at least 80 characters to explain it. You have 5/)
    expect(refusal(s, explain(true, 'x'.repeat(79)))).toMatch(/You have 79/)
    expect(check(s, explain(true, 'x'.repeat(80)), cat)).toBeNull()
    expect(refusal(s, explain(true, EXPLANATION, 4, 3))).toMatch(/does not add up/)
    expect(refusal(s, explain(true, EXPLANATION, -1, 3))).toMatch(/does not add up/)
    expect(refusal(s, explain(true, EXPLANATION, 0, 0))).toMatch(/does not add up/)
    expect(refusal(s, explain(true, 'x'.repeat(RULES.textMax + 1)))).toMatch(/under 5000/)
  })

  it('refuses a watering that does not say what work was done', () => {
    const s = thirstyCorn()
    refusal(s, { type: 'watered', seed: 'corn', ok: true })
    refusal(s, { type: 'watered', seed: 'corn', ok: true, work: 'cram' })
    refusal(s, { type: 'watered', seed: 'corn', ok: true, work: 'explain' })
    refusal(s, { type: 'watered', seed: 'corn', ok: true, work: 'explain', text: EXPLANATION, ticked: 1.5, of: 3 })
  })

  it('is never thirsty on the same day after watering', () => {
    const s = run(cat, [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }], thirstyCorn())
    expect(thirsty(crop(s, 'corn'), s.day)).toBe(false)
  })
})

describe('harvested', () => {
  const ripeCorn = (): FarmState => ({ ...thirstyCorn(), crops: [{ seed: 'corn', x: 5, y: 5, stage: 4, best: 4, due: 9, wilted: false, perennial: false, notes: '', journal: [] }], day: 5 })

  it('pays out and roots a crop on a premium harvest', () => {
    const s = run(cat, [{ type: 'harvested', seed: 'corn', ok: true }], ripeCorn())
    expect(crop(s, 'corn')).toMatchObject({ perennial: true, stage: 4, best: 4, due: 15 })
    expect(s.coins).toBe(ripeCorn().coins + 30)
    expect(s.energy).toBe(ripeCorn().energy - 15)
    expect(available(cat.seed('squash')!, { ...s, crops: [...s.crops, { ...crop(s, 'corn'), seed: 'beans' }] })).toBe(true)
  })

  it('drops the crop back to stage 4 of 5, due tomorrow and in the compost, on seconds', () => {
    const s = run(cat, [{ type: 'harvested', seed: 'corn', ok: false }], ripeCorn())
    expect(crop(s, 'corn')).toMatchObject({ perennial: false, stage: 3, best: 4, due: 6 })
    expect(s.compost).toEqual(['corn'])
    expect(s.coins).toBe(ripeCorn().coins)
  })

  const writeUp = (ok: boolean, text = EXPLANATION, ticked = 2, of = 2): FarmEvent => ({ type: 'harvested', seed: 'corn', ok, text, ticked, of })

  it('writes a write-up into the journal, and the crop becomes a perennial or drops back with the write-up kept', () => {
    const s = run(cat, [writeUp(true)], ripeCorn())
    expect(crop(s, 'corn')).toMatchObject({ perennial: true, journal: [{ day: 5, kind: 'harvest', text: EXPLANATION, ok: true }] })
    const w = run(cat, [writeUp(false, EXPLANATION, 1)], ripeCorn())
    expect(crop(w, 'corn')).toMatchObject({ perennial: false, stage: 3, journal: [{ day: 5, kind: 'harvest', ok: false }] })
  })

  it('journals nothing for a harvest without a write-up', () => {
    expect(crop(run(cat, [{ type: 'harvested', seed: 'corn', ok: true }], ripeCorn()), 'corn').journal).toEqual([])
  })

  it('needs a write-up of 80 characters, or 8 for the link or description of an artifact', () => {
    expect(refusal(ripeCorn(), writeUp(true, 'short'))).toMatch(/at least 80 characters in your write-up/)
    expect(refusal(ripeCorn(), writeUp(true, EXPLANATION, 3, 2))).toMatch(/does not add up/)
    const saw = { ...ripeCorn(), crops: [{ seed: 'saw', x: 12, y: 5, stage: 4, best: 4, due: 9, wilted: false, perennial: false, notes: '', journal: [] }] }
    const link: FarmEvent = { type: 'harvested', seed: 'saw', ok: true, text: 'https://x.org', ticked: 2, of: 2 }
    expect(check(saw, link, cat)).toBeNull()
    expect(refusal(saw, { ...link, text: 'a link' })).toMatch(/at least 8 characters to say what you made/)
    // Text without its rating is not a write-up at all.
    refusal(ripeCorn(), { type: 'harvested', seed: 'corn', ok: true, text: EXPLANATION })
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
    const s = sleepDays({ ...p, crops: [{ seed: 'corn', x: 5, y: 5, stage: 4, best: 4, due: 3, wilted: false, perennial: true, notes: '', journal: [] }] }, 30)
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
    const rooted: Crop = { seed: 'corn', x: 5, y: 5, stage: 4, best: 4, due: 20, wilted: false, perennial: true, notes: '', journal: [] }
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

  it('keeps the write-up from a jump, and validates it like a harvest', () => {
    const proof = 'https://example.com/the-bowl-i-turned'
    expect(parseEvent({ type: 'unlocked', seed: 'lathe', ok: true, text: proof, ticked: 2, of: 2 }))
      .toMatchObject({ type: 'unlocked', seed: 'lathe', ok: true, text: proof, ticked: 2, of: 2 })
    expect(parseEvent({ type: 'unlocked', seed: 'lathe', ok: true, text: proof })).toBeNull()
    expect(refusal(smallFarm(), { type: 'unlocked', seed: 'lathe', ok: true, text: 'short', ticked: 1, of: 2 })).toMatch(/characters/)
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
    for (const e of [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }, { type: 'watered', seed: 'corn', ok: false, work: 'recall' }, sleep, plant('beans', 6, 5), { type: 'fenced', x: 8, y: 5, pack: 'garden' }, { type: 'focus-set', pack: 'garden', branch: 'roots' }] as FarmEvent[]) {
      apply(before, e, cat)
      expect(JSON.stringify(before)).toBe(frozen)
    }
  })

  it('fold ignores events that are not allowed and the id and time of the rest', () => {
    const log = [{ ...started, id: '1', at: 'a' }, { type: 'field-opened', pack: 'garden', slot: 0, id: '2', at: 'b' }, { type: 'planted', seed: 'squash', x: 5, y: 5, notes: NOTES, id: '3', at: 'c' }, { type: 'planted', seed: 'corn', x: 5, y: 5, notes: NOTES, id: '4', at: 'd' }]
    const s = fold(log, cat)
    expect(s.crops.map((c) => c.seed)).toEqual(['corn'])
  })
})

describe('refusedCount', () => {
  const healthy: unknown[] = [started, { type: 'field-opened', pack: 'garden', slot: 0 }, plant('corn', 5, 5), sleep]

  it('is zero for a log the rules accept from start to finish', () => {
    expect(refusedCount(healthy, cat)).toBe(0)
  })

  it('counts every entry the fold skips: junk, a seed that has gone, and what depended on it', () => {
    const drifted = [...healthy, { nonsense: true }, plant('rhubarb', 6, 5), { type: 'watered', seed: 'rhubarb', ok: true, work: 'recall' }]
    expect(refusedCount(drifted, cat)).toBe(3)
    expect(fold(drifted, cat)).toEqual(fold(healthy, cat))
  })
})

describe('the furthest a crop has grown', () => {
  it('starts at the first stage, rises with the crop, and does not fall when an answer is wrong', () => {
    let s = thirstyCorn()
    expect(crop(s, 'corn').best).toBe(0)
    s = run(cat, [{ type: 'watered', seed: 'corn', ok: true, work: 'recall' }], s)
    expect(crop(s, 'corn')).toMatchObject({ stage: 1, best: 1 })
    s = run(cat, [{ type: 'watered', seed: 'corn', ok: false, work: 'recall' }], sleepDays(s, 2))
    expect(crop(s, 'corn')).toMatchObject({ stage: 0, best: 1 })
  })

  it('stays at the top after a failed harvest', () => {
    const ready = withCrop(thirstyCorn(), { stage: 4, best: 4, due: 99 })
    const s = run(cat, [{ type: 'harvested', seed: 'corn', ok: false }], ready)
    expect(crop(s, 'corn')).toMatchObject({ stage: 3, best: 4 })
  })
})

describe('farm-named', () => {
  const named = (name: unknown): unknown => ({ type: 'farm-named', name })

  it('starts with no name, takes one, and can change it', () => {
    expect(smallFarm().name).toBe('')
    const s = run(cat, [named('  Asha\'s farm ') as FarmEvent], smallFarm())
    expect(s.name).toBe("Asha's farm")
    expect(run(cat, [named('Hill farm') as FarmEvent], s).name).toBe('Hill farm')
  })

  it('refuses a name that is empty, too long or not text, and a name for a farm that has not begun', () => {
    expect(refusal(smallFarm(), named('   '))).toMatch(/1 to 24 characters/)
    expect(refusal(smallFarm(), named('x'.repeat(25)))).toMatch(/1 to 24 characters/)
    refusal(smallFarm(), named(7))
    refusal(initialState(), named('Too early'))
    expect(check(smallFarm(), named('x'.repeat(24)), cat)).toBeNull()
  })

  it('is gone when a new farm starts', () => {
    const s = run(cat, [named('Asha') as FarmEvent, started], smallFarm())
    expect(s.name).toBe('')
  })
})

describe('a farm that grows only some packs', () => {
  /** The shed is open; the garden, with its finds and its wild seed, is not. */
  const shedOnly = (): FarmState => run(cat, [started, { type: 'field-opened', pack: 'shed', slot: 0 }])

  it('finds nothing from a pack it has no field for', () => {
    const { x, y } = wildTile(shedOnly(), ['tree', 'bush'])
    expect(refusal(shedOnly(), { type: 'foraged', x, y, find: 'bee-find' })).toMatch(/nothing to find/)
  })

  it('cannot domesticate a wild seed, or jump the fence to a locked one, in a field that is not open', () => {
    const found = { ...shedOnly(), foraged: ['bee-find'] }
    expect(refusal(found, { type: 'domesticated', seed: 'bees' })).toMatch(/Garden field is not open/)
    expect(refusal(shedOnly(), { type: 'unlocked', seed: 'squash', ok: true })).toMatch(/Garden field is not open/)
    expect(check(shedOnly(), { type: 'unlocked', seed: 'lathe', ok: true }, cat)).toBeNull()
  })
})

describe('a seed that has to be earned', () => {
  // The shed has tools that the garden has to earn: see `earningCatalog`.
  const farm = (): FarmState => run(earnCat, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }])
  /** The farm with these seeds standing as trees, wherever they are: only the rules about earning look at them. */
  const withTrees = (s: FarmState, ...ids: string[]): FarmState =>
    ({ ...s, crops: [...s.crops, ...ids.map((seed, i): Crop => ({ seed, x: 20 + i, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [] }))] })
  const shedTile = (s: FarmState): { x: number; y: number } => {
    const n = worldSize(s.fields)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (fieldOf(x, y, s.fields, s.cleared) === 'shed') return { x, y }
    throw new Error('no shed tile')
  }
  const planting = (s: FarmState, seed: string): FarmEvent => ({ type: 'planted', seed, ...shedTile(s), notes: NOTES })

  it('cannot be planted until the learning is there, and says what earns it', () => {
    const s = farm()
    expect(check(s, planting(s, 'kiln'), earnCat)).toBe('You have not earned Kiln yet. It takes a seed rooted in another field.')
    expect(check(withTrees(s, 'corn'), planting(s, 'kiln'), earnCat)).toBeNull()
  })

  it('is not earned by a tree in its own field', () => {
    const s = withTrees(farm(), 'saw')
    expect(check(s, planting(s, 'kiln'), earnCat)).toBe('You have not earned Kiln yet. It takes a seed rooted in another field.')
  })

  it("follows a field's readiness, and is lost again when a tree there wilts", () => {
    const s = farm()
    expect(check(withTrees(s, 'corn'), planting(s, 'forge'), earnCat)).toBe('You have not earned Forge yet. It takes the Garden field at readiness 50.')
    const ready = withTrees(s, 'corn', 'beans')
    expect(check(ready, planting(s, 'forge'), earnCat)).toBeNull()
    const slipped = { ...ready, crops: ready.crops.map((c) => (c.seed === 'beans' ? { ...c, wilted: true } : c)) }
    expect(check(slipped, planting(s, 'forge'), earnCat)).toBe('You have not earned Forge yet. It takes the Garden field at readiness 50.')
  })

  it('is not something a jump over the fence gets round', () => {
    const s = farm()
    // The anvil needs the saw and has to be earned. A jump clears the first and leaves the second.
    expect(check(s, planting(s, 'anvil'), earnCat)).toBe('Anvil is still locked.')
    const jumped = run(earnCat, [{ type: 'unlocked', seed: 'anvil', ok: true, text: 'A link to it.', ticked: 2, of: 2 }], s)
    expect(jumped.unlocked).toEqual(['anvil'])
    expect(check(jumped, planting(s, 'anvil'), earnCat)).toBe('You have not earned Anvil yet. It takes a seed rooted in another field.')
    // And a seed that only has to be earned is not locked, so there is no fence to jump.
    expect(check(s, { type: 'unlocked', seed: 'kiln', ok: true, text: 'A link to it.', ticked: 2, of: 2 }, earnCat)).toBe('Kiln is not locked.')
  })

  it('gives the ordinary reasons first', () => {
    const s = farm()
    expect(check(s, { ...planting(s, 'kiln'), notes: 'too short' }, earnCat)).toContain('Write at least')
    expect(check(s, { ...planting(s, 'kiln'), x: 5, y: 5 }, earnCat)).toBe('Kiln belongs in the Shed field.')
  })

  it('is asked of what is done today and never of a saved farm: a log that holds the planting replays', () => {
    const s = farm()
    const e = planting(s, 'kiln')
    expect(check(s, e, earnCat)).not.toBeNull()
    expect(allowed(s, e, earnCat)).toBeNull()
    const after = apply(s, e, earnCat)
    expect(after.crops.map((c) => c.seed)).toEqual(['kiln'])
    const log = [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }, e]
    expect(refusedCount(log, earnCat)).toBe(0)
    expect(fold(log, earnCat)).toEqual(after)
  })

  it('asks nothing more of any other kind of event, or of a seed that asks for nothing', () => {
    const s = farm()
    for (const e of [planting(s, 'saw'), sleep, { type: 'farm-named', name: 'Ours' }, { type: 'bar-set', pack: 'garden', bar: 50 }, { type: 'bar-set', pack: 'shed', bar: 0 }, { type: 'nonsense' }, null]) {
      expect(check(s, e, earnCat)).toBe(allowed(s, e, earnCat))
    }
  })
})

describe('layer balance', () => {
  // The garden from the ground up: beet (root), squash (ground cover, locked), thyme (herb), corn (canopy). See `layeredCatalog`.
  const farm = (): FarmState => run(layerCat, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }])
  const ROOT_FIRST = 'Nothing stands in the Root layer of the Garden field yet. Plant there before Corn.'

  it('holds a seed back while a layer two or more beneath it is hollow and has a seed to plant, and says where to begin', () => {
    const s = farm()
    expect(check(s, plant('corn', 5, 5), layerCat)).toBe(ROOT_FIRST)
    expect(check(s, plant('thyme', 5, 5), layerCat)).toBe('Nothing stands in the Root layer of the Garden field yet. Plant there before Thyme.')
    expect(check(s, plant('beet', 5, 5), layerCat)).toBeNull()
  })

  it('lets the next layer up go in once the one below has been planted, a layer at a time', () => {
    const rooted = run(layerCat, [plant('beet', 5, 5)], farm())
    // The root has nothing left to plant. The herb is free; the canopy now waits for the herb.
    expect(check(rooted, plant('thyme', 6, 5), layerCat)).toBeNull()
    expect(check(rooted, plant('corn', 6, 5), layerCat)).toBe('Nothing stands in the Herb layer of the Garden field yet. Plant there before Corn.')
    const both = run(layerCat, [plant('thyme', 6, 5), sleep], rooted)
    expect(check(both, plant('corn', 7, 5), layerCat)).toBeNull()
  })

  it('never holds a vine, or anything in a field with no end', () => {
    const s = farm()
    expect(check(s, plant('beans', 5, 5), layerCat)).toBeNull()
    const { x, y } = (() => { const n = worldSize(s.fields); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (fieldOf(x, y, s.fields, s.cleared) === 'shed') return { x, y }; throw new Error('no shed tile') })()
    expect(check(s, plant('saw', x, y), layerCat)).toBeNull()
  })

  it('gives the ordinary reasons first', () => {
    const s = farm()
    expect(check(s, plant('corn', 5, 5, 'too short'), layerCat)).toContain('Write at least')
    expect(check(s, plant('squash', 5, 5), layerCat)).toBe('Squash is still locked.')
  })

  it('is asked of what is done today and never of a saved farm: a log that planted the canopy first replays', () => {
    const s = farm()
    const e = plant('corn', 5, 5)
    expect(check(s, e, layerCat)).toBe(ROOT_FIRST)
    expect(allowed(s, e, layerCat)).toBeNull()
    const log = [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }, e]
    expect(refusedCount(log, layerCat)).toBe(0)
    expect(fold(log, layerCat).crops.map((c) => c.seed)).toEqual(['corn'])
  })
})
