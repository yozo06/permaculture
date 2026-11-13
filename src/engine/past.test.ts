import { describe, expect, it } from 'vitest'
import { NOTES, smallCatalog as cat, started } from './fixtures'
import { fold } from './fold'
import { farmOn } from './past'
import type { FarmEvent } from './types'

const sleep: FarmEvent = { type: 'slept' }
const open: FarmEvent = { type: 'field-opened', pack: 'garden', slot: 0 }
const plant = (seed: string, x: number): FarmEvent => ({ type: 'planted', seed, x, y: 5, notes: NOTES })
// Day 1: corn goes in. Day 2: beans. Day 3: nothing. Day 4: named.
const log: FarmEvent[] = [started, open, plant('corn', 5), sleep, plant('beans', 6), sleep, sleep, { type: 'farm-named', name: 'Ours' }]

describe('the farm of an earlier morning', () => {
  it('is the farm as that day began, before anything was done in it', () => {
    expect(farmOn(log, 2, cat)?.crops.map((c) => c.seed)).toEqual(['corn'])
    expect(farmOn(log, 3, cat)?.crops.map((c) => c.seed)).toEqual(['corn', 'beans'])
    expect(farmOn(log, 2, cat)).toMatchObject({ day: 2, energy: 90, today: { planted: 0 } })
  })

  it('is the bare start on the first day', () => {
    expect(farmOn(log, 1, cat)).toMatchObject({ day: 1, fields: {}, crops: [] })
  })

  it("is today's morning for today, not the farm as it stands now", () => {
    expect(fold(log, cat).name).toBe('Ours')
    expect(farmOn(log, 4, cat)).toMatchObject({ day: 4, name: '' })
  })

  it('is nothing for a day that has not come, or a day before the farm', () => {
    expect(farmOn(log, 5, cat)).toBeNull()
    expect(farmOn(log, 0, cat)).toBeNull()
    expect(farmOn([], 1, cat)).toBeNull()
  })

  it('is nothing for a day before a farm that began later, as one brought over from the first prototype does', () => {
    const late: FarmEvent[] = [{ ...started, day: 12 }, open, sleep]
    expect(farmOn(late, 5, cat)).toBeNull()
    expect(farmOn(late, 12, cat)?.day).toBe(12)
    expect(farmOn(late, 13, cat)?.fields).toEqual({ garden: 0 })
  })

  it('belongs to the farm that is there now: a farm started over forgets the mornings of the one before', () => {
    const again: FarmEvent[] = [...log, started, open, sleep]
    expect(farmOn(again, 2, cat)?.crops).toEqual([])
    expect(farmOn(again, 3, cat)).toBeNull()
  })

  it('skips what the log may not hold, as replay does', () => {
    expect(farmOn([started, { type: 'nonsense' }, sleep], 2, cat)?.day).toBe(2)
  })
})
