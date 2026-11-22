import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
import { fold } from '../engine/fold'
import { fieldOrigin } from '../engine/land'
import type { LoggedEvent } from '../engine/types'
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
  it('starts a fresh farm with no fields, because the farmer chooses them, and saves it', () => {
    const disk = memory()
    const store = make(disk)
    expect(store.firstVisit).toBe(true)
    expect(store.loadProblem).toBeNull()
    expect(store.state()).toMatchObject({ day: 1, energy: 90, coins: 140, barrel: 0, crops: [] })
    expect(store.state().fields).toEqual({})
    expect(parseFarmFile(disk.data[LOG_KEY] ?? '')).toMatchObject({ kind: 'log' })
  })

  it('never opens a field by itself on a later load', () => {
    const disk = memory()
    const first = make(disk)
    first.dispatch({ type: 'field-opened', pack: 'kannada', slot: 0 })
    const second = make(disk)
    expect(second.state().fields).toEqual({ kannada: 0 })
    expect(second.events()).toHaveLength(first.events().length)
  })

  it('keeps a field of the farmer\'s own, and its topics, through a reload', () => {
    // The log stamps every entry with an id and a time of its own, so an event may not keep anything under those names.
    const disk = memory()
    const first = make(disk)
    const topic = { id: 'my_abcd1234_aaaaaa', name: 'Der Dativ', kind: 'rule', summary: '', group: '', cards: [] } as const
    expect(first.dispatch({ type: 'own-field-set', field: 'my_abcd1234', slot: 0, title: 'German', color: '#4DB6A4' })).toBeNull()
    expect(first.dispatch({ type: 'own-seeds-set', field: 'my_abcd1234', seeds: [{ ...topic, cards: [] }] })).toBeNull()
    expect(first.dispatch({ type: 'own-seeds-set', field: 'my_abcd1234', seeds: [{ ...topic, id: 'my_abcd1234_bbbbbb', name: 'Gone', cards: [] }] })).toBeNull()
    expect(first.dispatch({ type: 'own-seed-removed', topic: 'my_abcd1234_bbbbbb' })).toBeNull()
    const second = make(disk)
    expect(second.refused).toBe(0)
    expect(second.state().fields).toEqual({ my_abcd1234: 0 })
    expect(second.state().own['my_abcd1234']?.seeds.map((x) => x.name)).toEqual(['Der Dativ'])
    expect(second.state()).toEqual(first.state())
    expect(second.dispatch({ type: 'own-field-removed', field: 'my_abcd1234' })).toBeNull()
    expect(make(disk).state().own).toEqual({})
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

  it('counts nothing refused in a healthy saved farm, and says how many entries no longer fit in a drifted one', () => {
    const disk = memory()
    const first = make(disk)
    first.dispatch({ type: 'slept' })
    expect(make(disk).refused).toBe(0)
    const drifted = [...first.events(), { type: 'planted', seed: 'a-seed-that-was-renamed', x: 5, y: 5, notes: 'n'.repeat(60), id: 'x1', at: '2026-11-01T00:00:00Z' }]
    disk.data[LOG_KEY] = farmFileText(drifted as never)
    const second = make(disk)
    expect(second.refused).toBe(1)
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
    store.dispatch({ type: 'field-opened', pack: 'infra', slot: 0 })
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

  it('asks a player for a seed to be earned, and never asks a farm that is loaded or imported', () => {
    // Sprite sheets are earned by a seed rooted in another field. Here nothing is rooted anywhere.
    const disk = memory()
    const store = make(disk)
    const { x0, y0 } = fieldOrigin(0)
    store.dispatch({ type: 'field-opened', pack: 'workshop', slot: 0 })
    expect(store.dispatch({ type: 'unlocked', seed: 'sprites', ok: true, text: 'A link to the sheet.', ticked: 2, of: 2 })).toBeNull()
    const planting = { type: 'planted' as const, seed: 'sprites', x: x0, y: y0, notes: 'One sheet for every crop, tree and building, drawn the same way.' }
    const before = store.events().length
    expect(store.dispatch(planting)).toBe('You have not earned Sprite sheets yet. It takes a seed rooted in another field.')
    expect(store.events()).toHaveLength(before)
    expect(store.state().crops).toEqual([])
    // The same planting in a log from before the rule is kept, on import and on the next load.
    const old: LoggedEvent[] = [...store.events(), { ...planting, id: 'old', at: '2026-10-01T00:00:00Z' }]
    expect(store.importLog(old)).toBeNull()
    expect(store.state().crops.map((c) => c.seed)).toEqual(['sprites'])
    const again = make(disk)
    expect(again.refused).toBe(0)
    expect(again.state().crops.map((c) => c.seed)).toEqual(['sprites'])
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
    // The four fields it was made with. The packs added since are offered in the learning tree, not forced.
    expect(Object.keys(store.state().fields)).toEqual(['haskell-backend', 'system-design', 'infra', 'kannada'])
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
    expect(Object.keys(store.state().fields)).toHaveLength(4)
    store.newFarm('fresh')
    expect(store.state()).toMatchObject({ day: 1, crops: [], fields: {} })
  })

  it('a new farm starts with the camera and the farmer at home, but keeps the zoom: that belongs to the screen, not to the farm', () => {
    const store = make(memory())
    store.ui.zoom = 5
    store.ui.cam = { x: 1, y: 2 }
    store.newFarm('sample')
    expect(store.ui.zoom).toBe(5)
    expect(store.ui.cam).toBeNull()
  })

  it('remembers across a reload the field whose answer from a chat is awaited, and forgets it with the farm', () => {
    const disk = memory()
    const store = make(disk)
    expect(store.ui.waiting).toBeNull()
    store.ui.waiting = 'my_abcd1234'
    store.saveUi()
    expect(make(disk).ui.waiting).toBe('my_abcd1234')
    disk.data[UI_KEY] = '{"waiting":5}'
    expect(make(disk).ui.waiting).toBeNull()
    const again = make(disk)
    again.ui.waiting = 'my_abcd1234'
    again.newFarm('fresh')
    expect(again.ui.waiting).toBeNull()
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

  it('refuses an empty v2 save and keeps the current farm', () => {
    const store = make(memory())
    expect(store.importSnapshot(sample)).toBeNull()
    expect(store.state().day).toBe(12)
    expect(store.importSnapshot({ v: 2, crops: [], farmer: {} })).toMatch(/format v2/)
    expect(store.state().day).toBe(12)
    expect(store.state().crops).toHaveLength(sample.crops.length)
  })
})
