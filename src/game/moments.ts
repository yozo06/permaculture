// Small moments on the farm: what flies off a crop when it is watered, when it grows, and when it is harvested.
// Pure: given a kind and how long ago it began, the dots to draw. The screen keeps the clock and the colours.

export type MomentKind = 'splash' | 'grow' | 'harvest'
export type DotTone = 'water' | 'spray' | 'leaf' | 'gold' | 'field'

/** One pixel. `x` and `y` are from where the moment began (up is negative): the foot of the crop for a splash, its top for the others. */
export interface Dot { x: number; y: number; tone: DotTone }

/** How long each moment lasts, in milliseconds. */
export const MOMENT_MS: Record<MomentKind, number> = { splash: 600, grow: 700, harvest: 900 }

/** No dot ever leaves this box, both ends included. */
export const MOMENT_BOX = { left: -12, right: 12, top: -16, bottom: 2 }

/** Droplets: how far each flies sideways, how high, and for how long (as a share of the splash). The short hops land first. */
const DROPLETS: [number, number, number][] = [[-11, 5, 1], [-7, 9, 0.85], [-3, 7, 0.7], [1, 10, 0.95], [4, 6, 0.7], [8, 8, 0.85], [11, 4, 1]]
/** Sparks of a harvest: sideways drift, how high each rises, and when it goes out. */
const SPARKS: [number, number, number][] = [[-9, 6, 0.7], [-6, 12, 1], [-3, 9, 0.85], [-1, 15, 1], [1, 14, 0.9], [3, 8, 0.75], [6, 12, 1], [9, 7, 0.7]]
const RING = 6
/** The nearest whole pixel (and never a negative zero). */
const whole = (n: number): number => Math.round(n) + 0

/** The dots of a moment `age` milliseconds after it began. Empty before it begins and once it is over. */
export function momentDots(kind: MomentKind, age: number): Dot[] {
  const u = age / MOMENT_MS[kind]
  if (!(u >= 0 && u < 1)) return []
  if (kind === 'splash') {
    // Each droplet leaves the ground, follows an arc and is gone when it lands.
    return DROPLETS.flatMap(([dx, rise, life], i): Dot[] => {
      const v = u / life
      return v < 1 ? [{ x: whole(dx * v), y: whole(-rise * 4 * v * (1 - v)), tone: i % 2 === 0 ? 'water' : 'spray' }] : []
    })
  }
  if (kind === 'grow') {
    // A ring that widens and lifts, thinning out as it goes.
    const r = 2 + 8 * u
    return Array.from({ length: RING }, (_, i) => i).flatMap((i): Dot[] => {
      const a = (i / RING) * Math.PI * 2
      return u < 1 - 0.15 * (i % 3) ? [{ x: whole(Math.cos(a) * r), y: whole(-2 - 5 * u + Math.sin(a) * r * 0.5), tone: i % 2 === 0 ? 'leaf' : 'gold' }] : []
    })
  }
  // Sparks rise fast, slow down, and go out one by one.
  return SPARKS.flatMap(([dx, rise, life], i): Dot[] =>
    u < life ? [{ x: whole(dx * u), y: whole(-rise * u * (2 - u)), tone: i % 2 === 0 ? 'gold' : 'field' }] : [])
}
