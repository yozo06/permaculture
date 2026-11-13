// The market: buyers are named bars. In `marketCatalog` the cook wants the garden at 30 and the grocer at 60.
import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { marketCatalog as cat, marketPacks, smallFarm, started, run } from './fixtures'
import { allowed, apply, check, fold, initialState, parseEvent, refusedCount } from './fold'
import { buyersFor, standing } from './market'
import { RULES } from './rules'
import type { Crop, FarmEvent, FarmState } from './types'

const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
  ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
const farm = (...crops: Crop[]): FarmState => ({ ...smallFarm(), crops })
const buyer = (id: string) => { const b = cat.buyer(id); if (!b) throw new Error('no buyer ' + id); return b }
/** A tree in each of the garden's three layers: half its six seeds. */
const half = (): FarmState => farm(tree('corn'), tree('beans'), tree('squash'))
const SALE = 'An offer, in writing, on the fourth of March.'
const sold = (id: string, text = SALE): FarmEvent => ({ type: 'sold', buyer: id, text })

describe('the catalogue', () => {
  it('lists buyers with the field they stand in and the bars they name, in pack order', () => {
    expect(cat.buyers.map((b) => b.id)).toEqual(['cook', 'grocer'])
    expect(buyer('cook')).toEqual({ id: 'cook', name: 'The cook', note: 'Takes what is fresh.', pack: 'garden', bars: [{ pack: 'garden', want: 30 }] })
    expect(buyer('grocer').note).toBe('')
    expect(cat.buyer('nobody')).toBeUndefined()
  })
})

describe('how a farm stands with a buyer', () => {
  it('meets a bar when the field has reached it and none of its layers is hollow', () => {
    expect(standing(buyer('cook'), half(), cat)).toEqual({ buying: true, bars: [{ pack: 'garden', want: 30, have: 50, hollow: [], met: true }] })
    expect(standing(buyer('grocer'), half(), cat)).toMatchObject({ buying: false, bars: [{ want: 60, have: 50, met: false }] })
  })

  it('does not meet a bar over a hollow layer, whatever the number', () => {
    // Four of six, 66, but nothing stands in the ground cover.
    const s = farm(tree('corn'), tree('oak'), tree('beans'), tree('ivy'))
    expect(standing(buyer('grocer'), s, cat)).toMatchObject({ buying: false, bars: [{ have: 66, hollow: ['ground-cover'], met: false }] })
  })

  it('follows the field: a tree that wilts can take a buyer away again', () => {
    const s = farm(tree('corn'), tree('beans'), tree('squash'), tree('oak'))
    expect(standing(buyer('grocer'), s, cat).buying).toBe(true)
    const slipped = farm(tree('corn'), tree('beans'), tree('squash'), tree('oak', { wilted: true }))
    expect(standing(buyer('grocer'), slipped, cat).buying).toBe(false)
  })

  it('has no number for a field the farm does not have', () => {
    const shedOnly: FarmState = { ...farm(), fields: { shed: 0 } }
    expect(standing(buyer('cook'), shedOnly, cat)).toEqual({ buying: false, bars: [{ pack: 'garden', want: 30, have: null, hollow: [], met: false }] })
  })

  it('needs every bar of a buyer that names several fields', () => {
    const two = buildCatalog([
      ...marketPacks.map((p) => (p.pack === 'shed' ? { ...p, perennial: false } : p)),
    ].map((p) => (p.pack !== 'garden' ? p : { ...p, buyers: [{ id: 'both', name: 'Both', bars: { garden: 30, shed: 50 } }] })))
    const both = two.buyer('both')!
    expect(standing(both, half(), two)).toMatchObject({ buying: false, bars: [{ pack: 'garden', met: true }, { pack: 'shed', met: false }] })
    expect(standing(both, farm(tree('corn'), tree('beans'), tree('squash'), tree('saw'), tree('plane'), tree('lathe')), two).buying).toBe(true)
  })

  it('offers a farm the buyers of the fields it has', () => {
    expect(buyersFor(half(), cat).map((b) => b.id)).toEqual(['cook', 'grocer'])
    expect(buyersFor({ ...farm(), fields: { shed: 0 } }, cat)).toEqual([])
  })
})

describe('sold', () => {
  it('records a sale to a buyer who is buying, with the day and what was said, trimmed', () => {
    const s = run(cat, [sold('cook', '  ' + SALE + '  ')], half())
    expect(s.sales).toEqual([{ buyer: 'cook', day: 1, text: SALE }])
  })

  it('costs nothing and pays nothing: a sale is a record of something real', () => {
    const before = half()
    const s = run(cat, [sold('cook')], before)
    expect({ coins: s.coins, energy: s.energy }).toEqual({ coins: before.coins, energy: before.energy })
  })

  it('may be made to the same buyer again', () => {
    expect(run(cat, [sold('cook'), sold('cook', 'A second offer.')], half()).sales).toHaveLength(2)
  })

  it('is refused today for a buyer who is not buying, and says which bar is short', () => {
    expect(check(half(), sold('grocer'), cat)).toBe('The grocer is not buying yet: the Garden field is at 50, and the bar is 60.')
    const hollow = farm(tree('corn'), tree('oak'), tree('beans'), tree('ivy'))
    expect(check(hollow, sold('grocer'), cat)).toBe('The grocer is not buying yet: the Ground cover layer of the Garden field is hollow.')
    expect(check({ ...farm(), fields: { shed: 0 } }, sold('cook'), cat)).toBe('The cook is not buying yet: you do not have the Garden field.')
    expect(check(half(), sold('nobody'), cat)).toBe('No buyer of that name is at the market.')
  })

  it('needs a few words on what happened, and a farm to sell from', () => {
    expect(check(half(), sold('cook', 'yes'), cat)).toMatch(/at least 8 characters to say what happened/)
    expect(check(half(), sold('cook', 'x'.repeat(RULES.textMax + 1)), cat)).toMatch(/under 5000/)
    expect(check(initialState(), sold('cook'), cat)).toBe('There is no farm to sell from.')
    expect(parseEvent({ type: 'sold', buyer: 'cook' })).toBeNull()
    expect(parseEvent({ type: 'sold', buyer: 7, text: SALE })).toBeNull()
  })

  it('is asked of what is done today and never of a saved farm: a sale replays after its buyer has stopped buying or left', () => {
    const e = sold('grocer')
    expect(check(half(), e, cat)).not.toBeNull()
    expect(allowed(half(), e, cat)).toBeNull()
    expect(apply(half(), e, cat).sales).toEqual([{ buyer: 'grocer', day: 1, text: SALE }])
    const gone = sold('a-buyer-who-left')
    expect(allowed(half(), gone, cat)).toBeNull()
    const log = [started, { type: 'field-opened', pack: 'garden', slot: 0 }, e, gone]
    expect(refusedCount(log, cat)).toBe(0)
    expect(fold(log, cat).sales.map((x) => x.buyer)).toEqual(['grocer', 'a-buyer-who-left'])
  })

  it('starts every farm with no sales', () => {
    expect(initialState().sales).toEqual([])
    expect(run(cat, [started]).sales).toEqual([])
  })
})
