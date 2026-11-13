// Which of the things on the screen a tap lands on. Pure.
import { holds } from './art/sprites'

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
