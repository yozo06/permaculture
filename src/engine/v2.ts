// The prototype's save format ("v2") and the conversion that makes any v2 farm fit the current packs.
// A save file is untrusted: keep what is usable, drop the rest, never throw.
import type { Catalog } from './catalog'
import { fieldOf, nextFreeSlot, tileKey, type Cleared, type Fields } from './land'

export interface V2Crop {
  id: string
  x: number
  y: number
  stage: number
  /** The day it was last watered. */
  lw: number
  wilted: boolean
  per: boolean
}

export interface V2State {
  v: 2
  day: number
  energy: number
  energyMax: number
  coins: number
  barrel: number
  seedSel: string | null
  compost: string[]
  /** "x,y" -> pack id of a fenced-in tile, or 'grass' */
  cleared: Record<string, string>
  unlocked: string[]
  volunteers: string[]
  foraged: string[]
  /** pack id -> branch id */
  focus: Record<string, string>
  cam: { x: number; y: number }
  crops: V2Crop[]
  farmer: { x: number; y: number; tx: number; ty: number }
  /** pack id -> slot */
  fields: Record<string, number>
  /** Energy spent today per field; Sleep resets it. */
  today: { spent: Record<string, number> }
}

/** Phase 0 named fields with two letters; slots 0 to 3 were their fixed places. */
const LEGACY_FIELDS: readonly (readonly [string, string])[] = [
  ['hs', 'haskell-backend'],
  ['sd', 'system-design'],
  ['inf', 'infra'],
  ['kn', 'kannada'],
]
const LEGACY_PACK: Record<string, string> = Object.fromEntries(LEGACY_FIELDS)

/** Phase 0 find ids, by the order the prototype listed them (f1 to f12). */
const LEGACY_FINDS: Record<string, string> = Object.fromEntries(
  ['flexible-paxos', 'jump-hash', 'nonmoving-gc', 'tcp-backpressure', 'hint-bits', 'topology-spread', 'pandi-curry', 'stm-commit', 'quic', 'loose-slos', 'kannada-numerals', 'whnf'].map(
    (id, i) => ['f' + (i + 1), id],
  ),
)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
const unique = <T>(items: T[]): T[] => [...new Set(items)]

/** True for a parsed v2 farm (not yet checked inside). */
export const looksLikeV2 = (v: unknown): v is Record<string, unknown> =>
  isRecord(v) && v.v === 2 && Array.isArray(v.crops) && isRecord(v.farmer)

function readFields(raw: unknown, catalog: Catalog): Record<string, number> {
  const fields: Record<string, number> = {}
  const taken = new Set<number>()
  if (isRecord(raw)) {
    for (const [key, slot] of Object.entries(raw)) {
      const pack = LEGACY_PACK[key] ?? key
      if (!catalog.pack(pack) || Object.hasOwn(fields, pack)) continue
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot > 99 || taken.has(slot)) continue
      fields[pack] = slot
      taken.add(slot)
    }
  } else {
    LEGACY_FIELDS.forEach(([, pack], slot) => {
      if (catalog.pack(pack)) fields[pack] = slot
    })
  }
  return fields
}

function readCleared(raw: unknown, fields: Fields): Record<string, string> {
  const cleared: Record<string, string> = {}
  if (!isRecord(raw)) return cleared
  for (const [k, f] of Object.entries(raw)) {
    if (!/^\d+,\d+$/.test(k) || typeof f !== 'string') continue
    const pack = LEGACY_PACK[f] ?? f
    if (pack === 'grass' || Object.hasOwn(fields, pack)) cleared[k] = pack
  }
  return cleared
}

function readFocus(raw: unknown, catalog: Catalog): Record<string, string> {
  const focus: Record<string, string> = {}
  if (!isRecord(raw)) return focus
  for (const [key, value] of Object.entries(raw)) {
    const pack = catalog.pack(LEGACY_PACK[key] ?? key)
    if (!pack) continue
    const branch = typeof value === 'number' ? pack.branches[value]?.id : typeof value === 'string' ? value : undefined
    if (branch && pack.branches.some((b) => b.id === branch)) focus[pack.pack] = branch
  }
  return focus
}

function readToday(raw: unknown, catalog: Catalog): V2State['today'] {
  const spent: Record<string, number> = {}
  if (isRecord(raw) && isRecord(raw.spent)) {
    for (const [pack, n] of Object.entries(raw.spent)) {
      if (catalog.pack(pack) && typeof n === 'number' && Number.isFinite(n) && n > 0) spent[pack] = n
    }
  }
  return { spent }
}

/** Crops must be known seeds, one per seed and per tile, standing on their own pack's field. */
function readCrops(raw: unknown[], catalog: Catalog, fields: Fields, cleared: Cleared): V2Crop[] {
  const crops: V2Crop[] = []
  const seeds = new Set<string>()
  const tiles = new Set<string>()
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string') continue
    const seed = catalog.seed(item.id)
    if (!seed) continue
    const x = Math.round(finite(item.x, -1))
    const y = Math.round(finite(item.y, -1))
    if (fieldOf(x, y, fields, cleared) !== seed.pack || seeds.has(seed.id) || tiles.has(tileKey(x, y))) continue
    seeds.add(seed.id)
    tiles.add(tileKey(x, y))
    crops.push({
      id: seed.id, x, y, stage: Math.max(0, Math.min(4, Math.round(finite(item.stage, 0)))),
      lw: finite(item.lw, 0), wilted: item.wilted === true, per: item.per === true,
    })
  }
  return crops
}

/**
 * Turn a parsed v2 farm into a farm that fits `catalog`: legacy field keys and find ids renamed, every pack
 * given a field, anything that points at a missing seed dropped. Returns null if it is not a v2 farm at all.
 * Running it on its own output changes nothing. (B3 turns this into `fromV2`.)
 */
export function upgradeV2(value: unknown, catalog: Catalog): V2State | null {
  if (!looksLikeV2(value) || !Array.isArray(value.crops) || !isRecord(value.farmer)) return null
  const fields = readFields(value.fields, catalog)
  // Packs added since the save was made get the next free slot, in catalog order.
  for (const p of catalog.packs) if (!Object.hasOwn(fields, p.pack)) fields[p.pack] = nextFreeSlot(fields)
  const cleared = readCleared(value.cleared, fields)
  const energyMax = finite(value.energyMax, 90) > 0 ? finite(value.energyMax, 90) : 90
  const known = (ids: unknown) => unique(strings(ids).filter((id) => catalog.seed(id)))
  const fm = value.farmer
  const cam = isRecord(value.cam) ? { x: finite(value.cam.x, 240), y: finite(value.cam.y, -18) } : { x: 240, y: -18 }
  const crops = readCrops(value.crops, catalog, fields, cleared)
  return {
    v: 2,
    day: Math.max(1, Math.round(finite(value.day, 1))),
    energy: Math.max(0, Math.min(energyMax, finite(value.energy, energyMax))),
    energyMax,
    coins: Math.max(0, finite(value.coins, 0)),
    barrel: Math.max(0, Math.min(5, Math.round(finite(value.barrel, 0)))),
    seedSel: typeof value.seedSel === 'string' && catalog.seed(value.seedSel) ? value.seedSel : null,
    compost: known(value.compost),
    cleared,
    unlocked: known(value.unlocked),
    volunteers: known(value.volunteers),
    foraged: unique(strings(value.foraged).map((id) => LEGACY_FINDS[id] ?? id).filter((id) => catalog.find(id))),
    focus: readFocus(value.focus, catalog),
    cam,
    crops,
    farmer: { x: finite(fm.x, 9), y: finite(fm.y, 8), tx: finite(fm.tx, 9), ty: finite(fm.ty, 8) },
    fields,
    today: readToday(value.today, catalog),
  }
}
