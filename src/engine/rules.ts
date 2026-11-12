// Every number and predicate the game plays by. docs/design.md and the Almanac are checked against RULES.
import type { Catalog, Seed } from './catalog'
import type { Crop, FarmState } from './types'

export const RULES = {
  energyMax: 90,
  start: { day: 1, coins: 140, barrel: 0 },
  plant: { energy: 10, coins: 10 },
  newSeedsPerDay: 2,
  water: { energy: 6 },
  harvest: { energy: 15, coins: 30 },
  testOut: { energy: 10 },
  forage: { energy: 5, coins: 3 },
  fence: { open: 25, forest: 40 },
  barrel: { fillAt: 30, max: 5 },
  wiltAfter: 2,
  intervals: [1, 2, 3, 4, 5],
  perennialInterval: 10,
  zones: ['Z1', 'Z2', 'Z2', 'Z3', 'Z3'],
  perennialZone: 'Z4',
  maxStage: 4,
  /** Characters (after trimming) of notes needed to plant, and of an explanation to water. */
  notesMin: 40,
  explainMin: 80,
  /** Characters needed for a harvest write-up, and for the link or description of an artifact. */
  writeMin: 80,
  proofMin: 8,
  /** The most any one piece of writing may hold, so a log cannot grow without bound. */
  textMax: 5000,
  /** A farm's name, in characters after trimming. */
  farmName: { max: 24 },
  /** How many neighbours a game keeps, and how many days after a picture of a farm was made it is forgotten. */
  neighbours: { max: 24, forgetDays: 60 },
  /** The bar a field's readiness is held to when neither its pack nor its farmer sets one, and what a farmer may set. */
  readiness: { bar: 80, min: 1, max: 100 },
  defaultRubric: [
    "Says what it is in plain words, not the source's",
    'Says why it matters: the problem it solves or the mistake it prevents',
    'Gives a concrete example, or a case where it does not apply',
  ],
} as const

/** Days between waterings. */
export const interval = (c: Pick<Crop, 'perennial' | 'stage'>): number =>
  c.perennial ? RULES.perennialInterval : (RULES.intervals[c.stage] ?? RULES.intervals[RULES.maxStage])

export const zone = (c: Pick<Crop, 'perennial' | 'stage'>): string =>
  c.perennial ? RULES.perennialZone : (RULES.zones[c.stage] ?? RULES.zones[RULES.maxStage])

export const thirsty = (c: Crop, day: number): boolean => !c.wilted && day >= c.due
/** A wilted crop can be brought back once its day has come. */
export const revivable = (c: Crop, day: number): boolean => c.wilted && day >= c.due
export const ripe = (c: Crop, day: number): boolean =>
  c.stage === RULES.maxStage && !c.wilted && !c.perennial && !thirsty(c, day)

export const cropOf = (s: Pick<FarmState, 'crops'>, seedId: string): Crop | undefined => s.crops.find((c) => c.seed === seedId)

/** Seed ids of perennial crops: the ones that count as rooted. */
export const rooted = (s: Pick<FarmState, 'crops'>): Set<string> => new Set(s.crops.filter((c) => c.perennial).map((c) => c.seed))

/** Wild seeds stay hidden until they have been domesticated. */
export const visible = (seed: Seed, s: Pick<FarmState, 'volunteers'>): boolean => !seed.wild || s.volunteers.includes(seed.id)

/** Can this seed be planted now: it is visible and unlocked, or everything it needs is rooted. */
export function available(seed: Seed, s: Pick<FarmState, 'crops' | 'unlocked' | 'volunteers'>): boolean {
  if (!visible(seed, s)) return false
  if (s.unlocked.includes(seed.id)) return true
  const have = rooted(s)
  return seed.needs.every((n) => have.has(n))
}

/** Energy this field may still spend today; Infinity when the pack has no cap. */
export const capLeft = (s: Pick<FarmState, 'energyMax' | 'today'>, packId: string, catalog: Catalog): number =>
  catalog.capOf(packId, s.energyMax) - (s.today.spent[packId] ?? 0)
