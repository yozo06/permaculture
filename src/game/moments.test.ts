import { describe, expect, it } from 'vitest'
import { MOMENT_BOX, MOMENT_MS, momentDots, type MomentKind } from './moments'

const KINDS = Object.keys(MOMENT_MS) as MomentKind[]
/** Every frame of a moment at 60 frames a second. */
const frames = (kind: MomentKind): number[] => Array.from({ length: Math.ceil(MOMENT_MS[kind] / 16) }, (_, i) => i * 16)

describe('momentDots', () => {
  it('shows something the moment it begins and nothing once it is over', () => {
    for (const kind of KINDS) {
      expect(momentDots(kind, 0).length, kind).toBeGreaterThan(0)
      expect(momentDots(kind, MOMENT_MS[kind]), kind).toEqual([])
      expect(momentDots(kind, MOMENT_MS[kind] * 10), kind).toEqual([])
    }
  })

  it('shows nothing before it begins, or for a time that is not a number', () => {
    for (const kind of KINDS) {
      expect(momentDots(kind, -1), kind).toEqual([])
      expect(momentDots(kind, Number.NaN), kind).toEqual([])
    }
  })

  it('keeps every dot on a whole pixel, near the crop', () => {
    for (const kind of KINDS) for (const age of frames(kind)) for (const d of momentDots(kind, age)) {
      expect(Number.isInteger(d.x) && Number.isInteger(d.y), kind + ' at ' + age).toBe(true)
      expect(d.x, kind + ' at ' + age).toBeGreaterThanOrEqual(MOMENT_BOX.left)
      expect(d.x, kind + ' at ' + age).toBeLessThanOrEqual(MOMENT_BOX.right)
      expect(d.y, kind + ' at ' + age).toBeGreaterThanOrEqual(MOMENT_BOX.top)
      expect(d.y, kind + ' at ' + age).toBeLessThanOrEqual(MOMENT_BOX.bottom)
    }
  })

  it('only ever loses dots as it goes on', () => {
    for (const kind of KINDS) {
      const counts = frames(kind).map((age) => momentDots(kind, age).length)
      for (let i = 1; i < counts.length; i++) expect(counts[i], kind + ' frame ' + i).toBeLessThanOrEqual(counts[i - 1] ?? 0)
    }
  })

  it('moves: no two frames a tenth of a second apart look the same', () => {
    for (const kind of KINDS) for (let age = 0; age + 100 < MOMENT_MS[kind]; age += 100) {
      expect(momentDots(kind, age + 100), kind + ' at ' + age).not.toEqual(momentDots(kind, age))
    }
  })

  it('throws a splash up from the ground and lets it fall back', () => {
    const top = (age: number): number => Math.min(...momentDots('splash', age).map((d) => d.y))
    expect(Math.max(...momentDots('splash', 0).map((d) => Math.abs(d.y)))).toBeLessThanOrEqual(1)
    expect(Math.min(...frames('splash').map(top))).toBeLessThanOrEqual(-6)
    for (const d of momentDots('splash', MOMENT_MS.splash - 1)) expect(d.y).toBeGreaterThanOrEqual(-2)
    for (const age of frames('splash')) for (const d of momentDots('splash', age)) expect(d.tone === 'water' || d.tone === 'spray').toBe(true)
  })

  it('sends a harvest upward in the colour of the field', () => {
    const height = (age: number): number => Math.min(...momentDots('harvest', age).map((d) => d.y))
    expect(height(MOMENT_MS.harvest / 2)).toBeLessThan(height(0))
    expect(momentDots('harvest', 0).some((d) => d.tone === 'field')).toBe(true)
  })

  it('spreads a ring outward when a crop grows', () => {
    const spread = (age: number): number => Math.max(...momentDots('grow', age).map((d) => Math.abs(d.x)))
    expect(spread(MOMENT_MS.grow / 2)).toBeGreaterThan(spread(0))
  })
})
