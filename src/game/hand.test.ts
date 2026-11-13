import { describe, expect, it } from 'vitest'
import { cropSprite } from './art/sprites'
import { frontmost } from './hand'

describe('what a tap lands on', () => {
  // Two tiles, one straight in front of the other: the front one's top corner is 16 pixels lower on the screen.
  const back = { sx: 100, sy: 50 }, front = { sx: 100, sy: 66 }
  const sprout = cropSprite('herb', 0, false), tree = cropSprite('canopy', 4, true)

  it('is the sprout, when the tap is on a sprout with another sprout in the tile in front', () => {
    const things = [{ what: 'back', ...back, sprite: sprout, s: 2 }, { what: 'front', ...front, sprite: sprout, s: 4 }]
    // A crop's foot is 11 pixels below its tile's top corner.
    expect(frontmost(things, 100, 50 + 10)).toBe('back')
    expect(frontmost(things, 100, 66 + 10)).toBe('front')
  })

  it('is nothing, in the middle of an empty tile with a sprout in the tile in front', () => {
    expect(frontmost([{ what: 'front', ...front, sprite: sprout, s: 4 }], 100, 50 + 8)).toBeNull()
  })

  it('is the tree, when the tap is on the crown of a tree that rises over the tile behind it: what you see is what you tap', () => {
    const things = [{ what: 'front', ...front, sprite: tree, s: 4 }, { what: 'back', ...back, sprite: sprout, s: 2 }]
    expect(frontmost(things, 100, 50 + 2)).toBe('front')
    // Even where the sprout behind it is: the crown is drawn over it.
    expect(frontmost(things, 100, 50 + 10)).toBe('front')
    expect(frontmost([...things].reverse(), 100, 50 + 10)).toBe('front')
  })

  it('reaches a finger\'s margin past what is drawn, and no further', () => {
    const things = [{ what: 'it', ...back, sprite: sprout, s: 2 }]
    expect(frontmost(things, 100 + 3, 50 + 10)).toBe('it')
    expect(frontmost(things, 100 + 6, 50 + 10)).toBeNull()
  })

  it('is never a thing whose sprite the sheet does not have', () => {
    expect(frontmost([{ what: 'ghost', ...back, sprite: 'no/such', s: 9 }], 100, 55)).toBeNull()
  })
})
