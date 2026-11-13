// The weekly walk: observe and interact. Every few days the game stops asking for work and asks three questions.
import { RULES } from './rules'
import type { FarmState } from './types'

/** What a walk asks. The answers are kept with the questions, so these can change without touching a walk already taken. */
export const WALK_QUESTIONS: readonly string[] = [
  'What did you notice on the farm this week?',
  'What is wilting or crowded, and what is it telling you?',
  'What will you tend next week, and what will you leave alone?',
]

/** A walk is offered on every `RULES.walk.every`th day of the farm. */
export const isWalkDay = (day: number): boolean => day >= RULES.walk.every && day % RULES.walk.every === 0

/** The first walk day after `day`. */
export const nextWalkDay = (day: number): number => (Math.floor(Math.max(0, day) / RULES.walk.every) + 1) * RULES.walk.every

export const walkedToday = (s: Pick<FarmState, 'day' | 'walks'>): boolean => s.walks.some((w) => w.day === s.day)
