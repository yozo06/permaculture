// What the fingers on the farm (or the mouse) are doing: one is a tap or a drag, two are a pinch. Pure: the game feeds
// it what the page says about each pointer and does what it says back. Also here: the wheel, and which of the things
// on the screen a tap lands on.
import { holds } from './art/sprites'

export interface Point { x: number; y: number }

export interface Hand {
  /** Every pointer that is down, by its id, where it was last seen. The first two are the ones a pinch goes by. */
  fingers: ReadonlyMap<number, Point>
  /** The one pointer that is down: where its hold began, and whether it has moved far enough to be a drag. */
  hold: { id: number; from: Point; drag: boolean } | null
  /** Two pointers down: how far apart they began. */
  pinch: { dist: number } | null
}

/** What a hand says has happened. Points and distances are the page's own, as they came in. */
export type Said =
  /** A hold began: a later `pan` is measured from here. */
  | { kind: 'hold' }
  /** The held pointer is this far from where its hold began. */
  | { kind: 'pan'; dx: number; dy: number }
  /** A drag ended. */
  | { kind: 'dropped' }
  | { kind: 'tap'; at: Point }
  /** A second pointer came down: a later `pinch` is measured from now. */
  | { kind: 'pinch-began' }
  /** The two pointers are `by` times as far apart as they began, about the point `at`. */
  | { kind: 'pinch'; by: number; at: Point }
  | null

/** A pointer becomes a drag once it is more than this many points of the page from where it came down: a finger is shaky. */
export const DRAG_AFTER = 8

export const idle = (): Hand => ({ fingers: new Map(), hold: null, pinch: null })

function spread(fingers: ReadonlyMap<number, Point>): { dist: number; at: Point } | null {
  const [a, b] = [...fingers.values()]
  return a && b ? { dist: Math.hypot(a.x - b.x, a.y - b.y), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } } : null
}

/**
 * A pointer came down. `first` says the page calls it the only one down (a mouse, or the first finger of a touch):
 * any other still listed was lost without a word, and is forgotten.
 */
export function press(h: Hand, id: number, at: Point, first = false): [Hand, Said] {
  const fingers = new Map(first ? [] : h.fingers)
  fingers.set(id, at)
  if (fingers.size === 1) return [{ fingers, hold: { id, from: at, drag: false }, pinch: null }, { kind: 'hold' }]
  // A second finger makes it a pinch: whatever the first was doing, it is not a drag or a tap any more. A third changes nothing.
  if (h.pinch) return [{ ...h, fingers }, null]
  const s = spread(fingers)
  return [{ fingers, hold: null, pinch: s ? { dist: s.dist } : null }, { kind: 'pinch-began' }]
}

export function move(h: Hand, id: number, at: Point): [Hand, Said] {
  if (!h.fingers.has(id)) return [h, null]
  const fingers = new Map(h.fingers).set(id, at)
  if (h.pinch) {
    const s = spread(fingers)
    // Two fingers that began on one point were no distance apart: count that as one point, so nothing divides by zero.
    return [{ ...h, fingers }, s ? { kind: 'pinch', by: s.dist / Math.max(1, h.pinch.dist), at: s.at } : null]
  }
  if (!h.hold || h.hold.id !== id) return [{ ...h, fingers }, null]
  const dx = at.x - h.hold.from.x, dy = at.y - h.hold.from.y
  const drag = h.hold.drag || Math.hypot(dx, dy) > DRAG_AFTER
  return [{ ...h, fingers, hold: { ...h.hold, drag } }, drag ? { kind: 'pan', dx, dy } : null]
}

/** One finger of a pinch has gone, by a lift or by being lost. */
function unpinch(h: Hand, id: number, fingers: Map<number, Point>): [Hand, Said] {
  if (fingers.size >= 2) {
    // A third finger was resting there. If the one that went was not one of the two being measured, nothing changes.
    // If it was, the pinch begins again with the pair that is left, from where they are: no jump.
    if (![...h.fingers.keys()].slice(0, 2).includes(id)) return [{ ...h, fingers }, null]
    const s = spread(fingers)
    return [{ fingers, hold: null, pinch: s ? { dist: s.dist } : null }, { kind: 'pinch-began' }]
  }
  // The finger that stays goes on to drag the farm from where it is. It began as half of a pinch, so its lift is no tap.
  const [last] = [...fingers]
  return last ? [{ fingers, hold: { id: last[0], from: last[1], drag: true }, pinch: null }, { kind: 'hold' }] : [idle(), null]
}

export function lift(h: Hand, id: number, at: Point): [Hand, Said] {
  if (!h.fingers.has(id)) return [h, null]
  const fingers = new Map(h.fingers)
  fingers.delete(id)
  if (h.pinch) return unpinch(h, id, fingers)
  if (!h.hold || h.hold.id !== id) return [{ ...h, fingers }, null]
  return [{ fingers, hold: null, pinch: null }, h.hold.drag ? { kind: 'dropped' } : { kind: 'tap', at }]
}

/**
 * A pointer the page cancelled or lost, or (with no id) all of them. A tap or a drag under way ends, and nothing is
 * tapped. A pinch that loses a finger goes on as it would after a lift.
 */
export function drop(h: Hand, id?: number): [Hand, Said] {
  if (id === undefined) return [idle(), null]
  if (!h.fingers.has(id)) return [h, null]
  const fingers = new Map(h.fingers)
  fingers.delete(id)
  if (h.pinch) return unpinch(h, id, fingers)
  return [{ fingers, hold: null, pinch: null }, null]
}

/**
 * Begin the hold under way again from where its finger is now. For when the zoom changes under a finger that is
 * down (a key, the wheel): what it has dragged so far stays, and what it drags next is measured at the new zoom.
 */
export function rehold(h: Hand): Hand {
  const at = h.hold ? h.fingers.get(h.hold.id) : undefined
  return h.hold && at ? { ...h, hold: { ...h.hold, from: at } } : h
}

/* ---------- the wheel ---------- */

/** What the wheel has turned since its last step, in pixels, and when it last turned. */
export interface Wheel { sum: number; at: number }
/** A step of zoom takes this much wheel: under one notch of a mouse wheel, and a short pinch on a trackpad. */
const WHEEL_STEP = 30
/** A wheel that has been still this long has stopped: what was left of its turning is forgotten. */
const WHEEL_REST_MS = 250
/** A wheel may speak in pixels (0), lines (1) or pages (2). */
const WHEEL_UNIT = [1, 16, 100]

/** Add a turn of the wheel. `step` is 1 to zoom in (the wheel turned away from you), -1 to zoom out, 0 for not yet. */
export function wheelStep(w: Wheel, deltaY: number, mode: number, now: number): { wheel: Wheel; step: -1 | 0 | 1 } {
  const turned = deltaY * (WHEEL_UNIT[mode] ?? 1)
  const stale = now - w.at > WHEEL_REST_MS || Math.sign(turned) !== Math.sign(w.sum)
  const sum = (stale ? 0 : w.sum) + turned
  if (Math.abs(sum) < WHEEL_STEP) return { wheel: { sum, at: now }, step: 0 }
  return { wheel: { sum: 0, at: now }, step: sum < 0 ? 1 : -1 }
}

/* ---------- what a tap lands on ---------- */

/** A thing on the screen: the top corner of its tile, the sprite it is drawn with, and how far forward it stands (things in front are drawn later). */
export interface Target<T> { what: T; sx: number; sy: number; sprite: string; s: number }

/** A finger is wider than a pixel of art: a tap this close to what is drawn of a thing is a tap on it. */
const FINGER = 2

/**
 * Which thing a tap at (ix, iy) lands on: the one drawn last of those drawn there, so what you see is what you tap.
 * It goes by what is drawn of each, so a sprout does not take taps meant for the tile behind it, and a tree's crown does.
 */
export function frontmost<T>(things: readonly Target<T>[], ix: number, iy: number): T | null {
  let best: Target<T> | null = null
  for (const t of things) if (holds(t.sprite, t.sx, t.sy, ix, iy, FINGER) && (!best || t.s > best.s)) best = t
  return best ? best.what : null
}
