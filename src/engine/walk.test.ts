import { describe, expect, it } from 'vitest'
import { smallCatalog as cat, smallFarm, started, run } from './fixtures'
import { allowed, check, fold, initialState, parseEvent, refusedCount } from './fold'
import { RULES } from './rules'
import type { FarmEvent, FarmState } from './types'
import { WALK_QUESTIONS, isWalkDay, nextWalkDay, walkedToday } from './walk'

const onDay = (day: number): FarmState => ({ ...smallFarm(), day })
const walk = (answers: string[] = ['The corn is taller than me.', '', 'Leave the squash alone.'], asked: string[] = [...WALK_QUESTIONS]): FarmEvent => ({ type: 'walked', asked, answers })

describe('walk days', () => {
  it('come every seventh day of the farm, and never on its first days', () => {
    expect([1, 6, 7, 8, 13, 14, 21, 0].map(isWalkDay)).toEqual([false, false, true, false, false, true, true, false])
    expect(RULES.walk.every).toBe(7)
  })

  it('names the next one', () => {
    expect([1, 6, 7, 8, 14].map(nextWalkDay)).toEqual([7, 7, 14, 14, 21])
  })

  it('asks three questions, each short enough for a log to hold', () => {
    expect(WALK_QUESTIONS).toHaveLength(3)
    for (const q of WALK_QUESTIONS) expect(q.length).toBeLessThanOrEqual(RULES.walk.asked)
  })
})

describe('walked', () => {
  it('keeps the questions asked and the answers given, trimmed, with the day', () => {
    const s = run(cat, [walk(['  The corn is taller than me.  ', '', 'Leave the squash alone.'])], onDay(7))
    expect(s.walks).toEqual([{ day: 7, asked: [...WALK_QUESTIONS], answers: ['The corn is taller than me.', '', 'Leave the squash alone.'] }])
    expect(walkedToday(s)).toBe(true)
  })

  it('is no task: it costs no energy and no coins, and pays none', () => {
    const before = onDay(7)
    const s = run(cat, [walk()], before)
    expect({ coins: s.coins, energy: s.energy, barrel: s.barrel }).toEqual({ coins: before.coins, energy: before.energy, barrel: before.barrel })
  })

  it('asks for one answer at least, and leaves the others to the walker', () => {
    expect(check(onDay(7), walk(['', '  ', '']), cat)).toBe('Write an answer to at least one of the questions.')
    expect(check(onDay(7), walk(['', '', 'One.']), cat)).toBeNull()
    expect(check(onDay(7), walk(['x'.repeat(RULES.textMax + 1), '', '']), cat)).toBe('Keep each answer under 5000 characters.')
  })

  it('is offered on a walk day, once', () => {
    expect(check(onDay(6), walk(), cat)).toBe('The next walk is on day 7.')
    expect(check(onDay(8), walk(), cat)).toBe('The next walk is on day 14.')
    const walked = run(cat, [walk()], onDay(7))
    expect(check(walked, walk(), cat)).toBe("You have taken today's walk.")
    expect(walkedToday(onDay(7))).toBe(false)
  })

  it('needs a farm, as many answers as questions, and questions that are short', () => {
    expect(check(initialState(), walk(), cat)).toBe('There is no farm to walk round.')
    expect(parseEvent({ type: 'walked', asked: ['a', 'b'], answers: ['only one'] })).toBeNull()
    expect(parseEvent({ type: 'walked', asked: [], answers: [] })).toBeNull()
    expect(parseEvent({ type: 'walked', asked: ['a'], answers: [7] })).toBeNull()
    expect(parseEvent({ type: 'walked', asked: Array(RULES.walk.most + 1).fill('q'), answers: Array(RULES.walk.most + 1).fill('a') })).toBeNull()
    expect(check(onDay(7), walk(['a'], ['q'.repeat(RULES.walk.asked + 1)]), cat)).toBe('A walk asks short questions.')
    expect(check(onDay(7), walk(['a'], ['  ']), cat)).toBe('A walk asks short questions.')
  })

  it('is asked of what is done today and never of a saved farm: a walk on any day, or a second one, replays', () => {
    const e = walk()
    expect(check(onDay(5), e, cat)).not.toBeNull()
    expect(allowed(onDay(5), e, cat)).toBeNull()
    const log = [started, e, walk(['Again.'], ['A question the game no longer asks?'])]
    expect(refusedCount(log, cat)).toBe(0)
    expect(fold(log, cat).walks.map((w) => [w.day, w.answers.length])).toEqual([[1, 3], [1, 1]])
  })

  it('starts every farm with no walks', () => {
    expect(initialState().walks).toEqual([])
    expect(run(cat, [started]).walks).toEqual([])
  })
})
