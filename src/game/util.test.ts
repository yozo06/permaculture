import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { esc, shuffle } from './util'

describe('shuffle', () => {
  it('returns a permutation of its input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.integer({ min: 0, max: 1_000_000 }), (items, seed) => {
        let s = seed
        const rand = () => {
          s = (s * 1103515245 + 12345) % 2147483648
          return s / 2147483648
        }
        const out = shuffle(items, rand)
        expect(out).toHaveLength(items.length)
        expect([...out].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b))
      }),
    )
  })

  it('does not change the input', () => {
    const items = [1, 2, 3, 4]
    shuffle(items)
    expect(items).toEqual([1, 2, 3, 4])
  })
})

describe('esc', () => {
  it('escapes the characters that matter in HTML', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })

  it('turns other values into text', () => {
    expect(esc(12)).toBe('12')
  })
})
