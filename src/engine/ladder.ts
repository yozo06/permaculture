// The depth ladder: stages change the kind of work. Stages 0 to 2 are recall cards, stage 3 is explaining in your own
// words against a rubric, stage 4 is harvest. Pure: which work, which questions, and what counts as a pass.
import type { Seed } from './catalog'
import { RULES } from './rules'
import type { Crop, Mcq } from './types'

export type WaterKind = 'recall' | 'explain'

/** Stages count from 0. Recall covers stages 0 to 2 (shown 1 to 3 of 5), explain is stage 3, harvest is stage 4. */
export const LADDER = { recallLast: 2, explain: 3, harvest: RULES.maxStage } as const

const hasCards = (seed: Seed): boolean => seed.questions.water.length > 0 || seed.questions.harvest.length > 0

/** What a thirsty crop asks for. Recall needs cards: a seed with none (an artifact seed) explains at every stage. */
export function waterWork(crop: Pick<Crop, 'perennial' | 'stage'>, seed: Seed): WaterKind {
  if (crop.perennial) return hasCards(seed) ? 'recall' : 'explain'
  if (crop.stage <= LADDER.recallLast) return seed.questions.water.length > 0 ? 'recall' : 'explain'
  return 'explain'
}

/** The cards a recall watering draws from: a perennial check-in uses the harder harvest cards when there are any. */
export function recallBank(crop: Pick<Crop, 'perennial'>, seed: Seed): Mcq[] {
  const { water, harvest } = seed.questions
  return crop.perennial && harvest.length > 0 ? harvest : water.length > 0 ? water : harvest
}

/** Rubric lines the player rates an explanation against: the seed's own, else the default. */
export const explainChecklist = (seed: Seed): string[] => (seed.rubric.length > 0 ? seed.rubric : [...RULES.defaultRubric])

/** More than half the lines is a pass. */
export const explainPasses = (ticked: number, of: number): boolean => of > 0 && 2 * ticked > of
/** A write-up must meet every line. */
export const writePasses = (ticked: number, of: number): boolean => of > 0 && ticked === of

const ARTIFACT_CHECKLIST: readonly string[] = [
  'It exists outside this game: a link, a file, or a decision someone acted on',
  'It does what the prompt asks',
]

export type HarvestWork =
  | { kind: 'recall'; bank: Mcq[] }
  /** `proof` is true for an artifact: the player gives a link or a description, not an essay. */
  | { kind: 'write'; checklist: string[]; proof: boolean; minChars: number }

/** What harvesting (or jumping the fence for) a seed asks for. */
export function harvestWork(seed: Seed): HarvestWork {
  if (seed.harvest === 'recall') {
    const bank = seed.questions.harvest.length > 0 ? seed.questions.harvest : seed.questions.water
    if (bank.length > 0) return { kind: 'recall', bank }
  }
  if (seed.harvest === 'artifact') return { kind: 'write', checklist: [...ARTIFACT_CHECKLIST], proof: true, minChars: RULES.proofMin }
  return { kind: 'write', checklist: explainChecklist(seed), proof: false, minChars: RULES.writeMin }
}

const sum = (s: string): number => [...s].reduce((n, ch) => n + ch.charCodeAt(0), 0)

/** The prompt for a seed on a day. The same seed on the same day always gives the same one. */
export function pickPrompt(seed: Seed, day: number): string | null {
  if (seed.prompts.length === 0) return null
  return seed.prompts[(sum(seed.id) + Math.max(0, day)) % seed.prompts.length] ?? null
}

/** The name of the rung a crop is on. */
export function rungName(crop: Pick<Crop, 'perennial' | 'stage'>): 'Sprout' | 'Recall' | 'Explain' | 'Harvest' | 'Perennial' {
  if (crop.perennial) return 'Perennial'
  if (crop.stage === 0) return 'Sprout'
  if (crop.stage <= LADDER.recallLast) return 'Recall'
  return crop.stage === LADDER.explain ? 'Explain' : 'Harvest'
}
