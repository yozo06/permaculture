// What the seed bag and the learning tree draw, worked out from the packs and the farm. Pure: no DOM.
import { HARVEST_NAMES, LAYER_NAMES, type Catalog, type Seed } from '../engine/catalog'
import { harvestWork, rungName, waterWork, type WaterKind } from '../engine/ladder'
import { RULES, available, cropOf, revivable, ripe, rooted, thirsty, visible, zone } from '../engine/rules'
import type { Crop, FarmState, PackDef } from '../engine/types'

export const DEFAULT_COLOR = '#6DB24F'
export const packColor = (p: PackDef): string => p.color ?? DEFAULT_COLOR

export type SeedStatus = 'ready' | 'growing' | 'rooted' | 'locked'

/** Where a seed stands: rooted (a perennial), growing (in the ground), ready to plant, or locked. */
export function seedStatus(seed: Seed, state: FarmState): SeedStatus {
  const crop = cropOf(state, seed.id)
  if (crop) return crop.perennial ? 'rooted' : 'growing'
  return available(seed, state) ? 'ready' : 'locked'
}

export const needsText = (seed: Seed, catalog: Catalog): string =>
  seed.needs.map((id) => catalog.seed(id)?.name ?? id).join(' + ')

/* ---------- the morning's to-do ---------- */

export interface Tending {
  /** Seed ids of crops that need watering today. */
  thirsty: string[]
  /** Seed ids of wilted crops that can be revived today. */
  revive: string[]
  /** Seed ids of crops ready to harvest. */
  ripe: string[]
}

/** What wants attention on the current day: crops to water, to revive, or to harvest. */
export function tending(state: FarmState): Tending {
  const day = state.day
  return {
    thirsty: state.crops.filter((c) => thirsty(c, day)).map((c) => c.seed),
    revive: state.crops.filter((c) => revivable(c, day)).map((c) => c.seed),
    ripe: state.crops.filter((c) => ripe(c, day)).map((c) => c.seed),
  }
}

/* ---------- a farm the game has moved under ---------- */

/** What to say when a farm's log holds entries today's packs and rules refuse. */
export const driftText = (refused: number): string =>
  refused + (refused === 1 ? " thing in this farm's history no longer fits" : " things in this farm's history no longer fit") +
  " today's game and " + (refused === 1 ? 'was' : 'were') + ' skipped, so the farm may be missing something it had.'

/* ---------- seed bag ---------- */

export interface BagSeed {
  id: string
  name: string
  layer: string
  /** recall, solve, judged or artifact. */
  harvest: string
  status: 'ready' | 'growing' | 'rooted'
  focus: boolean
  selected: boolean
}

export interface BagSection {
  pack: string
  title: string
  color: string
  perennial: boolean
  /** Percent of the day's energy this field may use, if capped. */
  capPercent: number | null
  focusTitle: string | null
  /** Plantable seeds and seeds in the ground: focus branch first, then by tier. */
  seeds: BagSeed[]
  /** Visible seeds that are not plantable yet. They are shown as one line. */
  lockedCount: number
}

/** `selected` is the seed in the player's hand, if any. */
export function bagView(state: FarmState, catalog: Catalog, selected: string | null = null): BagSection[] {
  const sections: BagSection[] = []
  for (const pack of catalog.packs) {
    if (!Object.hasOwn(state.fields, pack.pack)) continue
    const focusId = state.focus[pack.pack]
    const focusTitle = pack.branches.find((b) => b.id === focusId)?.title ?? null
    const seeds: BagSeed[] = []
    let lockedCount = 0
    for (const seed of catalog.seedsOf(pack.pack)) {
      if (!visible(seed, state)) continue
      const status = seedStatus(seed, state)
      if (status === 'locked') { lockedCount++; continue }
      seeds.push({
        id: seed.id, name: seed.name, layer: LAYER_NAMES[seed.layer], harvest: HARVEST_NAMES[seed.harvest], status,
        focus: focusTitle !== null && seed.branch === focusId, selected: selected === seed.id,
      })
    }
    const tier = (s: BagSeed) => catalog.seed(s.id)?.tier ?? 0
    seeds.sort((a, b) => Number(b.focus) - Number(a.focus) || tier(a) - tier(b))
    sections.push({
      pack: pack.pack, title: pack.title, color: packColor(pack), perennial: pack.perennial === true,
      capPercent: pack.energy_cap ?? null, focusTitle, seeds, lockedCount,
    })
  }
  return sections
}

/* ---------- learning tree ---------- */

export const TREE_WIDTH = 480
const TOP = 46
const TIER_GAP = 72
const ROW_GAP = 48
const NODE_MIN_SPACING = 112

export interface TreeNode {
  id: string
  name: string
  /** The name split over at most two lines. */
  lines: string[]
  status: SeedStatus
  wild: boolean
  /** Stage progress for a growing crop, 0 to 1; null otherwise. */
  progress: number | null
  x: number
  y: number
  width: number
}

export interface TreeEdge {
  from: { x: number; y: number }
  to: { x: number; y: number }
  /** The seed it needs is rooted. */
  rooted: boolean
}

export interface TreeBranch {
  id: string
  title: string
  focus: boolean
  /** Centre of its column. */
  x: number
}

export interface TreeGuild {
  id: string
  title: string
  /** `name` is null for a wild seed that has not been found yet. */
  members: { id: string; name: string | null; status: SeedStatus }[]
  rooted: number
  total: number
}

export interface TreeView {
  pack: string
  title: string
  color: string
  width: number
  height: number
  columnWidth: number
  branches: TreeBranch[]
  nodes: TreeNode[]
  edges: TreeEdge[]
  guilds: TreeGuild[]
  /** Seeds you could jump the fence to: visible, locked, not planted. */
  locked: { id: string; name: string; needs: string }[]
}

/** Break a long name over two lines at a space near the middle. */
export function splitName(name: string): string[] {
  if (name.length <= 13) return [name]
  const i = name.lastIndexOf(' ', Math.ceil(name.length / 2) + 2)
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name]
}

export function treeView(packId: string, state: FarmState, catalog: Catalog): TreeView | null {
  const pack = catalog.pack(packId)
  if (!pack) return null
  const seeds = catalog.seedsOf(packId).filter((s) => visible(s, state))
  const count = Math.max(1, pack.branches.length)
  const columnWidth = TREE_WIDTH / count
  const perRow = Math.max(1, Math.floor(columnWidth / NODE_MIN_SPACING))
  const width = Math.min(100, columnWidth - 12)
  const branchOf = (s: Seed) => Math.max(0, pack.branches.findIndex((b) => b.id === s.branch))

  const nodes: TreeNode[] = []
  const at = new Map<string, TreeNode>()
  let y = TOP
  for (const tier of [...new Set(seeds.map((s) => s.tier))].sort((a, b) => a - b)) {
    let rows = 1
    for (let b = 0; b < count; b++) {
      const cell = seeds.filter((s) => s.tier === tier && branchOf(s) === b)
      rows = Math.max(rows, Math.ceil(cell.length / perRow))
      cell.forEach((seed, i) => {
        const row = Math.floor(i / perRow)
        const inRow = Math.min(perRow, cell.length - row * perRow)
        const crop = cropOf(state, seed.id)
        const status = seedStatus(seed, state)
        const node: TreeNode = {
          id: seed.id, name: seed.name, lines: splitName(seed.name), status, wild: seed.wild,
          progress: status === 'growing' && crop ? (crop.stage + 1) / 5 : null,
          x: b * columnWidth + ((i % perRow) + 0.5) * (columnWidth / inRow), y: y + row * ROW_GAP, width,
        }
        nodes.push(node)
        at.set(seed.id, node)
      })
    }
    y += (rows - 1) * ROW_GAP + TIER_GAP
  }

  const have = rooted(state)
  const edges: TreeEdge[] = []
  for (const seed of seeds) {
    const to = at.get(seed.id)
    for (const need of seed.needs) {
      const from = at.get(need)
      if (from && to) edges.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, rooted: have.has(need) })
    }
  }

  const guilds: TreeGuild[] = (pack.guilds ?? []).map((g) => {
    const members = g.seeds.flatMap((id) => {
      const seed = catalog.seed(id)
      if (!seed) return []
      return [{ id, name: visible(seed, state) ? seed.name : null, status: seedStatus(seed, state) }]
    })
    return { id: g.id, title: g.title, members, rooted: members.filter((m) => m.status === 'rooted').length, total: members.length }
  })

  const locked = seeds
    .filter((s) => seedStatus(s, state) === 'locked')
    .map((s) => ({ id: s.id, name: s.name, needs: needsText(s, catalog) }))

  return {
    pack: packId, title: pack.title, color: packColor(pack), width: TREE_WIDTH, height: y, columnWidth,
    branches: pack.branches.map((b, i) => ({ id: b.id, title: b.title, focus: state.focus[packId] === b.id, x: (i + 0.5) * columnWidth })),
    nodes, edges, guilds, locked,
  }
}

/* ---------- the crop sheet ---------- */

export interface SourceLink {
  title: string
  /** Only ever an http(s) address; anything else is dropped. */
  url: string | null
}

/** A seed's sources as titles with a safe link, if it has one. */
export function sourceLinks(seed: Seed, catalog: Catalog): SourceLink[] {
  const declared = catalog.pack(seed.pack)?.sources ?? []
  return seed.sources.flatMap((id) => {
    const src = declared.find((s) => s.id === id)
    return src ? [{ title: src.title, url: src.url !== undefined && /^https?:\/\//i.test(src.url) ? src.url : null }] : []
  })
}

export interface JournalLine {
  day: number
  /** "Explained" or "Harvest write-up". */
  label: string
  text: string
  ok: boolean
}

export interface CropView {
  seed: string
  name: string
  pack: string
  layer: string
  /** "Stage 3 of 5 · Z2 · Recall". */
  stageLine: string
  /** What is true of the crop today, in a sentence. */
  statusLine: string
  /** What tapping it will ask for, or null when it has nothing to do. */
  nextWork: string | null
  /** Empty for a crop planted before notes existed. */
  notes: string
  /** Newest first. */
  journal: JournalLine[]
  sources: SourceLink[]
}

const WATER_WORK: Record<WaterKind, string> = { recall: 'a recall card', explain: 'an explanation in your own words' }

/** What the crop sheet shows for a crop on a given day. */
export function cropView(crop: Crop, state: Pick<FarmState, 'day'>, catalog: Catalog): CropView | null {
  const seed = catalog.seed(crop.seed)
  if (!seed) return null
  const day = state.day
  const stageLine = 'Stage ' + (crop.stage + 1) + ' of ' + (RULES.maxStage + 1) + ' · ' + zone(crop) + ' · ' + rungName(crop)
  let statusLine: string
  let nextWork: string | null = null
  if (thirsty(crop, day) || revivable(crop, day)) {
    statusLine = crop.wilted ? 'Wilted, and ready to revive.' : crop.perennial ? 'Due for a check-in.' : 'Thirsty now.'
    nextWork = 'Water: ' + WATER_WORK[waterWork(crop, seed)] + '.'
  } else if (ripe(crop, day)) {
    statusLine = 'Ready to harvest.'
    const work = harvestWork(seed)
    nextWork = 'Harvest: ' + (work.kind === 'recall' ? 'a harder question' : work.proof ? 'proof that it exists' : 'a write-up that meets every line') + '.'
  } else if (crop.wilted) {
    statusLine = 'Wilted. It can be revived on day ' + crop.due + '.'
  } else {
    statusLine = crop.perennial ? 'Rooted. Next check-in on day ' + crop.due + '.' : 'Growing. Thirsty again on day ' + crop.due + '.'
  }
  return {
    seed: seed.id, name: seed.name, pack: seed.pack, layer: LAYER_NAMES[seed.layer], stageLine, statusLine, nextWork,
    notes: crop.notes, journal: crop.journal.map((j) => ({ day: j.day, label: j.kind === 'explain' ? 'Explained' : 'Harvest write-up', text: j.text, ok: j.ok })).reverse(),
    sources: sourceLinks(seed, catalog),
  }
}
