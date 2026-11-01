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
  finds?: FindDef[]
  seeds: SeedDef[]
}

/* ---------- the farm ---------- */

export interface Crop {
  seed: string
  x: number
  y: number
  /** 0 to 4; shown as stage + 1 of 5. Perennials stay at 4. */
  stage: number
  /** The day it is thirsty (or, if wilted, can be revived) from. */
  due: number
  wilted: boolean
  perennial: boolean
}

/** What the morning report needs from the last Sleep. Seed ids. */
export interface Night {
  saved: string[]
  wilted: string[]
  barrelFilled: boolean
}

export interface FarmState {
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
  /** `spent` is energy used per field today; Sleep resets both. */
  today: { planted: number; spent: Record<string, number> }
  /** Set by `slept`. */
  night: Night | null
}

export type FarmEvent =
  | { type: 'farm-started'; day: number; energy: number; coins: number; barrel: number }
  | { type: 'field-opened'; pack: string; slot: number }
  | { type: 'planted'; seed: string; x: number; y: number }
  | { type: 'watered'; seed: string; ok: boolean }
  | { type: 'harvested'; seed: string; ok: boolean }
  | { type: 'slept' }
  | { type: 'fenced'; x: number; y: number; pack: string }
  | { type: 'foraged'; x: number; y: number; find: string }
  | { type: 'domesticated'; seed: string }
  /** A jump-the-fence attempt; `ok` means it passed. */
  | { type: 'unlocked'; seed: string; ok: boolean }
  | { type: 'focus-set'; pack: string; branch: string | null }
  /** A Phase 0 (v2) save, converted by `fromV2`. */
  | { type: 'snapshot-imported'; snapshot: unknown }

/** An event as the log keeps it. `fold` ignores `id` and `at`. */
export type LoggedEvent = FarmEvent & { id: string; at: string }
