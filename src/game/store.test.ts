import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
import { fold } from '../engine/fold'
import { farmFileText, parseFarmFile } from '../engine/log'
import sample from './sample-farm.json'
import { BROKEN_KEY, LEGACY_KEY, LOG_KEY, UI_KEY, createStore, type StorageLike } from './store'

const catalog = buildCatalog(collectPacks())

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}
let n = 0
const make = (storage: StorageLike | null) => createStore({ catalog, storage, sample, newId: () => 'id' + n++, now: () => '2026-11-01T00:00:00Z' })

describe('the first visit', () => {
  it('starts a fresh farm with a field for every pack, and saves it', () => {
    const disk = memory()
    const store = make(disk)
    expect(store.firstVisit).toBe(true)
    expect(store.loadProblem).toBeNull()
    expect(store.state()).toMatchObject({ day: 1, energy: 90, coins: 140, barrel: 0, crops: [] })
    expect(Object.keys(store.state().fields)).toEqual(catalog.packs.map((p) => p.pack))
    expect(parseFarmFile(disk.data[LOG_KEY] ?? '')).toMatchObject({ kind: 'log' })
  })

  it('is not a first visit the second time, and replays to the same farm', () => {
    const disk = memory()
    const first = make(disk)
    first.dispatch({ type: 'slept' })
    const second = make(disk)
    expect(second.firstVisit).toBe(false)
    expect(second.state()).toEqual(first.state())
    expect(second.state().day).toBe(2)
  })

  it('works with no storage at all', () => {
    const store = make(null)
    expect(store.dispatch({ type: 'slept' })).toBeNull()
    expect(store.state().day).toBe(2)
    expect(store.saveFailed()).toBe(true)
  })
})

describe('dispatch', () => {
  it('logs an allowed event with an id and a time, and saves it', () => {
    const disk = memory()
    const store = make(disk)
    const before = store.events().length
    expect(store.dispatch({ type: 'focus-set', pack: 'infra', branch: 'network-and-platform' })).toBeNull()
    const last = store.events()[before]
    expect(last).toMatchObject({ type: 'focus-set', at: '2026-11-01T00:00:00Z' })
    expect(typeof last?.id).toBe('string')
    expect(fold(store.events(), catalog)).toEqual(store.state())
    const saved = parseFarmFile(disk.data[LOG_KEY] ?? '')
    expect(saved.kind === 'log' && saved.events.length).toBe(before + 1)
  })

  it('gives the reason and logs nothing when the event is refused', () => {
    const store = make(memory())
    const before = store.events().length
    expect(store.dispatch({ type: 'watered', seed: 'stm', ok: true, work: 'recall' })).toMatch(/not planted/)
    expect(store.events()).toHaveLength(before)
  })

  it('keeps going when storage refuses to save', () => {
    const store = make({ getItem: () => null, setItem: () => { throw new Error('full') } })
    expect(store.dispatch({ type: 'slept' })).toBeNull()
    expect(store.saveFailed()).toBe(true)
    expect(store.state().day).toBe(2)
  })
})

describe('Phase 0 saves', () => {
  it('start the log with a snapshot-imported event, and leave the old key alone', () => {
    const old = JSON.stringify(sample)
    const disk = memory({ [LEGACY_KEY]: old })
    const store = make(disk)
    expect(store.firstVisit).toBe(false)
    expect(store.events()[0]?.type).toBe('snapshot-imported')
    expect(store.state()).toMatchObject({ day: 12, barrel: 2 })
    expect(store.state().crops).toHaveLength(sample.crops.length)
    expect(Object.keys(store.state().fields)).toHaveLength(catalog.packs.length)
    expect(disk.data[LEGACY_KEY]).toBe(old)
    expect(disk.data[LOG_KEY]).toBeDefined()
  })

  it('are ignored once a log exists', () => {
    const disk = memory({ [LEGACY_KEY]: JSON.stringify(sample) })
    make(disk).dispatch({ type: 'slept' })
    expect(make(disk).state().day).toBe(13)
  })
})

describe('bad data', () => {
  for (const [name, bad] of [['not JSON', '{oops'], ['not a farm', '{"a":1}'], ['a log that never starts a farm', farmFileText([])]] as const) {
    it(`${name} becomes a fresh farm and a message, and is kept aside`, () => {
      const disk = memory({ [LOG_KEY]: bad })
      const store = make(disk)
      expect(store.loadProblem).toMatch(/could not be read/)
      expect(store.state().day).toBe(1)
      expect(disk.data[BROKEN_KEY]).toBe(bad)
    })
  }

  it('an unreadable Phase 0 save becomes a fresh farm and a message', () => {
    const store = make(memory({ [LEGACY_KEY]: '[1,2' }))
    expect(store.loadProblem).toMatch(/could not be read/)
    expect(store.state().day).toBe(1)
  })

  it('a damaged screen state falls back to the defaults', () => {
    const disk = memory()
    make(disk)
    disk.data[UI_KEY] = '{"cam":{"x":"far"},"farmer":5,"seedSel":9}'
    const ui = make(disk).ui
    expect(ui.farmer).toEqual({ x: 9, y: 8, tx: 9, ty: 8 })
    expect(ui.seedSel).toBeNull()
  })
})

describe('new farms and imports', () => {
  it('Start fresh and Sample farm replace the log', () => {
    const store = make(memory())
    store.dispatch({ type: 'slept' })
    store.newFarm('sample')
    expect(store.state()).toMatchObject({ day: 12, barrel: 2 })
    expect(Object.keys(store.state().fields)).toHaveLength(catalog.packs.length)
    store.newFarm('fresh')
    expect(store.state()).toMatchObject({ day: 1, crops: [] })
  })

  it('imports a v3 log, and refuses one that does not start a farm', () => {
    const a = make(memory())
    a.dispatch({ type: 'slept' })
    const parsed = parseFarmFile(farmFileText(a.events()))
    const b = make(memory())
    expect(parsed.kind === 'log' && b.importLog(parsed.events)).toBeNull()
    expect(b.state()).toEqual(a.state())
    expect(b.importLog([])).toMatch(/no beginning/)
    expect(b.state().day).toBe(2)
  })

  it('imports a v2 snapshot as one event, and refuses junk', () => {
    const store = make(memory())
    expect(store.importSnapshot(sample)).toBeNull()
    expect(store.events()[0]?.type).toBe('snapshot-imported')
    expect(store.state().day).toBe(12)
    expect(store.importSnapshot({ v: 2 })).toMatch(/format v2/)
    expect(store.state().day).toBe(12)
  })
})
