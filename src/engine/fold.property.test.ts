// Random play against the rules. Each random "intent" is turned into a concrete event using what the farm offers at that
// moment (candidates picked by index modulo their number), applied, and checked against the rules that must always hold.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog, type Catalog } from './catalog'
import { findCandidates, pickFind } from './finds'
import { allowed, apply, check, fieldsToOpen, fold, initialState } from './fold'
import { EXPLANATION, NOTES, bountifulCatalog, earningCatalog, harvestEvent, layeredCatalog, marketCatalog, smallCatalog, started, waterEvent } from './fixtures'
import { explainChecklist, explainPasses, harvestWork, waterWork, writePasses } from './ladder'
import { FIELD_SIZE, fieldOf, fieldOrigin, terrain, tileKey, wildKind, worldSize } from './land'
import { notBuying } from './market'
import { heldBy, isEarned } from './readiness'
import { RULES, available, cropOf, ripe, revivable, thirsty, visible } from './rules'
import type { FarmEvent, FarmState, LoggedEvent } from './types'
import { WALK_QUESTIONS, isWalkDay, walkedToday } from './walk'

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
  | { k: 'bar'; a: number; b: number }
  | { k: 'name'; len: number }
  | { k: 'sell'; a: number; len: number }
  | { k: 'walk'; len: number; blank: boolean }
  | { k: 'raw'; event: unknown }

const idx = fc.nat({ max: 1000 })
/** Mostly right answers, so crops get to grow up. */
const usuallyOk = fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) })
/** Mostly enough writing, sometimes too little, so refusals get exercised too. */
const writing = fc.oneof({ weight: 6, arbitrary: fc.integer({ min: 90, max: 200 }) }, { weight: 1, arbitrary: fc.nat({ max: 120 }) })
const rawEvents = fc.oneof(
  fc.anything(),
  fc.record({ type: fc.constantFrom('planted', 'watered', 'harvested', 'fenced', 'foraged', 'domesticated', 'unlocked', 'focus-set', 'bar-set', 'field-opened', 'farm-started', 'farm-named', 'sold', 'walked'), buyer: fc.string(), text: fc.string(), asked: fc.array(fc.string(), { maxLength: 8 }), answers: fc.array(fc.string(), { maxLength: 8 }), bar: fc.oneof(fc.integer({ min: -5, max: 110 }), fc.double()), name: fc.string({ maxLength: 40 }), seed: fc.string(), pack: fc.string(), find: fc.string(), x: fc.integer({ min: -3, max: 30 }), y: fc.integer({ min: -3, max: 30 }), slot: fc.integer({ min: -2, max: 12 }), ok: fc.boolean(), branch: fc.option(fc.string()) }),
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
  { weight: 1, arbitrary: fc.record({ k: fc.constant('bar' as const), a: idx, b: idx }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('name' as const), len: fc.nat({ max: 30 }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('sell' as const), a: idx, len: fc.nat({ max: 40 }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('walk' as const), len: fc.nat({ max: 40 }), blank: fc.boolean() }) },
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
      // Mostly what the forest offers; now and then any find at all, so a find from a pack with no field gets tried.
      const any = catalog.packs.flatMap((p) => catalog.findsOf(p.pack))
      const find = tile && (intent.b % 4 === 0 ? pick(any, intent.a) : pickFind(findCandidates(s, catalog), tile.x, tile.y, s.day + intent.b))
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
    case 'name':
      return { type: 'farm-named', name: ' ' + 'n'.repeat(intent.len) + ' ' }
    case 'sell': {
      // Any buyer in the catalogue, buying or not, and now and then one nobody has heard of.
      const buyer = intent.a % 7 === 0 ? 'a-stranger' : pick(catalog.buyers, intent.a)?.id
      return buyer === undefined ? null : { type: 'sold', buyer, text: 's'.repeat(intent.len) }
    }
    case 'walk':
      // On any day, walk day or not; sometimes with nothing written.
      return { type: 'walked', asked: [...WALK_QUESTIONS], answers: [intent.blank ? '' : 'w'.repeat(intent.len), ' ', ''] }
    case 'bar': {
      // Any field the farm has, perennial ones too, and now and then a bar no farmer may set.
      const pack = pick(packs, intent.a)
      return pack ? { type: 'bar-set', pack, bar: intent.b % 104 } : null
    }
    case 'focus': {
      const pack = catalog.pack(pick(packs, intent.a) ?? '')
      const branches = pack ? [null, ...pack.branches.map((b) => b.id)] : []
      return pack ? { type: 'focus-set', pack: pack.pack, branch: pick(branches, intent.b) ?? null } : null
    }
  }
}

/**
 * True for what only a player today is refused: planting a seed that is not earned yet or is held back by a hollow
 * layer, a bar for a field with no end, a sale to a buyer who is not buying, and a walk on the wrong day or a second one.
 */
function onlyToday(s: FarmState, event: unknown, catalog: Catalog): boolean {
  const e = event as { type?: unknown; seed?: unknown; pack?: unknown; buyer?: unknown } | null
  if (e && e.type === 'bar-set' && typeof e.pack === 'string') return catalog.pack(e.pack)?.perennial === true
  if (e && e.type === 'sold' && typeof e.buyer === 'string') { const b = catalog.buyer(e.buyer); return !b || notBuying(b, s, catalog) !== null }
  if (e && e.type === 'walked') return !isWalkDay(s.day) || walkedToday(s)
  const seed = e && e.type === 'planted' && typeof e.seed === 'string' ? catalog.seed(e.seed) : undefined
  return seed !== undefined && (!isEarned(seed, s, catalog) || heldBy(seed, s, catalog) !== null)
}

const logged = (events: FarmEvent[]): LoggedEvent[] => events.map((e, i) => ({ ...e, id: 'e' + i, at: '2026-01-01T00:00:00Z' }))

/**
 * Play the intents, checking the rules after every step. Returns the events that were accepted.
 * `mask` chooses which packs the farm has a field for (always at least one), the way a farmer chooses.
 */
function play(catalog: Catalog, list: Intent[], mask: boolean[] = [true]): { state: FarmState; accepted: FarmEvent[]; all: unknown[] } {
  const start: FarmEvent[] = [started]
  let s = apply(initialState(), started, catalog)
  const chosen = catalog.packs.filter((_, i) => mask[i % mask.length]).map((p) => p.pack)
  const only = chosen.length ? chosen : catalog.packs.slice(0, 1).map((p) => p.pack)
  for (const e of fieldsToOpen(s, catalog, only)) {
    start.push(e)
    s = apply(s, e, catalog)
  }
  const accepted = start.slice()
  const all: unknown[] = start.slice()
  for (const [step, intent] of list.entries()) {
    const event = toEvent(s, catalog, intent)
    if (event === null) continue
    const before = s
    const frozen = JSON.stringify(before)
    const why = check(before, event, catalog)
    const fits = allowed(before, event, catalog)
    const after = apply(before, event, catalog)
    // Nothing touches the old state. Replay follows what a log may hold, and that alone.
    expect(JSON.stringify(before)).toBe(frozen)
    expect(after === before).toBe(fits !== null)
    // 12. The game asks all of that of a player and a few things more: a seed is earned before it is planted, it does
    // not run two layers ahead of a hollow one, a bar is for a field with an end, a sale is to a buyer who is buying,
    // and a walk is taken on a walk day, once.
    if (fits !== null) expect(why).not.toBeNull()
    if (why !== null) {
      if (fits === null) expect(onlyToday(before, event, catalog)).toBe(true)
      // What the game refused a player is not in their log, even where a log could have held it.
      else all.push(event)
      continue
    }
    expect(onlyToday(before, event, catalog)).toBe(false)
    all.push(event)
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
  // 9. a name is the one that was sent, trimmed, and never longer than a name may be
  expect(s.name).toBe(s.name.trim())
  expect(s.name.length).toBeLessThanOrEqual(RULES.farmName.max)
  if (e.type === 'farm-named') expect(s.name).toBe(e.name.trim())
  else expect(s.name).toBe(before.name)
  // 11. a bar is only ever set by its own event, on an open field that has an end (a player is never let set another), to a number a farmer may set
  if (e.type === 'bar-set') expect(s.bars).toEqual({ ...before.bars, [e.pack]: e.bar })
  else expect(s.bars).toEqual(before.bars)
  for (const [pack, bar] of Object.entries(s.bars)) {
    expect(Object.hasOwn(s.fields, pack) && catalog.pack(pack)?.perennial !== true).toBe(true)
    expect(Number.isInteger(bar) && bar >= RULES.readiness.min && bar <= RULES.readiness.max).toBe(true)
  }
  // 10. nothing is planted, found, domesticated or jumped to in a pack the farm has no field for
  if (e.type === 'planted' || e.type === 'unlocked' || e.type === 'domesticated') expect(Object.hasOwn(s.fields, catalog.seed(e.seed)?.pack ?? '')).toBe(true)
  if (e.type === 'foraged') expect(Object.hasOwn(s.fields, catalog.find(e.find)?.pack ?? '')).toBe(true)
  // 3. stage in 0..4; a perennial is at the top
  for (const c of s.crops) {
    expect(Number.isInteger(c.stage) && c.stage >= 0 && c.stage <= RULES.maxStage).toBe(true)
    if (c.perennial) expect(c.stage).toBe(RULES.maxStage)
    // the furthest it has grown is never behind where it stands, and never falls
    expect(c.best).toBeGreaterThanOrEqual(c.stage)
    expect(c.best).toBeLessThanOrEqual(RULES.maxStage)
    expect(c.best).toBeGreaterThanOrEqual(cropOf(before, c.seed)?.best ?? 0)
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
  // 16. a sale and a walk are records and nothing else: only their own events add one, and they move no coins or energy.
  // A player's sale is to a buyer who was buying, and a player walks on walk days, once each.
  expect(s.sales.length - before.sales.length).toBe(e.type === 'sold' ? 1 : 0)
  expect(s.walks.length - before.walks.length).toBe(e.type === 'walked' ? 1 : 0)
  if (e.type === 'sold' || e.type === 'walked') expect({ ...s, sales: [], walks: [] }).toEqual({ ...before, sales: [], walks: [] })
  if (e.type === 'sold') { const b = catalog.buyer(e.buyer); expect(b && notBuying(b, before, catalog)).toBeNull() }
  for (const x of s.sales) expect(x.text.length).toBeGreaterThanOrEqual(RULES.proofMin)
  expect(s.walks.every((w) => isWalkDay(w.day) && w.answers.some((a) => a.length > 0))).toBe(true)
  expect(new Set(s.walks.map((w) => w.day)).size).toBe(s.walks.length)
  // 15. a sapling is in the ground only on a farm where the tree it drops from is rooted
  for (const c of s.crops) {
    const parent = catalog.seed(c.seed)?.saplingOf
    if (parent) expect(cropOf(s, parent)?.perennial, c.seed + ' is a sapling of ' + parent).toBe(true)
  }
  // 13. layer balance never leaves a field stuck: if anything in it could be planted but for the balance, something can be
  for (const pack of Object.keys(s.fields)) {
    const could = catalog.seedsOf(pack).filter((x) => visible(x, s) && available(x, s) && isEarned(x, s, catalog) && !cropOf(s, x.id))
    if (could.length > 0) expect(could.some((x) => heldBy(x, s, catalog) === null), pack).toBe(true)
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
        fc.property(fc.array(intents, { minLength: 80, maxLength: 300 }), fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (list, mask) => {
          const { state, accepted, all } = play(catalog, list, mask)
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
          // With no farm begun, nothing takes hold: not even a name.
          const bare = fold(events, catalog)
          if (bare.day < 1) expect(bare).toEqual(initialState())
        }),
        { numRuns: runs },
      )
    })
  })
}

properties('the small test farm', smallCatalog, 150)
properties('a farm whose seeds have to be earned', earningCatalog, 150)
properties('a farm with layers to balance', layeredCatalog, 150)
properties('a farm with guilds and an edge that pay, and saplings', bountifulCatalog, 150)
properties('a farm with a market', marketCatalog, 150)
properties('the real packs', buildCatalog(collectPacks()), 60)

describe('what guilds, edges and saplings add', () => {
  /** The same packs as they were before any of the three: no guilds, no seed on an edge, and no saplings. */
  const before = (catalog: Catalog): Catalog =>
    buildCatalog(catalog.packs.map((p) => ({ ...p, guilds: [], seeds: p.seeds.filter((s) => s.sapling_of === undefined).map(({ edge: _edge, ...seed }) => seed) })))
  const coinless = (s: FarmState): FarmState => ({ ...s, coins: 0 })

  // 14. What a guild and an edge pay only ever adds, and a sapling is a new seed nobody has planted. A farm played
  // before any of them replays event for event, and differs only in having at least the coins it had. So no saved
  // farm can lose by them.
  it.each<[string, Catalog, number]>([
    ['the farm with guilds, an edge and saplings', bountifulCatalog, 150],
    ['the real packs', buildCatalog(collectPacks()), 40],
  ])('only ever adds on %s: a farm played without it replays whole, with at least the coins it had', (_name, catalog, runs) => {
    const old = before(catalog)
    let paid = 0
    fc.assert(
      fc.property(fc.array(intents, { minLength: 80, maxLength: 300 }), fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (list, mask) => {
        let was = initialState()
        let now = initialState()
        for (const e of play(old, list, mask).accepted) {
          const next = apply(now, e, catalog)
          expect(next).not.toBe(now)
          was = apply(was, e, old)
          now = next
          expect(coinless(now)).toEqual(coinless(was))
          expect(now.coins).toBeGreaterThanOrEqual(was.coins)
        }
        paid += now.coins - was.coins
      }),
      { numRuns: runs },
    )
    // On the small farm the play reaches a whole guild or a live edge often enough for this to have been a test of
    // something. On the real packs random play almost never roots a whole guild, so that run shows only that guilds
    // nobody completed and saplings nobody was dropped change nothing. The pay itself is shown safe on the real packs
    // by the yield farm in played-farm.test.ts, which earns it and spends every coin.
    if (catalog === bountifulCatalog) expect(paid).toBeGreaterThan(0)
  })
})

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
      // Only what the game would let a player do today.
      for (const e of doing) if (check(s, e, catalog) === null) s = apply(s, e, catalog)
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
