// What the seed bag and the learning tree draw, worked out from the packs and the farm. Pure: no DOM.
import { HARVEST_NAMES, LAYER_NAMES, type Catalog, type Seed } from '../engine/catalog'
import { harvestWork, rungName, waterWork, type WaterKind } from '../engine/ladder'
import { earnedLine, earnedProgress, heldBy, isEarned, readiness } from '../engine/readiness'
import { RULES, available, cropOf, revivable, ripe, rooted, thirsty, visible, zone } from '../engine/rules'
import { dragging, edgeLive, guildWhole, harvestCoins, wholeGuilds } from '../engine/yields'
import type { Crop, FarmState, GuildDef, Layer, PackDef } from '../engine/types'

export const DEFAULT_COLOR = '#6DB24F'
export const packColor = (p: PackDef): string => p.color ?? DEFAULT_COLOR

export type SeedStatus = 'ready' | 'held' | 'growing' | 'rooted' | 'locked'

/**
 * Where a seed stands: rooted (a perennial), growing (in the ground), ready to plant, held (it could be planted, but a
 * hollow layer beneath it comes first), or locked (by what it needs, or by what it is earned by).
 */
export function seedStatus(seed: Seed, state: FarmState, catalog: Catalog): SeedStatus {
  const crop = cropOf(state, seed.id)
  if (crop) return crop.perennial ? 'rooted' : 'growing'
  if (!available(seed, state) || !isEarned(seed, state, catalog)) return 'locked'
  return heldBy(seed, state, catalog) ? 'held' : 'ready'
}

/**
 * What to say after a seed has been jumped to, once "it is unlocked" has been said: that it can be planted, or what
 * the jump did not clear. `state` is the farm after the jump.
 */
export function afterJump(seed: Seed, state: FarmState, catalog: Catalog): string {
  if (seed.earned && !isEarned(seed, state, catalog)) return 'It has still to be earned: that takes ' + earnedLine(seed.earned, catalog) + '.'
  const below = heldBy(seed, state, catalog)
  if (below) return 'It waits for a lower layer: the ' + LAYER_NAMES[below] + ' layer of the ' + (catalog.pack(seed.pack)?.title ?? seed.pack) + ' field is hollow, so plant there first.'
  return 'Plant it from the seed bag.'
}

export const needsText = (seed: Seed, catalog: Catalog): string =>
  seed.needs.map((id) => catalog.seed(id)?.name ?? id).join(' + ')

/* ---------- saplings ---------- */

/** The name of the tree that drops this seed, or null for a seed that is not a sapling. */
export const parentName = (seed: Seed, catalog: Catalog): string | null =>
  seed.saplingOf === null ? null : (catalog.seed(seed.saplingOf)?.name ?? seed.saplingOf)

/** "a sapling" or "3 saplings". */
const saplingCount = (n: number): string => (n === 1 ? 'a sapling' : n + ' saplings')

/** What to say after a harvest of the saplings it dropped, or null if the seed drops none. */
export function saplingNews(seed: Seed, catalog: Catalog): string | null {
  const dropped = catalog.saplingsOf(seed.id)
  if (dropped.length === 0) return null
  return 'It dropped ' + saplingCount(dropped.length) + ': ' + andList(dropped.map((s) => s.name)) + '. Find ' + (dropped.length === 1 ? 'it' : 'them') + ' in your seed bag.'
}

/** What a crop's sheet says about saplings: where the crop came from, and what a harvest of it drops or dropped. */
function saplingLines(crop: Crop, seed: Seed, catalog: Catalog): string[] {
  const lines: string[] = []
  const parent = parentName(seed, catalog)
  if (parent !== null) lines.push('A sapling of ' + parent + '.')
  const drops = catalog.saplingsOf(seed.id)
  if (drops.length === 0) return lines
  // Before the harvest they are a number and no more: what a tree drops is part of what the harvest gives.
  if (crop.perennial) lines.push('It dropped ' + saplingCount(drops.length) + ': ' + andList(drops.map((s) => s.name)) + '.')
  else lines.push('Harvesting it drops ' + drops.length + (drops.length === 1 ? ' sapling: a new seed that grows' : ' saplings: new seeds that grow') + ' from this one.')
  return lines
}

/* ---------- edges ---------- */

export interface EdgeView {
  /** The title of the field the seed borders. */
  field: string
  /** A tree stands there, so a harvest pays double today. */
  live: boolean
}

/** The edge a seed sits on, or null for a seed on none. */
export function edgeOf(seed: Seed, state: Pick<FarmState, 'crops'>, catalog: Catalog): EdgeView | null {
  if (seed.edge === null) return null
  return { field: catalog.pack(seed.edge)?.title ?? seed.edge, live: edgeLive(seed, state, catalog) }
}

/** "double" for 2, "triple" for 3, else "4 times over": how much more an edge pays, in words. */
export const timesOver = (n: number): string => (n === 2 ? 'double' : n === 3 ? 'triple' : n + ' times over')

/** A seed's edge in a sentence: what it will pay, what it pays, or just where it sits once the seed is a tree. */
export function edgeLine(seed: Seed, state: Pick<FarmState, 'crops'>, catalog: Catalog): string | null {
  const edge = edgeOf(seed, state, catalog)
  if (!edge) return null
  const where = 'On the edge of the ' + edge.field + ' field'
  if (cropOf(state, seed.id)?.perennial) return where + '.'
  return where + ': its harvest pays ' + timesOver(RULES.edge.times) + (edge.live ? '.' : ' once you have a tree there.')
}

/** How a seed's edge stands, in a few words. `waiting` is what to say while no tree stands in the field it borders. */
const edgeStatus = (seed: Seed, edge: EdgeView, state: Pick<FarmState, 'crops'>, waiting: string): string =>
  cropOf(state, seed.id)?.perennial ? 'harvested' : edge.live ? 'pays ' + timesOver(RULES.edge.times) : waiting

/** What a premium harvest of this seed pays on this farm, and the field it borders if that made it double. */
export function harvestPay(seed: Seed, state: Pick<FarmState, 'crops'>, catalog: Catalog): { coins: number; edge: string | null } {
  const edge = edgeOf(seed, state, catalog)
  return { coins: harvestCoins(seed, state, catalog), edge: edge?.live ? edge.field : null }
}

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

/* ---------- choosing what to grow ---------- */

export interface PickerPack {
  pack: string
  title: string
  color: string
  description: string
  /** How many seeds the pack holds, extras (wild seeds and saplings) left out. */
  seeds: number
  /** The farm already has this field. */
  open: boolean
  ticked: boolean
}

/** Every pack, for the sheet where a farmer chooses their fields. */
export function pickerView(catalog: Catalog, state: Pick<FarmState, 'fields'>, ticked: readonly string[]): PickerPack[] {
  return catalog.packs.map((p) => ({
    pack: p.pack, title: p.title, color: packColor(p), description: p.description ?? '',
    seeds: catalog.seedsOf(p.pack).filter((s) => !s.extra).length,
    open: Object.hasOwn(state.fields, p.pack), ticked: ticked.includes(p.pack),
  }))
}

/* ---------- seed bag ---------- */

export interface BagSeed {
  id: string
  name: string
  layer: string
  /** recall, solve, judged or artifact. */
  harvest: string
  status: 'ready' | 'held' | 'growing' | 'rooted'
  /** For a held seed, the name of the layer to plant in first. */
  below: string | null
  /** The title of the field it sits on the edge of, if it sits on one. */
  edge: string | null
  /** For a sapling, the name of the tree that dropped it. */
  sapling: string | null
  focus: boolean
  /** In the player's hand. Never true of a held seed: it cannot be planted, so it cannot be picked up. */
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
  /** Plantable seeds, seeds a lower layer holds back, and seeds in the ground: focus branch first, then by tier. */
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
      const status = seedStatus(seed, state, catalog)
      if (status === 'locked') { lockedCount++; continue }
      const below = status === 'held' ? heldBy(seed, state, catalog) : null
      seeds.push({
        id: seed.id, name: seed.name, layer: LAYER_NAMES[seed.layer], harvest: HARVEST_NAMES[seed.harvest], status,
        below: below && LAYER_NAMES[below], edge: edgeOf(seed, state, catalog)?.field ?? null, sapling: parentName(seed, catalog),
        focus: focusTitle !== null && seed.branch === focusId, selected: status === 'ready' && selected === seed.id,
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

/* ---------- earned seeds, and readiness ---------- */

export interface EarnedRow {
  id: string
  name: string
  pack: string
  /** What earns it, to finish "Earned by …". */
  line: string
  /** Trees counted so far, or the field's readiness today. */
  have: number
  want: number
  met: boolean
  /** Something it needs is not rooted either, so earning it does not make it plantable by itself. */
  locked: boolean
  /** The name of the hollow layer that holds it back under layer balance, if one does. */
  held: string | null
}

/** Of these seeds, the ones that have to be earned and are not in the ground yet. */
function earnedRows(seeds: readonly Seed[], state: FarmState, catalog: Catalog): EarnedRow[] {
  return seeds.flatMap((seed): EarnedRow[] => {
    const progress = earnedProgress(seed, state, catalog)
    if (!seed.earned || !progress || cropOf(state, seed.id)) return []
    const below = heldBy(seed, state, catalog)
    return [{ id: seed.id, name: seed.name, pack: seed.pack, line: earnedLine(seed.earned, catalog), ...progress, locked: !available(seed, state), held: below && LAYER_NAMES[below] }]
  })
}

/** A seed that layer balance holds back. */
export interface HeldRow {
  id: string
  name: string
  /** The name of its own layer. */
  layer: string
  /** The name of the hollow layer to plant in first. */
  below: string
}

export interface ReadinessRow {
  pack: string
  title: string
  color: string
  /** Trees standing today, of the seeds that count (wild seeds and saplings do not). */
  rooted: number
  total: number
  /** Crops in the ground that are not trees yet. */
  growing: number
  /** Null for a field with no end: it has no number and no bar. */
  readiness: {
    percent: number
    bar: number
    atBar: boolean
    /** Names of the layers nothing stands in. */
    hollow: string[]
    layers: { layer: Layer; name: string; rooted: number; total: number }[]
  } | null
}

export interface ReadinessView {
  /** One per field the farm has, in pack order. */
  rows: ReadinessRow[]
  /** How many fields are at their bar, of how many have one. */
  atBar: number
  withBar: number
  earned: EarnedRow[]
}

/** How ready each of the farm's fields is, and what its seeds have still to earn. */
export function readinessView(state: FarmState, catalog: Catalog): ReadinessView {
  const packs = catalog.packs.filter((p) => Object.hasOwn(state.fields, p.pack))
  const rows = packs.map((p): ReadinessRow => {
    const counts = new Set(catalog.seedsOf(p.pack).filter((s) => !s.extra).map((s) => s.id))
    const crops = state.crops.filter((c) => counts.has(c.seed))
    const r = readiness(p.pack, state, catalog)
    return {
      pack: p.pack, title: p.title, color: packColor(p), total: counts.size,
      rooted: crops.filter((c) => c.perennial && !c.wilted).length,
      growing: crops.filter((c) => !c.perennial).length,
      readiness: r && {
        percent: r.percent, bar: r.bar, atBar: r.atBar, hollow: r.hollow.map((l) => LAYER_NAMES[l]),
        layers: r.layers.map((l) => ({ layer: l.layer, name: LAYER_NAMES[l.layer], rooted: l.rooted, total: l.total })),
      },
    }
  })
  return {
    rows,
    atBar: rows.filter((r) => r.readiness?.atBar).length,
    withBar: rows.filter((r) => r.readiness).length,
    earned: earnedRows(packs.flatMap((p) => catalog.seedsOf(p.pack)).filter((s) => visible(s, state)), state, catalog),
  }
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
  /** Dropped by a tree at its harvest. */
  sapling: boolean
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

/** How a guild stands on the farm today. */
export interface GuildStanding {
  rooted: number
  total: number
  /** Every member stands as a tree, so the guild pays. */
  whole: boolean
  /** Names of the wilted trees that hold its pay back. Empty until every member is rooted. */
  dragged: string[]
}

export interface TreeGuild extends GuildStanding {
  id: string
  title: string
  /** `name` is null for a wild seed that has not been found yet, and for a sapling that has not dropped. */
  members: { id: string; name: string | null; status: SeedStatus; sapling: boolean }[]
}

/** "A", "A and B", "A, B and C". */
const andList = (items: readonly string[]): string =>
  items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]

export function guildStanding(g: GuildDef, state: Pick<FarmState, 'crops'>, catalog: Catalog): GuildStanding {
  const have = rooted(state)
  return {
    rooted: g.seeds.filter((id) => have.has(id)).length, total: g.seeds.length, whole: guildWhole(g, state),
    dragged: dragging(g, state).map((id) => catalog.seed(id)?.name ?? id),
  }
}

/** How a guild stands, in a few words. `coins` is what a whole one pays. */
export function guildStatus(g: GuildStanding, coins: number): string {
  if (g.whole) return 'whole · pays ' + coins + ' coins a check-in'
  if (g.dragged.length) return andList(g.dragged) + (g.dragged.length === 1 ? ' has' : ' have') + ' wilted · no pay until revived'
  return g.rooted + ' of ' + g.total + ' rooted'
}

export interface GuildNews {
  /** What the seed's guilds just paid. */
  coins: number
  /** What to tell the farmer about them, a sentence each. */
  lines: string[]
}

/**
 * What a seed's guilds did at a harvest or a check-in. `state` is the farm afterwards. After work that passed, each
 * whole guild has paid; after a check-in that wilted a tree, the guilds it now drags are named.
 */
export function guildNews(seed: Seed, state: Pick<FarmState, 'crops'>, catalog: Catalog, ok: boolean): GuildNews {
  if (ok) {
    const whole = wholeGuilds(seed.id, state, catalog)
    return { coins: whole.length * RULES.guild.coins, lines: whole.map((g) => 'The ' + g.title + ' guild is whole: +' + RULES.guild.coins + ' coins.') }
  }
  // Every wilted member is named, not just this one: reviving one of two does not bring the pay back.
  const lines = catalog.guildsOf(seed.id).flatMap((g) => {
    const wilted = dragging(g, state)
    if (!wilted.includes(seed.id)) return []
    return ['The ' + g.title + ' guild pays nothing until ' + andList(wilted.map((id) => catalog.seed(id)?.name ?? id)) + (wilted.length === 1 ? ' is' : ' are') + ' revived.']
  })
  return { coins: 0, lines }
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
  /** Seeds in the tree that will drop saplings when they are harvested, and how many: a number, never which. */
  drops: { id: string; name: string; count: number }[]
  /** Seeds of this field that sit on the edge of another (`field`), and how each edge stands: "pays double", "no tree there yet" or "harvested". */
  borders: { id: string; name: string; field: string; status: string }[]
  /** Seeds of the farm's other fields (`field`) that sit on the edge of this one: "pays double", "needs a tree here" or "harvested". */
  bordered: { id: string; name: string; field: string; status: string }[]
  /**
   * Seeds you could jump the fence to: visible, not planted, and missing something they need. A jump clears only that:
   * `earned` is what the seed must also be earned by, if it is not yet, and `held` is the name of the hollow layer it
   * would still wait for.
   */
  locked: { id: string; name: string; needs: string; earned: string | null; held: string | null }[]
  /** Seeds of this field that have to be earned and are not in the ground yet. No jump clears these. */
  earned: EarnedRow[]
  /** The field's readiness in a line, or null for a field with no end. */
  readiness: { percent: number; bar: number; atBar: boolean; hollow: string[] } | null
  /** Seeds that could be planted but for layer balance, each with its own layer and the layer to plant in first. */
  held: HeldRow[]
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
        const status = seedStatus(seed, state, catalog)
        const node: TreeNode = {
          id: seed.id, name: seed.name, lines: splitName(seed.name), status, wild: seed.wild, sapling: seed.saplingOf !== null,
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
    // A sapling is tied to the tree that dropped it, whether or not it also needs it.
    const from = seed.saplingOf !== null && !seed.needs.includes(seed.saplingOf) ? [...seed.needs, seed.saplingOf] : seed.needs
    for (const need of from) {
      const from = at.get(need)
      if (from && to) edges.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, rooted: have.has(need) })
    }
  }

  const guilds: TreeGuild[] = (pack.guilds ?? []).map((g) => {
    const members = g.seeds.flatMap((id) => {
      const seed = catalog.seed(id)
      if (!seed) return []
      return [{ id, name: visible(seed, state) ? seed.name : null, status: seedStatus(seed, state, catalog), sapling: seed.saplingOf !== null }]
    })
    return { id: g.id, title: g.title, members, ...guildStanding(g, state, catalog) }
  })

  const ready = readiness(packId, state, catalog)
  // A jump clears what a seed needs and nothing else, so a seed that only has to be earned is not offered one.
  const locked = seeds
    .filter((s) => !cropOf(state, s.id) && !available(s, state))
    .map((s) => {
      const below = heldBy(s, state, catalog)
      return { id: s.id, name: s.name, needs: needsText(s, catalog), earned: s.earned && !isEarned(s, state, catalog) ? earnedLine(s.earned, catalog) : null, held: below && LAYER_NAMES[below] }
    })

  return {
    pack: packId, title: pack.title, color: packColor(pack), width: TREE_WIDTH, height: y, columnWidth,
    branches: pack.branches.map((b, i) => ({ id: b.id, title: b.title, focus: state.focus[packId] === b.id, x: (i + 0.5) * columnWidth })),
    nodes, edges, guilds, locked, earned: earnedRows(seeds, state, catalog),
    drops: seeds.flatMap((s) => {
      const count = catalog.saplingsOf(s.id).length
      return count > 0 && !have.has(s.id) ? [{ id: s.id, name: s.name, count }] : []
    }),
    borders: seeds.flatMap((s) => {
      const edge = edgeOf(s, state, catalog)
      return edge ? [{ id: s.id, name: s.name, field: edge.field, status: edgeStatus(s, edge, state, 'no tree there yet') }] : []
    }),
    bordered: catalog.packs.filter((p) => p.pack !== packId && Object.hasOwn(state.fields, p.pack)).flatMap((p) =>
      catalog.seedsOf(p.pack).filter((s) => s.edge === packId && visible(s, state)).flatMap((s) => {
        const edge = edgeOf(s, state, catalog)
        return edge ? [{ id: s.id, name: s.name, field: p.title, status: edgeStatus(s, edge, state, 'needs a tree here') }] : []
      })),
    held: seeds.flatMap((s): HeldRow[] => {
      const below = seedStatus(s, state, catalog) === 'held' ? heldBy(s, state, catalog) : null
      return below ? [{ id: s.id, name: s.name, layer: LAYER_NAMES[s.layer], below: LAYER_NAMES[below] }] : []
    }),
    readiness: ready && { percent: ready.percent, bar: ready.bar, atBar: ready.atBar, hollow: ready.hollow.map((l) => LAYER_NAMES[l]) },
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
  /** The guilds it is in and how each stands: "Consensus core guild: 2 of 4 rooted". */
  guilds: string[]
  /** The edge it sits on and what that pays, in a sentence, or null. */
  edge: string | null
  /** Where a sapling came from, and what a harvest of this crop drops or dropped. */
  saplings: string[]
}

const WATER_WORK: Record<WaterKind, string> = { recall: 'a recall card', explain: 'an explanation in your own words' }

/** What the crop sheet shows for a crop on a given day. */
export function cropView(crop: Crop, state: Pick<FarmState, 'day' | 'crops'>, catalog: Catalog): CropView | null {
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
    guilds: catalog.guildsOf(seed.id).map((g) => g.title + ' guild: ' + guildStatus(guildStanding(g, state, catalog), RULES.guild.coins)),
    edge: edgeLine(seed, state, catalog),
    saplings: saplingLines(crop, seed, catalog),
  }
}
