import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from './catalog'
import { fold } from './fold'
import { NOTES, run, smallCatalog as cat, started } from './fixtures'
import { fieldOf, tileKey } from './land'
import { farmCode, layOut, makePicture, readPicture, type Picture } from './picture'
import played from './played-farm.json'
import { RULES } from './rules'
import type { Crop, FarmEvent, FarmState } from './types'

const NOW = Date.parse('2026-11-20T15:00:00Z')
const AT = '2026-11-20T14:05:09Z'
const CODE = '0k7f3q9xw2m4a'
const shot = (s: FarmState, show: readonly string[] = Object.keys(s.fields)): Picture => makePicture(s, { code: CODE, at: AT, game: '0.2.0', show })
/** As a neighbour's game meets it: out of JSON, through the reader. */
const sent = (p: Picture) => readPicture(JSON.parse(JSON.stringify(p)), cat, NOW)
const plant = (seed: string, x: number, y: number, notes = NOTES): FarmEvent => ({ type: 'planted', seed, x, y, notes })
const named: FarmEvent = { type: 'farm-named', name: 'Asha' }

/** The garden on plot 0 and the shed on plot 1, with corn and beans in the garden and a saw in the shed. */
const farm = (): FarmState =>
  run(cat, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }, named, plant('corn', 5, 5), plant('beans', 7, 6), { type: 'slept' }, plant('saw', 12, 5)])

describe('farmCode', () => {
  const base36 = (hex: string): string => BigInt('0x' + hex).toString(36).padStart(13, '0')

  it('is the 64-bit FNV-1a hash of the id, in base 36, 13 characters', () => {
    // Published test vectors for FNV-1a 64.
    expect(farmCode('')).toBe(base36('cbf29ce484222325'))
    expect(farmCode('a')).toBe(base36('af63dc4c8601ec8c'))
    expect(farmCode('foobar')).toBe(base36('85944171f73967e8'))
  })

  it('is always 13 characters of 0-9 and a-z, whatever the id', () => {
    fc.assert(fc.property(fc.string(), (id) => { expect(farmCode(id)).toMatch(/^[0-9a-z]{13}$/) }))
  })

  it('agrees with a standard UTF-8 encoder on every string, lone surrogates included', () => {
    const reference = (id: string): string => {
      let hash = 0xcbf29ce484222325n
      for (const byte of new TextEncoder().encode(id)) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn
      return hash.toString(36).padStart(13, '0')
    }
    for (const id of ['abc', 'é', '€', '😀x', '\ud800', 'a\udc00', '\ud83d']) expect(farmCode(id), JSON.stringify(id)).toBe(reference(id))
    fc.assert(fc.property(fc.string({ unit: 'binary' }), (id) => { expect(farmCode(id)).toBe(reference(id)) }))
  })

  it('hashes the bytes of the whole id, so ids that begin alike differ', () => {
    expect(farmCode('mfx1a2b3-aaaaaaaa')).not.toBe(farmCode('mfx1a2b3-aaaaaaab'))
    expect(farmCode('é')).not.toBe(farmCode('e'))
  })
})

describe('makePicture', () => {
  it('holds the name, the day, the moment, and each shown field with its crops counted from its own corner', () => {
    expect(shot(farm())).toEqual({
      code: CODE, name: 'Asha', day: 2, at: AT, game: '0.2.0',
      fields: [
        { pack: 'garden', land: [], crops: [['corn', 0, 0, 0, 0], ['beans', 2, 1, 0, 0]] },
        { pack: 'shed', land: [], crops: [['saw', 0, 0, 0, 0]] },
      ],
    })
  })

  it('shows a tree as a tree, and fenced land as tiles outside the field\'s first nine', () => {
    const s = farm()
    const grown: FarmState = { ...s, coins: 500, crops: s.crops.map((c) => (c.seed === 'corn' ? { ...c, stage: 4, best: 4, perennial: true } : c)) }
    const fenced = run(cat, [{ type: 'fenced', x: 4, y: 5, pack: 'garden' }, { type: 'fenced', x: 5, y: 8, pack: 'garden' }], grown)
    const p = shot(fenced)
    expect(p.fields[0]?.land).toEqual([[-1, 0], [0, 3]])
    expect(p.fields[0]?.crops[0]).toEqual(['corn', 0, 0, 4, 1])
  })

  it('leaves out a field that is not shown, with no trace of it', () => {
    const p = shot(farm(), ['shed'])
    expect(p.fields.map((f) => f.pack)).toEqual(['shed'])
    expect(JSON.stringify(p)).not.toMatch(/garden|corn|beans/)
  })

  it('carries no plot numbers: a field looks the same wherever it sits on the map', () => {
    const elsewhere = run(cat, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 3 }, named, { type: 'slept' }, plant('saw', 12, 12)])
    expect(shot(elsewhere, ['shed'])).toEqual(shot(farm(), ['shed']))
  })
})

describe('what never crosses the fence', () => {
  const MARK = 'ZZPRIVATEZZ'
  const secret = (): FarmState => {
    const s = farm()
    const crops: Crop[] = s.crops.map((c) => ({ ...c, notes: MARK + ' notes', journal: [{ day: 1, kind: 'explain', text: MARK + ' explanation', ok: false }] }))
    return { ...s, crops, compost: ['corn'], coins: 77777, energy: 33, barrel: 3, foraged: ['bee-find'], focus: { garden: 'roots' } }
  }

  it('is notes, explanations, the compost heap, coins, energy, the barrel, finds and focus', () => {
    const text = JSON.stringify(shot(secret()))
    expect(text).not.toContain(MARK)
    expect(text).not.toMatch(/77777|bee-find|roots|compost|notes|journal/)
  })

  it('is whether a crop is wilted, when it is due, and where it stands today', () => {
    const s = farm()
    const healthy: FarmState = { ...s, crops: s.crops.map((c) => ({ ...c, stage: 2, best: 3 })) }
    const troubled: FarmState = { ...s, crops: s.crops.map((c) => ({ ...c, stage: 1, best: 3, wilted: true, due: 99 })) }
    expect(shot(troubled)).toEqual(shot(healthy))
  })

  it('is a wrong answer or a failed harvest, even to someone holding two pictures', () => {
    const before = farm()
    const corn = (s: FarmState, patch: Partial<Crop>): FarmState => ({ ...s, crops: s.crops.map((c) => (c.seed === 'corn' ? { ...c, ...patch } : c)) })
    const first = shot(corn(before, { stage: 4, best: 4, due: 9 }))
    const failed = run(cat, [{ type: 'harvested', seed: 'corn', ok: false }, { type: 'watered', seed: 'beans', ok: false, work: 'recall' }], corn(before, { stage: 4, best: 4, due: 9 }))
    const second = shot(failed)
    const stages = (p: Picture): Record<string, number> => Object.fromEntries(p.fields.flatMap((f) => f.crops.map((c) => [c[0], c[3]])))
    for (const [seed, stage] of Object.entries(stages(first))) expect(stages(second)[seed], seed).toBeGreaterThanOrEqual(stage)
  })
})

describe('readPicture', () => {
  it('gives back exactly what was made', () => {
    const p = shot(farm())
    expect(sent(p)).toEqual({ picture: p, newer: 0, misfit: 0 })
  })

  it.each<[string, (p: Record<string, unknown>) => void]>([
    ['a code that is not 13 characters of 0-9a-z', (p) => { p.code = 'SHORT' }],
    ['a name that is empty', (p) => { p.name = '   ' }],
    ['a name that is too long', (p) => { p.name = 'x'.repeat(RULES.farmName.max + 1) }],
    ['a day that is not a whole number from 1', (p) => { p.day = 0.5 }],
    ['a moment that is not a date', (p) => { p.at = 'yesterday' }],
    ['a moment more than a day in the future', (p) => { p.at = '2026-11-22T15:00:01Z' }],
    ['a moment on a day that does not exist', (p) => { p.at = '2026-02-31T00:00:00Z' }],
    ['a moment at an hour that does not exist', (p) => { p.at = '2026-11-11T24:00:00Z' }],
    ['fields that are not a list', (p) => { p.fields = 'all of them' }],
    ['more than 400 crops', (p) => { p.fields = [{ pack: 'garden', land: [], crops: Array.from({ length: 401 }, () => ['corn', 0, 0, 0, 0]) }] }],
  ])('cannot read %s', (_name, spoil) => {
    const p = JSON.parse(JSON.stringify(shot(farm()))) as Record<string, unknown>
    spoil(p)
    expect(readPicture(p, cat, NOW)).toBeNull()
  })

  it('cannot read things that are not pictures at all', () => {
    for (const junk of [null, 7, 'farm', [], {}, { code: CODE }]) expect(readPicture(junk, cat, NOW)).toBeNull()
  })

  it('trims the name and keeps it as plain text', () => {
    const p = { ...shot(farm()), name: '  <img src=x onerror=a()>  ' }
    expect(sent(p)?.picture.name).toBe('<img src=x onerror=a()>')
  })

  it('skips a field and crops this game does not know, and counts them as needing a newer game', () => {
    const p = shot(farm())
    p.fields.push({ pack: 'orchard', land: [], crops: [['apple', 0, 0, 2, 0], ['pear', 1, 0, 2, 0]] })
    p.fields[0]?.crops.push(['quinoa', 1, 1, 1, 0])
    const r = sent(p)
    expect(r?.newer).toBe(3)
    expect(r?.picture.fields.map((f) => f.pack)).toEqual(['garden', 'shed'])
    expect(r?.picture.fields[0]?.crops.map((c) => c[0])).toEqual(['corn', 'beans'])
  })

  it('drops a field listed twice, a seed in the wrong field, a seed listed twice, and positions out of range', () => {
    const p = shot(farm())
    p.fields.push({ pack: 'garden', land: [], crops: [['squash', 1, 1, 1, 0]] })
    p.fields[1]?.crops.push(['corn', 1, 1, 1, 0], ['saw', 2, 2, 1, 0], ['plane', 99, 0, 1, 0])
    p.fields[1]?.land.push([-41, 0], [1.5, 2], [3, 0])
    const r = sent(p)
    expect(r?.picture.fields).toHaveLength(2)
    expect(r?.picture.fields[1]).toEqual({ pack: 'shed', land: [[3, 0]], crops: [['saw', 0, 0, 0, 0]] })
    expect(r?.misfit).toBe(4)
  })

  it('keeps at most 60 fenced tiles of a field', () => {
    const p = shot(farm())
    const field = p.fields[0]
    if (field) field.land = Array.from({ length: 70 }, (_, i) => [3 + (i % 10), Math.floor(i / 10)] as [number, number])
    expect(sent(p)?.picture.fields[0]?.land).toHaveLength(60)
  })

  it('never throws, and what it accepts is always a sound picture', () => {
    const junkCrop = fc.oneof(fc.anything(), fc.tuple(fc.constantFrom('corn', 'beans', 'saw', 'nope', 7), fc.integer({ min: -50, max: 50 }), fc.oneof(fc.integer({ min: -50, max: 50 }), fc.double()), fc.integer({ min: -2, max: 7 }), fc.constantFrom(0, 1, 2, true)))
    const junkField = fc.oneof(fc.anything(), fc.record({ pack: fc.constantFrom('garden', 'shed', 'nope', 3), land: fc.oneof(fc.anything(), fc.array(fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 })))), crops: fc.oneof(fc.anything(), fc.array(junkCrop, { maxLength: 12 })) }))
    const junk = fc.oneof(fc.anything(), fc.record({
      code: fc.constantFrom(CODE, 'x', 9), name: fc.oneof(fc.string(), fc.constant('Asha')), day: fc.oneof(fc.integer({ min: -2, max: 500 }), fc.double()),
      at: fc.constantFrom(AT, '2020-01-01T00:00:00Z', 'never', 4), game: fc.anything(), fields: fc.oneof(fc.anything(), fc.array(junkField, { maxLength: 5 })),
    }))
    fc.assert(fc.property(junk, (raw) => {
      const r = readPicture(raw, cat, NOW)
      if (!r) return
      // Reading what was read changes nothing: the result is already clean.
      expect(readPicture(JSON.parse(JSON.stringify(r.picture)), cat, NOW)).toEqual({ picture: r.picture, newer: 0, misfit: 0 })
      const laid = layOut(r.picture, cat)
      const s = laid.state
      expect(new Set(s.crops.map((c) => c.seed)).size).toBe(s.crops.length)
      expect(new Set(s.crops.map((c) => tileKey(c.x, c.y))).size).toBe(s.crops.length)
      for (const c of s.crops) expect(fieldOf(c.x, c.y, s.fields, s.cleared)).toBe(cat.seed(c.seed)?.pack)
    }), { numRuns: 300 })
  })
})

describe('layOut', () => {
  it('puts a farm shown whole back exactly as it is', () => {
    const s = farm()
    const laid = layOut(shot(s), cat)
    expect(laid.misfit).toBe(0)
    expect(laid.state).toMatchObject({ name: 'Asha', day: 2, fields: s.fields, cleared: {} })
    expect(laid.state.crops.map((c) => [c.seed, c.x, c.y])).toEqual([['corn', 5, 5], ['beans', 7, 6], ['saw', 12, 5]])
  })

  it('draws each crop at the furthest it has grown, healthy, with nothing of the owner\'s writing', () => {
    const s = farm()
    const laid = layOut(shot({ ...s, crops: s.crops.map((c) => ({ ...c, stage: 1, best: 3, wilted: true })) }), cat)
    for (const c of laid.state.crops) expect(c).toMatchObject({ stage: 3, best: 3, wilted: false, perennial: false, notes: '', journal: [] })
  })

  it('closes ranks when fields are hidden: the shown ones start from the first plot', () => {
    const laid = layOut(shot(farm(), ['shed']), cat)
    expect(laid.state.fields).toEqual({ shed: 0 })
    expect(laid.state.crops.map((c) => [c.seed, c.x, c.y])).toEqual([['saw', 5, 5]])
  })

  it('counts what will not fit once ranks are closed, and keeps the rest', () => {
    // The shed sits on plot 1 with land fenced out to its east. Shown alone it moves to plot 0, and three of those
    // tiles would land on the barn: they are lost, and so is the crop standing on one of them.
    const s = run(cat, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }, named])
    const rich: FarmState = { ...s, coins: 900 }
    const fenced = run(cat, [{ type: 'fenced', x: 15, y: 5, pack: 'shed' }, { type: 'fenced', x: 16, y: 5, pack: 'shed' }, { type: 'fenced', x: 16, y: 4, pack: 'shed' }, { type: 'fenced', x: 17, y: 4, pack: 'shed' }, plant('saw', 16, 4), plant('plane', 12, 5)], rich)
    const whole = layOut(shot(fenced), cat)
    expect(whole.misfit).toBe(0)
    expect(whole.state.crops).toHaveLength(2)
    const alone = layOut(shot(fenced, ['shed']), cat)
    expect(alone.state.crops.map((c) => c.seed)).toEqual(['plane'])
    expect(alone.misfit).toBe(1)
    expect(alone.state.cleared).toEqual({ '8,5': 'shed' })
  })
})

describe('a farm on the real packs', () => {
  const catalog = buildCatalog(collectPacks())
  const s = fold(played.events, catalog)

  it('survives the round trip whole: every field, every fenced tile, every crop where it stands', () => {
    const p = makePicture({ ...s, name: 'Played' }, { code: farmCode(played.events[0]?.id ?? ''), at: AT, game: '0.2.0', show: Object.keys(s.fields) })
    const r = readPicture(JSON.parse(JSON.stringify(p)), catalog, NOW)
    expect(r).toEqual({ picture: p, newer: 0, misfit: 0 })
    const laid = layOut(p, catalog)
    expect(laid.misfit).toBe(0)
    expect(laid.state.fields).toEqual(s.fields)
    expect(laid.state.cleared).toEqual(Object.fromEntries(Object.entries(s.cleared).filter(([, pack]) => pack !== 'grass')))
    const where = (crops: Crop[]) => crops.map((c) => [c.seed, c.x, c.y, c.best, c.perennial]).sort()
    expect(where(laid.state.crops)).toEqual(where(s.crops))
    // A link of a forty-day farm stays well inside what a chat app will carry.
    expect(JSON.stringify(p).length).toBeLessThan(4000)
  })

  it('shows any choice of fields without losing a crop that stands on its field\'s first nine tiles', () => {
    fc.assert(fc.property(fc.subarray(Object.keys(s.fields), { minLength: 1 }), (show) => {
      const laid = layOut(makePicture({ ...s, name: 'Played' }, { code: CODE, at: AT, game: '0.2.0', show }), catalog)
      const shown = s.crops.filter((c) => show.includes(catalog.seed(c.seed)?.pack ?? ''))
      expect(laid.state.crops.length + laid.misfit).toBe(shown.length)
      expect(Object.keys(laid.state.fields).sort()).toEqual([...show].sort())
    }))
  })
})
