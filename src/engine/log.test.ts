import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import sampleFarm from '../game/sample-farm.json'
import { smallCatalog as cat, smallFarm, started } from './fixtures'
import { fold } from './fold'
import { farmFileName, farmFileText, parseFarmFile } from './log'
import type { FarmEvent, LoggedEvent } from './types'

const stamp = (list: FarmEvent[]): LoggedEvent[] => list.map((e, i) => ({ ...e, id: 'id' + i, at: '2026-11-01T10:00:00.000Z' }))

const events = stamp([
  started,
  { type: 'field-opened', pack: 'garden', slot: 0 },
  { type: 'field-opened', pack: 'shed', slot: 1 },
  { type: 'planted', seed: 'corn', x: 5, y: 5 },
  { type: 'slept' },
  { type: 'watered', seed: 'corn', ok: true },
])

describe('the export file', () => {
  it('is a permaculture v3 file holding the events', () => {
    expect(JSON.parse(farmFileText(events))).toEqual({ format: 'permaculture', v: 3, events })
  })

  it('is named after the day', () => {
    expect(farmFileName(12)).toBe('permaculture-farm-day12.json')
  })

  it('reads back to the same events, and folds to the same farm', () => {
    const parsed = parseFarmFile(farmFileText(events))
    expect(parsed).toEqual({ kind: 'log', events })
    if (parsed.kind !== 'log') return
    expect(fold(parsed.events, cat)).toEqual(fold(events, cat))
    expect(fold(parsed.events, cat).crops[0]).toMatchObject({ seed: 'corn', stage: 1 })
  })

  it('reads an empty log', () => {
    expect(parseFarmFile(farmFileText([]))).toEqual({ kind: 'log', events: [] })
  })
})

describe('parseFarmFile', () => {
  it('recognises a Phase 0 (v2) save', () => {
    expect(parseFarmFile(JSON.stringify(sampleFarm))).toMatchObject({ kind: 'v2' })
  })

  it('says what is wrong with a file that is not a farm', () => {
    const message = (text: string) => {
      const r = parseFarmFile(text)
      return r.kind === 'error' ? r.message : r.kind
    }
    expect(message('{nope')).toBe('That is not valid farm data.')
    expect(message('[]')).toMatch(/not a Permaculture farm/)
    expect(message('{"format":"other","v":3,"events":[]}')).toMatch(/not a Permaculture farm/)
    expect(message('{"format":"permaculture","v":4,"events":[]}')).toMatch(/newer version/)
    expect(message('{"format":"permaculture","v":3}')).toMatch(/format v3/)
    expect(message('{"format":"permaculture","v":3,"events":[{"type":"slept"}]}')).toMatch(/cannot read/)
    expect(message('{"format":"permaculture","v":3,"events":[3]}')).toMatch(/cannot read/)
  })

  it('never throws, whatever the text', () => {
    fc.assert(fc.property(fc.string(), (text) => void parseFarmFile(text)))
    fc.assert(fc.property(fc.json(), (text) => void parseFarmFile(text)))
  })
})

describe('a farm survives export and import', () => {
  it('round-trips through JSON text', () => {
    const s = smallFarm()
    const log = stamp([started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }])
    const back = parseFarmFile(farmFileText(log))
    expect(back.kind === 'log' && fold(back.events, cat)).toEqual(s)
  })
})
