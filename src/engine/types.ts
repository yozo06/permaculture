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
