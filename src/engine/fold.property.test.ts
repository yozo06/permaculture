// Random play against the rules. Each random "intent" is turned into a concrete event using what the farm offers at that
// moment (candidates picked by index modulo their number), applied, and checked against the rules that must always hold.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog, type Catalog } from './catalog'
import { findCandidates, pickFind } from './finds'
import { apply, check, fieldsToOpen, fold, initialState } from './fold'
import { EXPLANATION, NOTES, harvestEvent, smallCatalog, started, waterEvent } from './fixtures'
import { explainChecklist, explainPasses, harvestWork, waterWork, writePasses } from './ladder'
import { FIELD_SIZE, fieldOf, fieldOrigin, terrain, tileKey, wildKind, worldSize } from './land'
import { RULES, available, cropOf, ripe, revivable, thirsty, visible } from './rules'
import type { FarmEvent, FarmState, LoggedEvent } from './types'

type Intent =
  | { k: 'plant'; a: number; b: number; len: number }
  | { k: 'water'; a: number; ok: boolean; len: number; tick: number; flip: boolean }
  | { k: 'harvest'; a: number; ok: boolean; len: number; tick: number }
  | { k: 'sleep' }
  | { k: 'fence'; a: number; b: number }
  | { k: 'forage'; a: number; b: number }
  | { k: 'domesticate'; a: number }
  | { k: 'unlock'; a: number; ok: boolean }
  | { k: 'focus'; a: number; b: number }
  | { k: 'raw'; event: unknown }

const idx = fc.nat({ max: 1000 })
/** Mostly right answers, so crops get to grow up. */
const usuallyOk = fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) })
/** Mostly enough writing, sometimes too little, so refusals get exercised too. */
const writing = fc.oneof({ weight: 6, arbitrary: fc.integer({ min: 90, max: 200 }) }, { weight: 1, arbitrary: fc.nat({ max: 120 }) })
const rawEvents = fc.oneof(
  fc.anything(),
  fc.record({ type: fc.constantFrom('planted', 'watered', 'harvested', 'fenced', 'foraged', 'domesticated', 'unlocked', 'focus-set', 'field-opened', 'farm-started'), seed: fc.string(), pack: fc.string(), find: fc.string(), x: fc.integer({ min: -3, max: 30 }), y: fc.integer({ min: -3, max: 30 }), slot: fc.integer({ min: -2, max: 12 }), ok: fc.boolean(), branch: fc.option(fc.string()) }),
)
const intents: fc.Arbitrary<Intent> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ k: fc.constant('plant' as const), a: idx, b: idx, len: writing }) },
  { weight: 9, arbitrary: fc.record({ k: fc.constant('water' as const), a: idx, ok: usuallyOk, len: writing, tick: idx, flip: fc.boolean() }) },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('harvest' as const), a: idx, ok: usuallyOk, len: writing, tick: idx }) },
  { weight: 5, arbitrary: fc.constant({ k: 'sleep' as const }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('fence' as const), a: idx, b: idx }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('forage' as const), a: idx, b: idx }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('domesticate' as const), a: idx }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('unlock' as const), a: idx, ok: usuallyOk }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('focus' as const), a: idx, b: idx }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('raw' as const), event: rawEvents }) },
)

const pick = <T>(items: readonly T[], i: number): T | undefined => (items.length ? items[i % items.length] : undefined)

/** Every tile of a pack's field: its base 3x3 and the tiles fenced in for it. */
function fieldTiles(s: FarmState, pack: string): { x: number; y: number }[] {
  const slot = s.fields[pack]
  if (slot === undefined) return []
  const { x0, y0 } = fieldOrigin(slot)
  const tiles: { x: number; y: number }[] = []
  for (let dy = 0; dy < FIELD_SIZE; dy++) for (let dx = 0; dx < FIELD_SIZE; dx++) tiles.push({ x: x0 + dx, y: y0 + dy })
  for (const [k, p] of Object.entries(s.cleared)) {
    const [x, y] = k.split(',').map(Number)
    if (p === pack && x !== undefined && y !== undefined) tiles.push({ x, y })
  }
  return tiles
}

function worldTiles(s: FarmState, want: (x: number, y: number) => boolean): { x: number; y: number }[] {
  const n = worldSize(s.fields)
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (want(x, y)) out.push({ x, y })
  return out
}

/** The concrete event for an intent in this state, or null if the farm offers nothing for it. */
function toEvent(s: FarmState, catalog: Catalog, intent: Intent): unknown {
  const seeds = catalog.packs.flatMap((p) => catalog.seedsOf(p.pack))
  const packs = Object.keys(s.fields)
  switch (intent.k) {
    case 'raw':
      return intent.event
    case 'sleep':
      return { type: 'slept' }
    case 'plant': {
      const seed = pick(seeds.filter((x) => Object.hasOwn(s.fields, x.pack) && available(x, s) && !cropOf(s, x.id)), intent.a)
      const tile = seed && pick(fieldTiles(s, seed.pack).filter((t) => !s.crops.some((c) => c.x === t.x && c.y === t.y)), intent.b)
      return seed && tile ? { type: 'planted', seed: seed.id, x: tile.x, y: tile.y, notes: 'n'.repeat(intent.len) } : null
    }
    case 'water': {
      const crop = pick(s.crops.filter((c) => thirsty(c, s.day) || revivable(c, s.day)), intent.a)
      const seed = crop && catalog.seed(crop.seed)
      if (!crop || !seed) return null
      // The log records the work as it happened, so now and then the player does the other kind.
      const recall = (waterWork(crop, seed) === 'recall') !== intent.flip
      if (recall) return { type: 'watered', seed: crop.seed, ok: intent.ok, work: 'recall' }
      const of = explainChecklist(seed).length
      const ticked = intent.tick % (of + 1)
      return { type: 'watered', seed: crop.seed, ok: explainPasses(ticked, of), work: 'explain', text: 'w'.repeat(intent.len), ticked, of }
    }
    case 'harvest': {
      const crop = pick(s.crops.filter((c) => ripe(c, s.day) || c.perennial), intent.a)
      const seed = crop && catalog.seed(crop.seed)
      if (!crop || !seed) return null
      const work = harvestWork(seed)
      if (work.kind === 'recall') return { type: 'harvested', seed: crop.seed, ok: intent.ok }
      const of = work.checklist.length
      const ticked = intent.tick % (of + 1)
      return { type: 'harvested', seed: crop.seed, ok: writePasses(ticked, of), text: 'h'.repeat(intent.len), ticked, of }
    }
    case 'fence': {
      const pack = pick(packs, intent.a)
      const n = worldSize(s.fields)
      const around = pack === undefined ? [] : fieldTiles(s, pack).flatMap(({ x, y }) => [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }])
      const tile = pick(around.filter((t) => t.x >= 0 && t.y >= 0 && t.x < n && t.y < n && terrain(t.x, t.y, s.fields, s.cleared) !== 'soil'), intent.b)
      return pack && tile ? { type: 'fenced', x: tile.x, y: tile.y, pack } : null
    }
    case 'forage': {
      const tile = pick(worldTiles(s, (x, y) => terrain(x, y, s.fields, s.cleared) === 'wild' && ['tree', 'bush'].includes(wildKind(x, y))), intent.a)
      const find = tile && pickFind(findCandidates(s, catalog), tile.x, tile.y, s.day + intent.b)
      return tile && find ? { type: 'foraged', x: tile.x, y: tile.y, find: find.id } : null
    }
    case 'domesticate': {
      const found = s.foraged.flatMap((id) => catalog.find(id)?.seed ?? [])
      const seed = pick(found.length ? found : seeds.filter((x) => x.wild).map((x) => x.id), intent.a)
      return seed ? { type: 'domesticated', seed } : null
    }
    case 'unlock': {
      const seed = pick(seeds.filter((x) => visible(x, s) && !available(x, s) && !cropOf(s, x.id)), intent.a)
      return seed ? { type: 'unlocked', seed: seed.id, ok: intent.ok } : null
    }
    case 'focus': {
      const pack = catalog.pack(pick(packs, intent.a) ?? '')
      const branches = pack ? [null, ...pack.branches.map((b) => b.id)] : []
      return pack ? { type: 'focus-set', pack: pack.pack, branch: pick(branches, intent.b) ?? null } : null
    }
  }
}

const logged = (events: FarmEvent[]): LoggedEvent[] => events.map((e, i) => ({ ...e, id: 'e' + i, at: '2026-01-01T00:00:00Z' }))

/** Play the intents, checking the rules after every step. Returns the events that were accepted. */
function play(catalog: Catalog, list: Intent[]): { state: FarmState; accepted: FarmEvent[]; all: unknown[] } {
  const start: FarmEvent[] = [started]
  let s = apply(initialState(), started, catalog)
  for (const e of fieldsToOpen(s, catalog)) {
    start.push(e)
    s = apply(s, e, catalog)
  }
  const accepted = start.slice()
  const all: unknown[] = start.slice()
  for (const [step, intent] of list.entries()) {
    const event = toEvent(s, catalog, intent)
    if (event === null) continue
    all.push(event)
    const before = s
    const frozen = JSON.stringify(before)
    const why = check(before, event, catalog)
    const after = apply(before, event, catalog)
    // A refused event changes nothing; an accepted one never touches the old state.
    expect(JSON.stringify(before)).toBe(frozen)
    if (why !== null) {
      expect(after).toBe(before)
      continue
    }
    expect(after).not.toBe(before)
    accepted.push(event as FarmEvent)
    s = after
    verify(s, before, event as FarmEvent, catalog)
    // Replaying from scratch gives the same farm. Checked now and then, and always at the end.
    if (step % 25 === 0) expect(fold(accepted, catalog)).toEqual(s)
  }
  return { state: s, accepted, all }
}

/** The rules that must hold after every accepted event. */
function verify(s: FarmState, before: FarmState, e: FarmEvent, catalog: Catalog): void {
  // 2. energy, coins and barrel stay in range
  expect(s.energyMax).toBe(RULES.energyMax)
  expect(s.energy).toBeGreaterThanOrEqual(0)
  expect(s.energy).toBeLessThanOrEqual(s.energyMax)
  expect(s.coins).toBeGreaterThanOrEqual(0)
  expect(s.barrel).toBeGreaterThanOrEqual(0)
  expect(s.barrel).toBeLessThanOrEqual(RULES.barrel.max)
  // 3. stage in 0..4; a perennial is at the top
  for (const c of s.crops) {
    expect(Number.isInteger(c.stage) && c.stage >= 0 && c.stage <= RULES.maxStage).toBe(true)
    if (c.perennial) expect(c.stage).toBe(RULES.maxStage)
  }
  // 4. never thirsty right after watering
  if (e.type === 'watered') {
    const c = cropOf(s, e.seed)
    expect(c && thirsty(c, s.day)).toBe(false)
  }
  // 5. no overnight wilting while the barrel has a day
  if (e.type === 'slept' && s.night && s.night.wilted.length > 0) expect(s.barrel).toBe(0)
  if (e.type === 'slept') expect(s.day).toBe(before.day + 1)
  // 8. notes are kept as planted, the journal only grows, and only by the writing the event carried
  const writing = (e.type === 'watered' && e.work === 'explain') || (e.type === 'harvested' && e.text !== undefined) ? 1 : 0
  const entries = (farm: FarmState): number => farm.crops.reduce((n, c) => n + c.journal.length, 0)
  expect(entries(s) - entries(before)).toBe(writing)
  for (const c of s.crops) {
    const was = cropOf(before, c.seed)
    if (was) {
      expect(c.notes).toBe(was.notes)
      expect(c.journal.slice(0, was.journal.length)).toEqual(was.journal)
    } else {
      expect(c.notes.length).toBeGreaterThanOrEqual(RULES.notesMin)
    }
    for (const j of c.journal) {
      expect(j.day).toBeLessThanOrEqual(s.day)
      expect(j.text.length).toBeGreaterThanOrEqual(j.kind === 'explain' ? RULES.explainMin : RULES.proofMin)
    }
  }
  // 6. a perennial can never be harvested
  for (const c of s.crops.filter((x) => x.perennial)) {
    for (const ok of [true, false]) {
      const harvest: FarmEvent = { type: 'harvested', seed: c.seed, ok }
      expect(check(s, harvest, catalog)).not.toBeNull()
      expect(apply(s, harvest, catalog)).toBe(s)
    }
  }
  // 7. two plantings a day, caps hold, crops sit on their own field, one per tile and per seed
  expect(s.today.planted).toBeLessThanOrEqual(RULES.newSeedsPerDay)
  for (const [pack, spent] of Object.entries(s.today.spent)) expect(spent).toBeLessThanOrEqual(catalog.capOf(pack, s.energyMax))
  expect(new Set(s.crops.map((c) => tileKey(c.x, c.y))).size).toBe(s.crops.length)
  expect(new Set(s.crops.map((c) => c.seed)).size).toBe(s.crops.length)
  for (const c of s.crops) expect(fieldOf(c.x, c.y, s.fields, s.cleared)).toBe(catalog.seed(c.seed)?.pack)
  expect(new Set(Object.values(s.fields)).size).toBe(Object.keys(s.fields).length)
}

function properties(name: string, catalog: Catalog, runs: number): void {
  describe(name, () => {
    it('keeps the rules after every event, and replays to the same farm', () => {
      fc.assert(
        fc.property(fc.array(intents, { minLength: 80, maxLength: 300 }), (list) => {
          const { state, accepted, all } = play(catalog, list)
          // 1. replay is deterministic, from the events or from their JSON, with refused events left in or out
          expect(fold(accepted, catalog)).toEqual(state)
          expect(fold(accepted, catalog)).toEqual(state)
          expect(fold(JSON.parse(JSON.stringify(logged(accepted))), catalog)).toEqual(state)
          expect(fold(all, catalog)).toEqual(state)
        }),
        { numRuns: runs },
      )
    })

    it('never throws on events of any shape', () => {
      fc.assert(
        fc.property(fc.array(rawEvents, { maxLength: 30 }), (events) => {
          const s = fold([started, ...events], catalog)
          expect(s.energy).toBeGreaterThanOrEqual(0)
        }),
        { numRuns: runs },
      )
    })
  })
}

properties('the small test farm', smallCatalog, 150)
properties('the real packs', buildCatalog(collectPacks()), 60)

describe('a diligent player', () => {
  /** Plants what is plantable, waters everything thirsty, harvests what is ripe, sleeps. Always answers right. */
  function diligentDays(catalog: Catalog, days: number): FarmState {
    let s = apply(initialState(), started, catalog)
    for (const e of fieldsToOpen(s, catalog)) s = apply(s, e, catalog)
    for (let day = 0; day < days; day++) {
      const doing: unknown[] = []
      for (const c of s.crops) doing.push(harvestEvent(catalog, c.seed), waterEvent(catalog, s, c.seed))
      for (const seed of catalog.packs.flatMap((p) => catalog.seedsOf(p.pack))) {
        const tile = fieldTiles(s, seed.pack).find((t) => !s.crops.some((c) => c.x === t.x && c.y === t.y))
        if (tile) doing.push({ type: 'planted', seed: seed.id, x: tile.x, y: tile.y, notes: NOTES })
      }
      for (const e of doing) s = apply(s, e, catalog)
      s = apply(s, { type: 'slept' }, catalog)
    }
    return s
  }

  it('roots crops, never wilts any and unlocks what needed them', () => {
    const s = diligentDays(smallCatalog, 40)
    expect(s.crops.filter((c) => c.perennial).length).toBeGreaterThan(2)
    expect(s.crops.some((c) => c.wilted)).toBe(false)
    expect(s.crops.some((c) => c.seed === 'squash')).toBe(true)
  })

  it('does the same on the real packs', () => {
    const catalog = buildCatalog(collectPacks())
    const s = diligentDays(catalog, 40)
    expect(s.crops.filter((c) => c.perennial).length).toBeGreaterThan(2)
    expect(s.compost).toEqual([])
  })
})
