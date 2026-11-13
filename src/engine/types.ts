// Pack data, as the schema (packs/schema/pack.schema.json) describes it. Optional fields stay optional here.

export type Layer = 'canopy' | 'understory' | 'shrub' | 'herb' | 'ground-cover' | 'root' | 'vine'
export type HarvestType = 'recall' | 'solve' | 'judged' | 'artifact'

export interface Mcq {
  q: string
  answer: string
  distractors: string[]
  why: string
  source?: string
}

export interface BranchDef {
  id: string
  title: string
  description?: string
}

export interface SourceDef {
  id: string
  title: string
  url?: string
  note?: string
}

export interface GuildDef {
  id: string
  title: string
  seeds: string[]
}

/** Someone at the market: a name, and the readiness they want of each field they care about. */
export interface BuyerDef {
  id: string
  name: string
  note?: string
  /** pack id -> the readiness that field has to reach */
  bars: Record<string, number>
}

export interface FindDef {
  id: string
  near: string[]
  text: string
  seed?: string
}

export interface SeedDef {
  id: string
  name: string
  layer: Layer
  branch: string
  tier: number
  needs?: string[]
  wild?: boolean
  /** The seed of this pack that drops this one when it is harvested. A sapling is hidden until then. */
  sapling_of?: string
  /** The pack id of a second field this seed borders: it sits on the edge of the two, and grows in its own. */
  edge?: string
  /** Learning that has to happen first: `rooted` seeds (in `pack`, or in any other field), or `pack`'s `readiness`. */
  earned?: { pack?: string; rooted?: number; readiness?: number }
  harvest: HarvestType
  minutes?: number
  sources?: string[]
  summary?: string
  rubric?: string[]
  questions?: { water?: Mcq[]; harvest?: Mcq[] }
  prompts?: string[]
}

export interface PackDef {
  pack: string
  version: number
  title: string
  color?: string
  description?: string
  readiness_bar?: number
  perennial?: boolean
  energy_cap?: number
  branches: BranchDef[]
  sources?: SourceDef[]
  guilds?: GuildDef[]
  buyers?: BuyerDef[]
  finds?: FindDef[]
  seeds: SeedDef[]
}

/* ---------- the farm ---------- */

/** What the player wrote when they explained a crop or wrote up its harvest. Newest last. */
export interface JournalEntry {
  day: number
  kind: 'explain' | 'harvest'
  text: string
  /** Whether the self-rating passed. */
  ok: boolean
}

export interface Crop {
  seed: string
  x: number
  y: number
  /** 0 to 4; shown as stage + 1 of 5. Perennials stay at 4. */
  stage: number
  /** The furthest it has ever grown, 0 to 4. Never falls. It is what a neighbour is shown, so a wrong answer cannot be seen from outside. */
  best: number
  /** The day it is thirsty (or, if wilted, can be revived) from. */
  due: number
  wilted: boolean
  perennial: boolean
  /** The player's own notes from planting. Empty for a crop planted before notes existed. */
  notes: string
  journal: JournalEntry[]
}

/** Something real that came of the farm: an offer, a yes. Kept as the farmer wrote it. */
export interface Sale {
  /** The buyer's id. The buyer may since have left the market. */
  buyer: string
  day: number
  text: string
}

/** What the morning report needs from the last Sleep. Seed ids. */
export interface Night {
  saved: string[]
  wilted: string[]
  barrelFilled: boolean
}

export interface FarmState {
  /** What the farmer called it; empty until they do. Neighbours see it. */
  name: string
  day: number
  energy: number
  energyMax: number
  coins: number
  barrel: number
  /** pack id -> slot */
  fields: Record<string, number>
  /** "x,y" -> the pack id of a fenced-in tile, or 'grass' */
  cleared: Record<string, string>
  /** In planting order. */
  crops: Crop[]
  compost: string[]
  unlocked: string[]
  volunteers: string[]
  foraged: string[]
  /** pack id -> branch id; absent means no focus */
  focus: Record<string, string>
  /** pack id -> the readiness bar the farmer set for that field; absent means the pack's own */
  bars: Record<string, number>
  /** In the order they were made. */
  sales: Sale[]
  /** `spent` is energy used per field today; Sleep resets both. */
  today: { planted: number; spent: Record<string, number> }
  /** Set by `slept`. */
  night: Night | null
}

export type FarmEvent =
  | { type: 'farm-started'; day: number; energy: number; coins: number; barrel: number }
  | { type: 'field-opened'; pack: string; slot: number }
  | { type: 'planted'; seed: string; x: number; y: number; notes: string }
  /** `work` is what the player did, recorded as it happened. An explain also carries the text and the self-rating. */
  | { type: 'watered'; seed: string; ok: boolean; work: 'recall' | 'explain'; text?: string; ticked?: number; of?: number }
  /** A write-up harvest carries the text and the self-rating; a recall harvest carries neither. */
  | { type: 'harvested'; seed: string; ok: boolean; text?: string; ticked?: number; of?: number }
  | { type: 'slept' }
  | { type: 'fenced'; x: number; y: number; pack: string }
  | { type: 'foraged'; x: number; y: number; find: string }
  | { type: 'domesticated'; seed: string }
  /** A jump-the-fence attempt; `ok` means it passed. A write-up proof is kept on the event, like a harvest's. */
  | { type: 'unlocked'; seed: string; ok: boolean; text?: string; ticked?: number; of?: number }
  | { type: 'focus-set'; pack: string; branch: string | null }
  | { type: 'bar-set'; pack: string; bar: number }
  | { type: 'farm-named'; name: string }
  /** A sale at the market: `text` says what really happened. */
  | { type: 'sold'; buyer: string; text: string }
  /** A Phase 0 (v2) save, converted by `fromV2`. */
  | { type: 'snapshot-imported'; snapshot: unknown }

/** An event as the log keeps it. `fold` ignores `id` and `at`. */
export type LoggedEvent = FarmEvent & { id: string; at: string }
