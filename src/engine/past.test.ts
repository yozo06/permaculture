import { describe, expect, it } from 'vitest'
import { NOTES, smallCatalog as cat, started } from './fixtures'
import { fold } from './fold'
import { farmAtEndOf } from './past'
import type { FarmEvent } from './types'

const sleep: FarmEvent = { type: 'slept' }
const open: FarmEvent = { type: 'field-opened', pack: 'garden', slot: 0 }
const plant = (seed: string, x: number): FarmEvent => ({ type: 'planted', seed, x, y: 5, notes: NOTES })
// Day 1: the field is opened and corn goes in. Day 2: beans. Day 3: nothing. Day 4: named.
const log: FarmEvent[] = [started, open, plant('corn', 5), sleep, plant('beans', 6), sleep, sleep, { type: 'farm-named', name: 'Ours' }]

describe('the farm as an earlier day ended', () => {
  it('is the farm with everything done that day, before the night', () => {
    expect(farmAtEndOf(log, 1, cat)).toMatchObject({ day: 1, fields: { garden: 0 }, today: { planted: 1 } })
    expect(farmAtEndOf(log, 1, cat)?.crops.map((c) => c.seed)).toEqual(['corn'])
    expect(farmAtEndOf(log, 2, cat)?.crops.map((c) => c.seed)).toEqual(['corn', 'beans'])
    // The night has not happened yet: the energy spent that day is still spent.
    expect(farmAtEndOf(log, 1, cat)?.energy).toBe(80)
  })

  it('is a day on which nothing was done, as the morning left it', () => {
    expect(farmAtEndOf(log, 3, cat)).toMatchObject({ day: 3, energy: 90, today: { planted: 0 } })
  })

  it('is the farm as it stands for today', () => {
    expect(farmAtEndOf(log, 4, cat)).toEqual(fold(log, cat))
  })

  it('is nothing for a day that has not come, or a day before the farm', () => {
    expect(farmAtEndOf(log, 5, cat)).toBeNull()
    expect(farmAtEndOf(log, 0, cat)).toBeNull()
    expect(farmAtEndOf([], 1, cat)).toBeNull()
  })

  it('is nothing for a day before a farm that began later, as one brought over from the first prototype does', () => {
    const late: FarmEvent[] = [{ ...started, day: 12 }, open, sleep]
    expect(farmAtEndOf(late, 5, cat)).toBeNull()
    expect(farmAtEndOf(late, 12, cat)?.fields).toEqual({ garden: 0 })
  })

  it('belongs to the farm that is there now: a farm started over forgets the days of the one before', () => {
    // Started over on a later day, on the same day, and with the days running back to 1.
    const later: FarmEvent[] = [started, open, sleep, sleep, { ...started, day: 10, coins: 7 }, sleep]
    expect(farmAtEndOf(later, 2, cat)).toBeNull()
    expect(farmAtEndOf(later, 10, cat)).toMatchObject({ coins: 7, fields: {} })
    const sameDay: FarmEvent[] = [started, open, plant('corn', 5), { ...started, coins: 7 }, sleep]
    expect(farmAtEndOf(sameDay, 1, cat)).toMatchObject({ coins: 7, fields: {}, crops: [] })
    const back: FarmEvent[] = [...log, started, open, sleep]
    expect(farmAtEndOf(back, 1, cat)).toMatchObject({ fields: { garden: 0 }, crops: [] })
    expect(farmAtEndOf(back, 3, cat)).toBeNull()
  })

  it('skips what the log may not hold, as replay does', () => {
    expect(farmAtEndOf([started, { type: 'nonsense' }, open, sleep], 1, cat)?.fields).toEqual({ garden: 0 })
  })
})
