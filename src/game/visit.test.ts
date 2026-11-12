import { describe, expect, it } from 'vitest'
import { NOTES, earningCatalog, run, smallCatalog as cat, started } from '../engine/fixtures'
import { layOut, readPicture } from '../engine/picture'
import type { Crop, FarmEvent, FarmState } from '../engine/types'
import { readLink } from './links'
import { emptyBook, receive } from './neighbours'
import { arrivalText, neighbourCropView, neighbourRows, shareView } from './visit'

const NOW = Date.parse('2026-11-20T15:00:00Z')
const OPTS = { code: '0k7f3q9xw2m4a', at: '2026-11-20T14:05:09Z', game: '0.2.0' }
const plant = (seed: string, x: number, y: number): FarmEvent => ({ type: 'planted', seed, x, y, notes: NOTES })
const base: FarmEvent[] = [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }, { type: 'farm-named', name: 'Asha' }]
const farm = (): FarmState => run(cat, [...base, plant('corn', 5, 5), plant('saw', 12, 5)])

describe('shareView', () => {
  it('makes the link and says what is in it', () => {
    const v = shareView(farm(), ['garden', 'shed'], OPTS, cat, NOW)
    expect(v).toMatchObject({ fields: 2, crops: 2, trees: 0, lostCrops: 0, lostLand: 0 })
    const link = readLink('https://example.org/permaculture/#' + (v?.hash ?? ''))
    expect(link && 'payload' in link && readPicture(link.payload, cat, NOW)?.picture).toEqual(v?.picture)
  })

  it('counts trees apart from crops still growing', () => {
    const s = farm()
    const rooted: FarmState = { ...s, crops: s.crops.map((c) => (c.seed === 'corn' ? { ...c, stage: 4, best: 4, perennial: true } : c)) }
    expect(shareView(rooted, ['garden', 'shed'], OPTS, cat, NOW)).toMatchObject({ crops: 1, trees: 1 })
  })

  it('counts exactly what the neighbour\'s game will drop when hidden fields make the others close ranks', () => {
    const rich: FarmState = { ...run(cat, base), coins: 900 }
    const fenced = run(cat, [{ type: 'fenced', x: 15, y: 5, pack: 'shed' }, { type: 'fenced', x: 16, y: 5, pack: 'shed' }, { type: 'fenced', x: 16, y: 4, pack: 'shed' }, plant('saw', 16, 4), plant('plane', 12, 5)], rich)
    expect(shareView(fenced, ['garden', 'shed'], OPTS, cat, NOW)).toMatchObject({ lostCrops: 0, lostLand: 0 })
    const alone = shareView(fenced, ['shed'], OPTS, cat, NOW)
    expect(alone).toMatchObject({ fields: 1, lostCrops: 1, lostLand: 2 })
    // The count on the Share sheet is the reader's own count, not an estimate of it.
    const laid = layOut(alone?.picture ?? { ...OPTS, name: '', day: 1, fields: [] }, cat)
    expect(laid.misfit).toBe(1)
    expect(laid.state.crops.map((c) => c.seed)).toEqual(['plane'])
  })

  it('has nothing to send for a farm with no name, or with no field ticked', () => {
    expect(shareView(run(cat, base.slice(0, 3)), ['garden'], OPTS, cat, NOW)).toBeNull()
    expect(shareView(farm(), [], OPTS, cat, NOW)).toBeNull()
  })
})

describe('neighbourCropView', () => {
  const theirs = (seed: string, patch: Partial<Crop> = {}): Crop => ({ seed, x: 5, y: 5, stage: 2, best: 2, due: 9, wilted: false, perennial: false, notes: '', journal: [], ...patch })
  const mine = (): FarmState => run(cat, base)

  it('says what the crop is and how far it has grown', () => {
    expect(neighbourCropView(theirs('corn'), mine(), cat)).toMatchObject({ name: 'Corn', pack: 'garden', packTitle: 'Garden', layer: 'Canopy', stageLine: 'Grown to stage 3 of 5' })
    expect(neighbourCropView(theirs('corn', { stage: 4, best: 4, perennial: true }), mine(), cat)?.stageLine).toBe('A rooted tree')
    expect(neighbourCropView(theirs('no-such-seed'), mine(), cat)).toBeNull()
  })

  it('says how the same seed stands on your own farm', () => {
    const yours = (seed: string, s: FarmState): string => neighbourCropView(theirs(seed), s, cat)?.yours ?? ''
    expect(yours('corn', mine())).toMatch(/In your seed bag/)
    expect(yours('squash', mine())).toBe('Locked for you: it needs Corn + Beans.')
    expect(yours('bees', mine())).toMatch(/wild seed/)
    const growing = run(cat, [plant('corn', 5, 5)], mine())
    expect(yours('corn', growing)).toBe('You grow this too.')
    const rooted: FarmState = { ...growing, crops: growing.crops.map((c) => ({ ...c, stage: 4, best: 4, perennial: true })) }
    expect(yours('corn', rooted)).toBe('You have rooted this too.')
    const shedOnly = run(cat, [started, { type: 'field-opened', pack: 'shed', slot: 0 }])
    expect(yours('corn', shedOnly)).toMatch(/You do not have the Garden field/)
    expect(yours('corn', run(cat, [started]))).toBe('Start a farm of your own and you can grow this too.')
  })

  it('does not call a seed ready to plant while it has still to be earned', () => {
    const c = earningCatalog
    const yours = (seed: string, s: FarmState): string => neighbourCropView(theirs(seed), s, c)?.yours ?? ''
    const mineNow = run(c, base)
    expect(yours('kiln', mineNow)).toBe('Locked for you: you have not earned it yet. It takes a seed rooted in another field.')
    expect(yours('anvil', mineNow)).toBe('Locked for you: it needs Saw.')
    const withTree: FarmState = { ...mineNow, crops: [theirs('corn', { stage: 4, best: 4, perennial: true })] }
    expect(yours('kiln', withTree)).toBe('In your seed bag, ready to plant.')
  })
})

describe('neighbourRows', () => {
  it('lists neighbours in the order they were added, with the day and the age of each picture and nothing to compare', () => {
    const pic = (n: number, at: string) => ({ code: String(n).padStart(13, '0'), name: 'Farm ' + n, day: n * 3, at, game: '', fields: [] })
    let book = emptyBook()
    book = receive(book, pic(2, '2026-11-20T10:00:00Z'), 'x', NOW).book
    book = receive(book, pic(1, '2026-11-12T10:00:00Z'), 'x', NOW).book
    const rows = neighbourRows(book, NOW)
    expect(rows).toEqual([
      { code: '0000000000002', name: 'Farm 2', day: 6, age: 'made today', stale: false },
      { code: '0000000000001', name: 'Farm 1', day: 3, age: '8 days old', stale: false },
    ])
    expect(neighbourRows(book, NOW + 70 * 24 * 60 * 60 * 1000).every((r) => r.stale)).toBe(true)
  })
})

describe('arrivalText', () => {
  it('has a plain sentence for every way a link can land', () => {
    expect(arrivalText('added', 'Asha')).toBe('Asha is now your neighbour.')
    expect(arrivalText('not-newer', 'Asha')).toBe('You already have a newer picture.')
    expect(arrivalText('too-old', 'Asha')).toBe('This picture is too old. Ask for a new link.')
    for (const r of ['updated', 'full', 'own'] as const) expect(arrivalText(r, 'Asha').length).toBeGreaterThan(10)
  })
})
