// What a harvest or a check-in pays beyond its plain coins: a share from each whole guild the seed is in, and the
// harvest over again for a seed on the edge of another field.
// Unlike readiness, this is part of replaying a farm: the coins are in its state. So it only ever adds, and nothing
// in the rules refuses a farm for having more. packs/lock.json guards the pack data read here.
import type { Catalog, Seed } from './catalog'
import { RULES, cropOf } from './rules'
import type { FarmState, GuildDef } from './types'

type Crops = Pick<FarmState, 'crops'>

/** A guild is whole while every member stands as a tree: rooted, and not wilted by a wrong check-in. */
export const guildWhole = (g: GuildDef, s: Crops): boolean =>
  g.seeds.every((id) => {
    const c = cropOf(s, id)
    return c !== undefined && c.perennial && !c.wilted
  })

/**
 * The members dragging a guild: wilted trees, when every member is rooted and the guild would otherwise be whole.
 * Empty while a member has still to be rooted: then it is the missing tree that the guild waits for.
 */
export function dragging(g: GuildDef, s: Crops): string[] {
  const crops = g.seeds.map((id) => cropOf(s, id))
  if (!crops.every((c) => c !== undefined && c.perennial)) return []
  return crops.flatMap((c) => (c && c.wilted ? [c.seed] : []))
}

/** The guilds this seed is in that are whole today. */
export const wholeGuilds = (seedId: string, s: Crops, catalog: Catalog): GuildDef[] =>
  catalog.guildsOf(seedId).filter((g) => guildWhole(g, s))

/** What the seed's guilds pay for a harvest or a check-in that leaves the farm as `s`: a share from each whole one. */
export const guildCoins = (seedId: string, s: Crops, catalog: Catalog): number =>
  RULES.guild.coins * wholeGuilds(seedId, s, catalog).length

/**
 * The edge this seed sits on is live: a tree is rooted in the field it borders. An edge has two sides, so it pays
 * only on a farm that has learned something on the other one. A wilted tree is rooted all the same.
 */
export const edgeLive = (seed: Seed, s: Crops, catalog: Catalog): boolean =>
  seed.edge !== null && s.crops.some((c) => c.perennial && catalog.seed(c.seed)?.pack === seed.edge)

/** What a premium harvest of this seed pays on the farm as it stands: the harvest, and again on a live edge. */
export const harvestCoins = (seed: Seed, s: Crops, catalog: Catalog): number =>
  RULES.harvest.coins * (edgeLive(seed, s, catalog) ? RULES.edge.times : 1)
