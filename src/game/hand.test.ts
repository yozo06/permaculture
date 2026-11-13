import { describe, expect, it } from 'vitest'
import { cropSprite } from './art/sprites'
import { type Hand, type Said, drop, frontmost, idle, lift, move, press, rehold, wheelStep } from './hand'

/** Feed a hand a run of steps and keep what it said at each. */
function run(steps: ((h: Hand) => [Hand, Said])[]): { hand: Hand; said: Said[] } {
  let hand = idle()
  const said: Said[] = []
  for (const step of steps) { const [next, s] = step(hand); hand = next; said.push(s) }
  return { hand, said }
}
const at = (x: number, y: number) => ({ x, y })

describe('one finger', () => {
  it('that lifts where it came down is a tap, there', () => {
    const { said } = run([(h) => press(h, 1, at(50, 60)), (h) => lift(h, 1, at(51, 60))])
    expect(said).toEqual([{ kind: 'hold' }, { kind: 'tap', at: at(51, 60) }])
  })

  it('that shakes a little is still a tap', () => {
    const { said } = run([(h) => press(h, 1, at(50, 60)), (h) => move(h, 1, at(55, 64)), (h) => lift(h, 1, at(55, 64))])
    expect(said).toEqual([{ kind: 'hold' }, null, { kind: 'tap', at: at(55, 64) }])
  })

  it('that moves more than eight points is a drag, measured from where it came down, and its lift is no tap', () => {
    const { said } = run([(h) => press(h, 1, at(50, 60)), (h) => move(h, 1, at(59, 60)), (h) => move(h, 1, at(30, 70)), (h) => lift(h, 1, at(30, 70))])
    expect(said).toEqual([{ kind: 'hold' }, { kind: 'pan', dx: 9, dy: 0 }, { kind: 'pan', dx: -20, dy: 10 }, { kind: 'dropped' }])
  })

  it('that was never seen to come down says nothing', () => {
    expect(run([(h) => move(h, 7, at(1, 1)), (h) => lift(h, 7, at(1, 1))]).said).toEqual([null, null])
  })
})

describe('two fingers', () => {
  it('are a pinch: how far apart they are now against how far they began, about the point between them', () => {
    const { said } = run([(h) => press(h, 1, at(100, 100)), (h) => press(h, 2, at(200, 100)), (h) => move(h, 2, at(300, 100))])
    expect(said).toEqual([{ kind: 'hold' }, { kind: 'pinch-began' }, { kind: 'pinch', by: 2, at: at(200, 100) }])
  })

  it('leave the one that stays able to drag the farm, and its lift is no tap', () => {
    const { said } = run([
      (h) => press(h, 1, at(100, 100)), (h) => press(h, 2, at(200, 100)), (h) => lift(h, 1, at(100, 100)),
      (h) => move(h, 2, at(203, 104)), (h) => lift(h, 2, at(203, 104)),
    ])
    expect(said).toEqual([{ kind: 'hold' }, { kind: 'pinch-began' }, { kind: 'hold' }, { kind: 'pan', dx: 3, dy: 4 }, { kind: 'dropped' }])
  })

  it('are not disturbed by a third', () => {
    const { said } = run([(h) => press(h, 1, at(100, 100)), (h) => press(h, 2, at(200, 100)), (h) => press(h, 3, at(0, 0)), (h) => move(h, 2, at(150, 100))])
    expect(said.slice(2)).toEqual([null, { kind: 'pinch', by: 0.5, at: at(125, 100) }])
  })

  it('stay a pinch when a third comes and goes', () => {
    const { said, hand } = run([
      (h) => press(h, 1, at(100, 100)), (h) => press(h, 2, at(200, 100)), (h) => press(h, 3, at(0, 0)), (h) => lift(h, 3, at(0, 0)),
      (h) => move(h, 2, at(300, 100)),
    ])
    expect(said.slice(3)).toEqual([null, { kind: 'pinch', by: 2, at: at(200, 100) }])
    expect(hand.hold).toBeNull()
  })

  it('begin the pinch again when one of them lifts and a third is still down: the new pair is measured from where it is', () => {
    const { said } = run([
      (h) => press(h, 1, at(100, 100)), (h) => press(h, 2, at(200, 100)), (h) => press(h, 3, at(200, 300)), (h) => lift(h, 1, at(100, 100)),
      (h) => move(h, 2, at(200, 200)),
    ])
    // Fingers 2 and 3 were 200 apart when they became the pair, and are 100 apart now: half, not a jump.
    expect(said.slice(3)).toEqual([{ kind: 'pinch-began' }, { kind: 'pinch', by: 0.5, at: at(200, 250) }])
  })

  it('that start on the same point do not divide by nothing', () => {
    const { said } = run([(h) => press(h, 1, at(5, 5)), (h) => press(h, 2, at(5, 5)), (h) => move(h, 2, at(9, 5))])
    expect(said[2]).toEqual({ kind: 'pinch', by: 4, at: at(7, 5) })
  })
})

describe('a finger the page lost', () => {
  it('leaves nothing behind: the next tap is a tap, not half of a pinch', () => {
    const { said, hand } = run([(h) => press(h, 1, at(10, 10)), (h) => drop(h, 1), (h) => press(h, 2, at(40, 40)), (h) => lift(h, 2, at(40, 40))])
    expect(said.slice(2)).toEqual([{ kind: 'hold' }, { kind: 'tap', at: at(40, 40) }])
    expect(hand.fingers.size).toBe(0)
  })

  it('is forgotten when a first finger comes down, even if the page never said it left', () => {
    const { said } = run([(h) => press(h, 1, at(10, 10)), (h) => press(h, 2, at(40, 40), true), (h) => lift(h, 2, at(40, 40))])
    expect(said).toEqual([{ kind: 'hold' }, { kind: 'hold' }, { kind: 'tap', at: at(40, 40) }])
  })

  it('out of a pinch leaves the one that stays able to drag, as a lift would', () => {
    const { said } = run([(h) => press(h, 1, at(100, 100)), (h) => press(h, 2, at(200, 100)), (h) => drop(h, 1), (h) => move(h, 2, at(260, 100)), (h) => lift(h, 2, at(260, 100))])
    expect(said.slice(2)).toEqual([{ kind: 'hold' }, { kind: 'pan', dx: 60, dy: 0 }, { kind: 'dropped' }])
  })

  it('ends a drag without a tap, and ends a pinch', () => {
    const dragged = run([(h) => press(h, 1, at(10, 10)), (h) => move(h, 1, at(60, 10)), (h) => drop(h, 1), (h) => lift(h, 1, at(60, 10))])
    expect(dragged.said[3]).toBeNull()
    expect(dragged.hand).toEqual(idle())
    const pinched = run([(h) => press(h, 1, at(10, 10)), (h) => press(h, 2, at(60, 10)), (h) => drop(h)])
    expect(pinched.hand).toEqual(idle())
  })
})

describe('a hold that the zoom changed under', () => {
  it('begins again from where the finger is, and keeps being a drag if it was one', () => {
    const { hand } = run([(h) => press(h, 1, at(10, 10)), (h) => move(h, 1, at(60, 10))])
    const again = rehold(hand)
    expect(again.hold).toEqual({ id: 1, from: at(60, 10), drag: true })
    expect(move(again, 1, at(63, 14))[1]).toEqual({ kind: 'pan', dx: 3, dy: 4 })
  })

  it('is nothing to a hand that holds nothing', () => {
    expect(rehold(idle())).toEqual(idle())
  })
})

describe('the wheel, with Ctrl held', () => {
  const start = { sum: 0, at: 0 }
  it('zooms in one step for a notch away from you and out for a notch towards you', () => {
    expect(wheelStep(start, -100, 0, 1000).step).toBe(1)
    expect(wheelStep(start, 100, 0, 1000).step).toBe(-1)
  })

  it('counts a wheel that speaks in lines as one that speaks in pixels', () => {
    // Firefox: three lines to a notch.
    expect(wheelStep(start, -3, 1, 1000).step).toBe(1)
  })

  it('adds up the small movements of a pinch on a trackpad until they make a step', () => {
    const a = wheelStep(start, -12, 0, 1000)
    const b = wheelStep(a.wheel, -12, 0, 1016)
    const c = wheelStep(b.wheel, -12, 0, 1032)
    expect([a.step, b.step, c.step]).toEqual([0, 0, 1])
    expect(c.wheel.sum).toBe(0)
  })

  it('forgets what was left of an old movement after a pause, or when the wheel turns the other way', () => {
    const a = wheelStep(start, -25, 0, 1000)
    expect(wheelStep(a.wheel, -10, 0, 1100).step).toBe(1)
    expect(wheelStep(a.wheel, -10, 0, 2000).step).toBe(0)
    expect(wheelStep(a.wheel, 10, 0, 1100)).toEqual({ wheel: { sum: 10, at: 1100 }, step: 0 })
  })
})

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
