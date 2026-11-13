// The farm as an event log. `check` says whether a player may do something now, `apply` makes it happen, `fold` replays a log.
// Everything here is pure: state in, state out, nothing mutated, nothing random, no clock.
//
// Two questions are kept apart. `allowed` is what a log may hold, and replaying a farm asks only that. `check` is what
// the game asks of something done today: everything `allowed` asks, and that a seed has been earned, that it does not
// run two layers ahead of a hollow one, and that a bar is for a field with an end. A rule added to the second can never
// change how a saved farm replays, whatever a pack does later.
import { LAYER_NAMES, type Catalog } from './catalog'
import { isRecord } from './util'
import { fieldOf, fenceCost, isBuildingTile, neighbourFields, nextFreeSlot, terrain, tileKey, wildKind, worldSize } from './land'
import { earnedLine, heldBy, isEarned } from './readiness'
import { RULES, available, capLeft, cropOf, interval, revivable, ripe, thirsty, visible } from './rules'
import { fromV2 } from './v2'
import { guildCoins } from './yields'
import type { Crop, FarmEvent, FarmState } from './types'

/** A farm with nothing in it: the state before `farm-started`. */
export const initialState = (): FarmState => ({
  name: '', day: 0, energy: 0, energyMax: 0, coins: 0, barrel: 0,
  fields: {}, cleared: {}, crops: [], compost: [], unlocked: [], volunteers: [], foraged: [], focus: {}, bars: {},
  today: { planted: 0, spent: {} }, night: null,
})

/** A copy that shares nothing with the original. */
function copy(s: FarmState): FarmState {
  return {
    ...s,
    fields: { ...s.fields },
    cleared: { ...s.cleared },
    crops: s.crops.map((c) => ({ ...c, journal: c.journal.map((j) => ({ ...j })) })),
    compost: s.compost.slice(),
    unlocked: s.unlocked.slice(),
    volunteers: s.volunteers.slice(),
    foraged: s.foraged.slice(),
    focus: { ...s.focus },
    bars: { ...s.bars },
    today: { planted: s.today.planted, spent: { ...s.today.spent } },
    night: s.night ? { saved: s.night.saved.slice(), wilted: s.night.wilted.slice(), barrelFilled: s.night.barrelFilled } : null,
  }
}

/* ---------- reading an event that may be anything ---------- */

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const text = (v: unknown): v is string => typeof v === 'string'

/** The event if it has the right shape, else null. Extra keys (`id`, `at`) are dropped. */
export function parseEvent(raw: unknown): FarmEvent | null {
  if (!isRecord(raw)) return null
  const { type } = raw
  switch (type) {
    case 'farm-started': {
      const { day, energy, coins, barrel } = raw
      if (!whole(day) || !whole(energy) || !whole(coins) || !whole(barrel)) return null
      // Too much energy or barrel is clamped when applied, never refused: a farm's first event must survive a lowered maximum.
      if (day < 1 || energy < 0 || coins < 0 || barrel < 0) return null
      return { type, day, energy, coins, barrel }
    }
    case 'field-opened':
      return text(raw.pack) && whole(raw.slot) && raw.slot >= 0 && raw.slot <= 99 ? { type, pack: raw.pack, slot: raw.slot } : null
    case 'planted':
      return text(raw.seed) && whole(raw.x) && whole(raw.y) && text(raw.notes) ? { type, seed: raw.seed, x: raw.x, y: raw.y, notes: raw.notes } : null
    case 'watered': {
      if (!text(raw.seed) || typeof raw.ok !== 'boolean') return null
      if (raw.work === 'recall') return { type, seed: raw.seed, ok: raw.ok, work: 'recall' }
      if (raw.work !== 'explain' || !text(raw.text) || !whole(raw.ticked) || !whole(raw.of)) return null
      return { type, seed: raw.seed, ok: raw.ok, work: 'explain', text: raw.text, ticked: raw.ticked, of: raw.of }
    }
    case 'harvested': {
      if (!text(raw.seed) || typeof raw.ok !== 'boolean') return null
      // A write-up carries all three of text, ticked and of; a recall harvest carries none.
      if (raw.text === undefined && raw.ticked === undefined && raw.of === undefined) return { type, seed: raw.seed, ok: raw.ok }
      if (!text(raw.text) || !whole(raw.ticked) || !whole(raw.of)) return null
      return { type, seed: raw.seed, ok: raw.ok, text: raw.text, ticked: raw.ticked, of: raw.of }
    }
    case 'unlocked': {
      if (!text(raw.seed) || typeof raw.ok !== 'boolean') return null
      // A write-up jump carries all three of text, ticked and of; a recall jump carries none.
      if (raw.text === undefined && raw.ticked === undefined && raw.of === undefined) return { type, seed: raw.seed, ok: raw.ok }
      if (!text(raw.text) || !whole(raw.ticked) || !whole(raw.of)) return null
      return { type, seed: raw.seed, ok: raw.ok, text: raw.text, ticked: raw.ticked, of: raw.of }
    }
    case 'slept':
      return { type }
    case 'fenced':
      return whole(raw.x) && whole(raw.y) && text(raw.pack) ? { type, x: raw.x, y: raw.y, pack: raw.pack } : null
    case 'foraged':
      return whole(raw.x) && whole(raw.y) && text(raw.find) ? { type, x: raw.x, y: raw.y, find: raw.find } : null
    case 'domesticated':
      return text(raw.seed) ? { type, seed: raw.seed } : null
    case 'focus-set':
      return text(raw.pack) && (raw.branch === null || text(raw.branch)) ? { type, pack: raw.pack, branch: raw.branch } : null
    case 'bar-set':
      // Any number has the right shape; whether it can be a bar is a rule, so a farmer who types 62.5 is told why not.
      return text(raw.pack) && typeof raw.bar === 'number' ? { type, pack: raw.pack, bar: raw.bar } : null
    case 'farm-named':
      return text(raw.name) ? { type, name: raw.name } : null
    case 'snapshot-imported':
      return Object.hasOwn(raw, 'snapshot') ? { type, snapshot: raw.snapshot } : null
    default:
      return null
  }
}

/* ---------- rules for each event ---------- */

const inWorld = (s: FarmState, x: number, y: number): boolean => {
  const n = worldSize(s.fields)
  return x >= 0 && y >= 0 && x < n && y < n
}

/** Why a field cannot spend this much energy today, or null. */
function capWhy(s: FarmState, pack: string, cost: number, catalog: Catalog): string | null {
  if (cost <= capLeft(s, pack, catalog)) return null
  return 'The ' + (catalog.pack(pack)?.title ?? pack) + ' uses at most ' + catalog.capOf(pack, s.energyMax) + ' energy a day.'
}

/** Why a piece of writing cannot be accepted, or null. */
function whyText(written: string, min: number, what: string): string | null {
  const n = written.trim().length
  if (n < min) return 'Write at least ' + min + ' characters ' + what + '. You have ' + n + '.'
  return n > RULES.textMax ? 'Keep it under ' + RULES.textMax + ' characters.' : null
}

/** Why a self-rating is not a count of lines, or null. */
const whyRating = (ticked: number, of: number): string | null =>
  of >= 1 && ticked >= 0 && ticked <= of ? null : 'The rating does not add up.'

/** Why nothing can be done in this pack's field yet, or null if it is open. */
const whyClosed = (s: FarmState, pack: string, catalog: Catalog): string | null =>
  Object.hasOwn(s.fields, pack) ? null : 'The ' + (catalog.pack(pack)?.title ?? pack) + ' field is not open yet.'

function whyPlanted(s: FarmState, e: Extract<FarmEvent, { type: 'planted' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  if (!seed) return 'That seed is not in any pack.'
  const title = catalog.pack(seed.pack)?.title ?? seed.pack
  const closed = whyClosed(s, seed.pack, catalog)
  if (closed) return closed
  if (!available(seed, s)) return seed.name + ' is still locked.'
  if (cropOf(s, seed.id)) return seed.name + ' is already planted.'
  if (fieldOf(e.x, e.y, s.fields, s.cleared) !== seed.pack) return seed.name + ' belongs in the ' + title + ' field.'
  if (s.crops.some((c) => c.x === e.x && c.y === e.y)) return 'Something is already growing there.'
  const thin = whyText(e.notes, RULES.notesMin, 'of notes in your own words to plant')
  if (thin) return thin
  if (s.energy < RULES.plant.energy || s.coins < RULES.plant.coins) {
    return 'Planting needs ' + RULES.plant.energy + ' energy and ' + RULES.plant.coins + ' coins.'
  }
  if (s.today.planted >= RULES.newSeedsPerDay) return 'You can plant ' + RULES.newSeedsPerDay + ' new seeds a day. Sleep to plant more.'
  return capWhy(s, seed.pack, RULES.plant.energy, catalog)
}

function whyWatered(s: FarmState, e: Extract<FarmEvent, { type: 'watered' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  const crop = cropOf(s, e.seed)
  if (!seed || !crop) return 'That is not planted.'
  if (!thirsty(crop, s.day) && !revivable(crop, s.day)) {
    return crop.wilted ? seed.name + ' has wilted. Revive it on day ' + crop.due + '.' : seed.name + ' is not thirsty. It is due on day ' + crop.due + '.'
  }
  if (e.work === 'explain') {
    const bad = whyText(e.text ?? '', RULES.explainMin, 'to explain it') ?? whyRating(e.ticked ?? 0, e.of ?? 0)
    if (bad) return bad
  }
  if (s.energy < RULES.water.energy) return 'Out of energy. Sleep to start a new day.'
  return capWhy(s, seed.pack, RULES.water.energy, catalog)
}

function whyHarvested(s: FarmState, e: Extract<FarmEvent, { type: 'harvested' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  const crop = cropOf(s, e.seed)
  if (!seed || !crop) return 'That is not planted.'
  if (crop.perennial) return seed.name + ' is rooted already. It only needs a check-in.'
  if (!ripe(crop, s.day)) return seed.name + ' is not ready to harvest.'
  if (e.text !== undefined) {
    const proof = seed.harvest === 'artifact'
    const bad = whyText(e.text, proof ? RULES.proofMin : RULES.writeMin, proof ? 'to say what you made' : 'in your write-up') ?? whyRating(e.ticked ?? 0, e.of ?? 0)
    if (bad) return bad
  }
  if (s.energy < RULES.harvest.energy) return 'Harvest takes ' + RULES.harvest.energy + ' energy. Sleep first.'
  return capWhy(s, seed.pack, RULES.harvest.energy, catalog)
}

function whyFenced(s: FarmState, e: Extract<FarmEvent, { type: 'fenced' }>, catalog: Catalog): string | null {
  if (!catalog.pack(e.pack) || !Object.hasOwn(s.fields, e.pack)) return 'That field is not open.'
  if (!inWorld(s, e.x, e.y)) return 'That is outside the farm.'
  const t = terrain(e.x, e.y, s.fields, s.cleared)
  if (t === 'soil' || t === 'path' || isBuildingTile(e.x, e.y)) return 'That tile cannot be fenced in.'
  if (!neighbourFields(e.x, e.y, s.fields, s.cleared).includes(e.pack)) return 'Fence in land next to the field.'
  if (s.coins < fenceCost(t)) return 'Not enough coins. Harvest something first.'
  return null
}

function whyForaged(s: FarmState, e: Extract<FarmEvent, { type: 'foraged' }>, catalog: Catalog): string | null {
  if (!inWorld(s, e.x, e.y) || terrain(e.x, e.y, s.fields, s.cleared) !== 'wild') return 'Forage in the wilderness.'
  const kind = wildKind(e.x, e.y)
  if (kind !== 'tree' && kind !== 'bush') return 'Forage in the trees.'
  const find = catalog.find(e.find)
  // A farm only finds what grows next to its own fields.
  if (!find || !Object.hasOwn(s.fields, find.pack)) return 'There is nothing to find there.'
  if (s.foraged.includes(e.find)) return 'You have found that already.'
  if (s.energy < RULES.forage.energy) return 'Out of energy. Sleep first.'
  return null
}

function whyDomesticated(s: FarmState, e: Extract<FarmEvent, { type: 'domesticated' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  if (!seed || !seed.wild) return 'Only wild seeds can be domesticated.'
  const closed = whyClosed(s, seed.pack, catalog)
  if (closed) return closed
  if (s.volunteers.includes(seed.id)) return seed.name + ' is already in your seed bag.'
  if (!s.foraged.some((id) => catalog.find(id)?.seed === seed.id)) return 'Forage a find that leads to ' + seed.name + ' first.'
  return null
}

function whyUnlocked(s: FarmState, e: Extract<FarmEvent, { type: 'unlocked' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  if (!seed || !visible(seed, s)) return 'That seed is not in your tree yet.'
  const closed = whyClosed(s, seed.pack, catalog)
  if (closed) return closed
  if (available(seed, s) || cropOf(s, seed.id)) return seed.name + ' is not locked.'
  if (e.text !== undefined) {
    const proof = seed.harvest === 'artifact'
    const bad = whyText(e.text, proof ? RULES.proofMin : RULES.writeMin, proof ? 'to say what you made' : 'in your write-up') ?? whyRating(e.ticked ?? 0, e.of ?? 0)
    if (bad) return bad
  }
  if (s.energy < RULES.testOut.energy) return 'Needs ' + RULES.testOut.energy + ' energy. Sleep first.'
  return capWhy(s, seed.pack, RULES.testOut.energy, catalog)
}

function whyFocus(s: FarmState, e: Extract<FarmEvent, { type: 'focus-set' }>, catalog: Catalog): string | null {
  const pack = catalog.pack(e.pack)
  if (!pack || !Object.hasOwn(s.fields, e.pack)) return 'That field is not open.'
  if (e.branch !== null && !pack.branches.some((b) => b.id === e.branch)) return 'That branch is not in the ' + pack.title + ' field.'
  return null
}

function whyBar(s: FarmState, e: Extract<FarmEvent, { type: 'bar-set' }>, catalog: Catalog): string | null {
  const closed = whyClosed(s, e.pack, catalog)
  if (closed) return closed
  const { min, max } = RULES.readiness
  return Number.isInteger(e.bar) && e.bar >= min && e.bar <= max ? null : 'A bar is a whole number from ' + min + ' to ' + max + '.'
}

/** Why this cannot be a farm's name, or null. Also used by the game before it asks the farm. */
export function whyName(name: string): string | null {
  const n = name.trim().length
  return n >= 1 && n <= RULES.farmName.max ? null : 'A farm name is 1 to ' + RULES.farmName.max + ' characters.'
}

function why(s: FarmState, e: FarmEvent, catalog: Catalog): string | null {
  switch (e.type) {
    case 'farm-started':
      return null
    case 'field-opened':
      if (!catalog.pack(e.pack)) return 'That field is not in any pack.'
      if (Object.hasOwn(s.fields, e.pack)) return 'That field is open already.'
      return Object.values(s.fields).includes(e.slot) ? 'That plot of land is taken.' : null
    case 'planted':
      return whyPlanted(s, e, catalog)
    case 'watered':
      return whyWatered(s, e, catalog)
    case 'harvested':
      return whyHarvested(s, e, catalog)
    case 'slept':
      return s.day < 1 ? 'There is no farm to sleep on.' : null
    case 'fenced':
      return whyFenced(s, e, catalog)
    case 'foraged':
      return whyForaged(s, e, catalog)
    case 'domesticated':
      return whyDomesticated(s, e, catalog)
    case 'unlocked':
      return whyUnlocked(s, e, catalog)
    case 'focus-set':
      return whyFocus(s, e, catalog)
    case 'bar-set':
      return whyBar(s, e, catalog)
    case 'farm-named':
      return s.day < 1 ? 'There is no farm to name.' : whyName(e.name)
    case 'snapshot-imported':
      return fromV2(e.snapshot, catalog) ? null : 'That is not a farm this game can read.'
  }
}

/**
 * What the game asks of something done today, on top of what a log may hold. Replay never asks any of it, so a pack
 * can change these things under a saved farm and the farm loses nothing:
 * - a seed that has to be earned is planted only once it has been (a farm that planted it earlier keeps the crop);
 * - a seed is not planted two layers ahead of a hollow one (a farm that grew its canopy first keeps it);
 * - a bar is set only for a field with an end (a bar set before a pack was marked as having none stays in the log, unused).
 */
function whyToday(s: FarmState, e: FarmEvent, catalog: Catalog): string | null {
  if (e.type === 'bar-set') {
    const pack = catalog.pack(e.pack)
    return pack?.perennial === true ? 'The ' + pack.title + ' field has no end, so it has no bar.' : null
  }
  if (e.type !== 'planted') return null
  const seed = catalog.seed(e.seed)
  if (!seed) return null
  if (seed.earned && !isEarned(seed, s, catalog)) return 'You have not earned ' + seed.name + ' yet. It takes ' + earnedLine(seed.earned, catalog) + '.'
  const below = heldBy(seed, s, catalog)
  return below ? 'The ' + LAYER_NAMES[below] + ' layer of the ' + (catalog.pack(seed.pack)?.title ?? seed.pack) + ' field is hollow. Plant there before ' + seed.name + '.' : null
}

const NOT_AN_EVENT = 'That is not something the farm can do.'

/** Null if a log may hold this event after `s`, else a reason. This is all that replaying a farm asks. Never throws. */
export function allowed(s: FarmState, event: unknown, catalog: Catalog): string | null {
  const e = parseEvent(event)
  return e ? why(s, e, catalog) : NOT_AN_EVENT
}

/** Null if a player may do this now, else a reason they can read. Never throws, whatever the event is. */
export function check(s: FarmState, event: unknown, catalog: Catalog): string | null {
  const e = parseEvent(event)
  return e ? (why(s, e, catalog) ?? whyToday(s, e, catalog)) : NOT_AN_EVENT
}

/* ---------- what each event does ---------- */

const spend = (s: FarmState, pack: string, cost: number): void => {
  s.energy -= cost
  s.today.spent[pack] = (s.today.spent[pack] ?? 0) + cost
}
const compost = (s: FarmState, id: string): void => {
  if (!s.compost.includes(id)) s.compost.push(id)
}
const uncompost = (s: FarmState, id: string): void => {
  s.compost = s.compost.filter((x) => x !== id)
}

function sleep(s: FarmState): void {
  const barrelFilled = s.energy >= RULES.barrel.fillAt && s.barrel < RULES.barrel.max
  if (barrelFilled) s.barrel += 1
  s.day += 1
  const saved: string[] = []
  const wilted: string[] = []
  for (const c of s.crops) {
    if (c.perennial || c.wilted || s.day < c.due + RULES.wiltAfter) continue
    if (s.barrel > 0) {
      s.barrel -= 1
      c.due = s.day
      saved.push(c.seed)
    } else {
      c.wilted = true
      c.due = s.day
      compost(s, c.seed)
      wilted.push(c.seed)
    }
  }
  s.energy = s.energyMax
  s.today = { planted: 0, spent: {} }
  s.night = { saved, wilted, barrelFilled }
}

function water(s: FarmState, c: Crop, e: Extract<FarmEvent, { type: 'watered' }>, catalog: Catalog): void {
  const { ok } = e
  if (e.work === 'explain') c.journal.push({ day: s.day, kind: 'explain', text: (e.text ?? '').trim(), ok })
  if (ok) {
    c.wilted = false
    if (!c.perennial) c.stage = Math.min(RULES.maxStage, c.stage + 1)
    c.best = Math.max(c.best, c.stage)
    c.due = s.day + interval(c)
    uncompost(s, c.seed)
    // Asked once the tree stands again, so the check-in that revives a wilted member is the one that pays.
    s.coins += guildCoins(c.seed, s, catalog)
  } else {
    c.wilted = true
    if (!c.perennial) c.stage = Math.max(0, c.stage - 1)
    c.due = s.day + 1
    compost(s, c.seed)
  }
}

function harvest(s: FarmState, c: Crop, e: Extract<FarmEvent, { type: 'harvested' }>, catalog: Catalog): void {
  const { ok } = e
  if (e.text !== undefined) c.journal.push({ day: s.day, kind: 'harvest', text: e.text.trim(), ok })
  if (ok) {
    c.perennial = true
    c.stage = RULES.maxStage
    c.best = RULES.maxStage
    c.due = s.day + RULES.perennialInterval
    // The guild's share is asked once the tree is rooted: the harvest that makes a guild whole is the first it pays for.
    s.coins += RULES.harvest.coins + guildCoins(c.seed, s, catalog)
    uncompost(s, c.seed)
  } else {
    c.stage = RULES.maxStage - 1
    c.due = s.day + 1
    compost(s, c.seed)
  }
}

function step(s: FarmState, e: FarmEvent, catalog: Catalog): FarmState {
  const n = copy(s)
  // `why` has already agreed these exist; the lookups just keep the compiler honest.
  const crop = 'seed' in e ? cropOf(n, e.seed) : undefined
  const pack = 'seed' in e ? catalog.seed(e.seed)?.pack : undefined
  switch (e.type) {
    case 'farm-started':
      return { ...initialState(), day: e.day, energy: Math.min(e.energy, RULES.energyMax), energyMax: RULES.energyMax, coins: e.coins, barrel: Math.min(e.barrel, RULES.barrel.max) }
    case 'field-opened':
      n.fields[e.pack] = e.slot
      return n
    case 'planted':
      if (!pack) return s
      spend(n, pack, RULES.plant.energy)
      n.coins -= RULES.plant.coins
      n.today.planted += 1
      n.crops.push({ seed: e.seed, x: e.x, y: e.y, stage: 0, best: 0, due: n.day + 1, wilted: false, perennial: false, notes: e.notes.trim(), journal: [] })
      return n
    case 'watered':
      if (!crop || !pack) return s
      spend(n, pack, RULES.water.energy)
      water(n, crop, e, catalog)
      return n
    case 'harvested':
      if (!crop || !pack) return s
      spend(n, pack, RULES.harvest.energy)
      harvest(n, crop, e, catalog)
      return n
    case 'slept':
      sleep(n)
      return n
    case 'fenced':
      n.coins -= fenceCost(terrain(e.x, e.y, n.fields, n.cleared))
      n.cleared[tileKey(e.x, e.y)] = e.pack
      return n
    case 'foraged':
      n.energy -= RULES.forage.energy
      n.coins += RULES.forage.coins
      n.foraged.push(e.find)
      return n
    case 'domesticated':
      n.volunteers.push(e.seed)
      return n
    case 'unlocked':
      if (!pack) return s
      spend(n, pack, RULES.testOut.energy)
      if (e.ok) n.unlocked.push(e.seed)
      return n
    case 'focus-set':
      if (e.branch === null) delete n.focus[e.pack]
      else n.focus[e.pack] = e.branch
      return n
    case 'bar-set':
      n.bars[e.pack] = e.bar
      return n
    case 'farm-named':
      n.name = e.name.trim()
      return n
    case 'snapshot-imported':
      return fromV2(e.snapshot, catalog) ?? s
  }
}

/** The state after the event, or the very same object if a log may not hold it here. Never mutates `s`. */
export function apply(s: FarmState, event: unknown, catalog: Catalog): FarmState {
  const e = parseEvent(event)
  if (!e || why(s, e, catalog) !== null) return s
  return step(s, e, catalog)
}

/** A farm is its log: replay every event from nothing. Events that are not allowed are skipped. */
export function fold(events: readonly unknown[], catalog: Catalog): FarmState {
  return events.reduce<FarmState>((s, e) => apply(s, e, catalog), initialState())
}

/**
 * How many entries of a log the fold skips. A farm the game saved itself has none: every entry was checked before it
 * was kept. More than none means the packs or the rules have moved under the farm since it was played.
 */
export function refusedCount(events: readonly unknown[], catalog: Catalog): number {
  let refused = 0
  let s = initialState()
  for (const e of events) {
    const next = apply(s, e, catalog)
    if (next === s) refused++
    s = next
  }
  return refused
}

/**
 * `field-opened` events for packs that have no field yet, in pack order, each in the next free slot.
 * With `only`, just the packs listed there: the ones a farmer chose.
 */
export function fieldsToOpen(s: Pick<FarmState, 'fields'>, catalog: Catalog, only?: readonly string[]): FarmEvent[] {
  const fields = { ...s.fields }
  const events: FarmEvent[] = []
  for (const p of catalog.packs) {
    if (Object.hasOwn(fields, p.pack) || (only && !only.includes(p.pack))) continue
    const slot = nextFreeSlot(fields)
    fields[p.pack] = slot
    events.push({ type: 'field-opened', pack: p.pack, slot })
  }
  return events
}
