// The farm as an event log. `check` says whether an event is allowed, `apply` makes it happen, `fold` replays a log.
// Everything here is pure: state in, state out, nothing mutated, nothing random, no clock.
import type { Catalog } from './catalog'
import { fieldOf, fenceCost, isBuildingTile, neighbourFields, nextFreeSlot, terrain, tileKey, wildKind, worldSize } from './land'
import { RULES, available, capLeft, cropOf, interval, revivable, ripe, thirsty, visible } from './rules'
import { fromV2 } from './v2'
import type { Crop, FarmEvent, FarmState } from './types'

/** A farm with nothing in it: the state before `farm-started`. */
export const initialState = (): FarmState => ({
  day: 0, energy: 0, energyMax: 0, coins: 0, barrel: 0,
  fields: {}, cleared: {}, crops: [], compost: [], unlocked: [], volunteers: [], foraged: [], focus: {},
  today: { planted: 0, spent: {} }, night: null,
})

/** A copy that shares nothing with the original. */
function copy(s: FarmState): FarmState {
  return {
    ...s,
    fields: { ...s.fields },
    cleared: { ...s.cleared },
    crops: s.crops.map((c) => ({ ...c })),
    compost: s.compost.slice(),
    unlocked: s.unlocked.slice(),
    volunteers: s.volunteers.slice(),
    foraged: s.foraged.slice(),
    focus: { ...s.focus },
    today: { planted: s.today.planted, spent: { ...s.today.spent } },
    night: s.night ? { saved: s.night.saved.slice(), wilted: s.night.wilted.slice(), barrelFilled: s.night.barrelFilled } : null,
  }
}

/* ---------- reading an event that may be anything ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
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
      if (day < 1 || energy < 0 || coins < 0 || barrel < 0 || barrel > RULES.barrel.max) return null
      return { type, day, energy, coins, barrel }
    }
    case 'field-opened':
      return text(raw.pack) && whole(raw.slot) && raw.slot >= 0 && raw.slot <= 99 ? { type, pack: raw.pack, slot: raw.slot } : null
    case 'planted':
      return text(raw.seed) && whole(raw.x) && whole(raw.y) ? { type, seed: raw.seed, x: raw.x, y: raw.y } : null
    case 'watered':
    case 'harvested':
    case 'unlocked':
      return text(raw.seed) && typeof raw.ok === 'boolean' ? { type, seed: raw.seed, ok: raw.ok } : null
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

function whyPlanted(s: FarmState, e: Extract<FarmEvent, { type: 'planted' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  if (!seed) return 'That seed is not in any pack.'
  const title = catalog.pack(seed.pack)?.title ?? seed.pack
  if (!Object.hasOwn(s.fields, seed.pack)) return 'The ' + title + ' field is not open yet.'
  if (!available(seed, s)) return seed.name + ' is still locked.'
  if (cropOf(s, seed.id)) return seed.name + ' is already planted.'
  if (fieldOf(e.x, e.y, s.fields, s.cleared) !== seed.pack) return seed.name + ' belongs in the ' + title + ' field.'
  if (s.crops.some((c) => c.x === e.x && c.y === e.y)) return 'Something is already growing there.'
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
  if (s.energy < RULES.water.energy) return 'Out of energy. Sleep to start a new day.'
  return capWhy(s, seed.pack, RULES.water.energy, catalog)
}

function whyHarvested(s: FarmState, e: Extract<FarmEvent, { type: 'harvested' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  const crop = cropOf(s, e.seed)
  if (!seed || !crop) return 'That is not planted.'
  if (crop.perennial) return seed.name + ' is rooted already. It only needs a check-in.'
  if (!ripe(crop, s.day)) return seed.name + ' is not ready to harvest.'
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
  if (!catalog.find(e.find)) return 'There is nothing to find there.'
  if (s.foraged.includes(e.find)) return 'You have found that already.'
  if (s.energy < RULES.forage.energy) return 'Out of energy. Sleep first.'
  return null
}

function whyDomesticated(s: FarmState, e: Extract<FarmEvent, { type: 'domesticated' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  if (!seed || !seed.wild) return 'Only wild seeds can be domesticated.'
  if (s.volunteers.includes(seed.id)) return seed.name + ' is already in your seed bag.'
  if (!s.foraged.some((id) => catalog.find(id)?.seed === seed.id)) return 'Forage a find that leads to ' + seed.name + ' first.'
  return null
}

function whyUnlocked(s: FarmState, e: Extract<FarmEvent, { type: 'unlocked' }>, catalog: Catalog): string | null {
  const seed = catalog.seed(e.seed)
  if (!seed || !visible(seed, s)) return 'That seed is not in your tree yet.'
  if (available(seed, s) || cropOf(s, seed.id)) return seed.name + ' is not locked.'
  if (s.energy < RULES.testOut.energy) return 'Needs ' + RULES.testOut.energy + ' energy. Sleep first.'
  return capWhy(s, seed.pack, RULES.testOut.energy, catalog)
}

function whyFocus(s: FarmState, e: Extract<FarmEvent, { type: 'focus-set' }>, catalog: Catalog): string | null {
  const pack = catalog.pack(e.pack)
  if (!pack || !Object.hasOwn(s.fields, e.pack)) return 'That field is not open.'
  if (e.branch !== null && !pack.branches.some((b) => b.id === e.branch)) return 'That branch is not in the ' + pack.title + ' field.'
  return null
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
    case 'snapshot-imported':
      return fromV2(e.snapshot, catalog) ? null : 'That is not a farm this game can read.'
  }
}

/** Null if the event is allowed, else a reason the player can read. Never throws, whatever the event is. */
export function check(s: FarmState, event: unknown, catalog: Catalog): string | null {
  const e = parseEvent(event)
  return e ? why(s, e, catalog) : 'That is not something the farm can do.'
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

function water(s: FarmState, c: Crop, ok: boolean): void {
  if (ok) {
    c.wilted = false
    if (!c.perennial) c.stage = Math.min(RULES.maxStage, c.stage + 1)
    c.due = s.day + interval(c)
    uncompost(s, c.seed)
  } else {
    c.wilted = true
    if (!c.perennial) c.stage = Math.max(0, c.stage - 1)
    c.due = s.day + 1
    compost(s, c.seed)
  }
}

function harvest(s: FarmState, c: Crop, ok: boolean): void {
  if (ok) {
    c.perennial = true
    c.stage = RULES.maxStage
    c.due = s.day + RULES.perennialInterval
    s.coins += RULES.harvest.coins
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
      return { ...initialState(), day: e.day, energy: Math.min(e.energy, RULES.energyMax), energyMax: RULES.energyMax, coins: e.coins, barrel: e.barrel }
    case 'field-opened':
      n.fields[e.pack] = e.slot
      return n
    case 'planted':
      if (!pack) return s
      spend(n, pack, RULES.plant.energy)
      n.coins -= RULES.plant.coins
      n.today.planted += 1
      n.crops.push({ seed: e.seed, x: e.x, y: e.y, stage: 0, due: n.day + 1, wilted: false, perennial: false })
      return n
    case 'watered':
      if (!crop || !pack) return s
      spend(n, pack, RULES.water.energy)
      water(n, crop, e.ok)
      return n
    case 'harvested':
      if (!crop || !pack) return s
      spend(n, pack, RULES.harvest.energy)
      harvest(n, crop, e.ok)
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
    case 'snapshot-imported':
      return fromV2(e.snapshot, catalog) ?? s
  }
}

/** The state after the event, or the very same object if the event is not allowed. Never mutates `s`. */
export function apply(s: FarmState, event: unknown, catalog: Catalog): FarmState {
  const e = parseEvent(event)
  if (!e || why(s, e, catalog) !== null) return s
  return step(s, e, catalog)
}

/** A farm is its log: replay every event from nothing. Events that are not allowed are skipped. */
export function fold(events: readonly unknown[], catalog: Catalog): FarmState {
  return events.reduce<FarmState>((s, e) => apply(s, e, catalog), initialState())
}

/** `field-opened` events for every pack that has no field yet, in pack order, each in the next free slot. */
export function fieldsToOpen(s: Pick<FarmState, 'fields'>, catalog: Catalog): FarmEvent[] {
  const fields = { ...s.fields }
  const events: FarmEvent[] = []
  for (const p of catalog.packs) {
    if (Object.hasOwn(fields, p.pack)) continue
    const slot = nextFreeSlot(fields)
    fields[p.pack] = slot
    events.push({ type: 'field-opened', pack: p.pack, slot })
  }
  return events
}
