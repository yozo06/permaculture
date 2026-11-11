// A farm played on purpose and committed as a log: forty days on the real packs, with every kind of event, right and
// wrong answers, a failed harvest, lazy days, fenced land, finds and a jump over the fence. (Not anyone's real farm:
// a real log holds its owner's notes.)
//
// Saved farms are replayed against today's packs and rules, and what no longer fits is skipped. This test is the
// alarm for that: if a change to a rule's number or to a pack makes this farm lose anything, real farms would too.
// Update played-farm.json or the numbers below only on purpose, and say in the pull request how saved farms change.
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from './catalog'
import { apply, fold, initialState, refusedCount } from './fold'
import { parseFarmFile } from './log'
import played from './played-farm.json'
import type { FarmState } from './types'

const catalog = buildCatalog(collectPacks())
const file = parseFarmFile(JSON.stringify(played))
const events = file.kind === 'log' ? file.events : []

describe('the played farm', () => {
  it('is a readable export with every kind of event a player can cause', () => {
    expect(file.kind).toBe('log')
    expect(events).toHaveLength(359)
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual(
      ['domesticated', 'farm-started', 'fenced', 'field-opened', 'focus-set', 'foraged', 'harvested', 'planted', 'slept', 'unlocked', 'watered'],
    )
  })

  it('replays with nothing refused', () => {
    expect(refusedCount(events, catalog)).toBe(0)
  })

  it('ends where it ended when it was played', () => {
    const s = fold(events, catalog)
    expect(s).toMatchObject({ day: 41, coins: 404, energy: 90, barrel: 1, compost: ['num'], unlocked: ['hash-sets-maps'], volunteers: ['fpaxos', 'linear-types', 'nonmoving'] })
    expect(s.crops).toHaveLength(47)
    expect(s.crops.filter((c) => c.perennial)).toHaveLength(29)
    expect(s.crops.filter((c) => c.wilted)).toHaveLength(1)
    expect(s.foraged).toHaveLength(3)
    expect(Object.keys(s.cleared)).toHaveLength(4)
    expect(s.crops.reduce((n, c) => n + c.journal.length, 0)).toBe(66)
  })

  it('lived through nights the barrel saved and nights it could not', () => {
    let s: FarmState = initialState()
    let saved = 0
    let wilted = 0
    for (const e of events) {
      s = apply(s, e, catalog)
      if (e.type === 'slept' && s.night) { saved += s.night.saved.length; wilted += s.night.wilted.length }
    }
    expect({ saved, wilted }).toEqual({ saved: 12, wilted: 9 })
  })
})
