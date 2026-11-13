// How much of the farm the canvas shows, and how big. The canvas is drawn at the screen's own resolution, and every
// pixel of art covers a whole number of screen pixels: that number is the zoom. So the art is sharp on a phone and on
// a laptop alike, and zooming is only a change of that number. Pure: no DOM.

/** The view the farm was first drawn for. A saved camera is kept as if the view were this size, whatever it is today. */
export const REF = { w: 480, h: 300 }

export interface View {
  /** Screen pixels to one pixel of art. A whole number, 1 or more. */
  zoom: number
  /** The canvas's own size, in screen pixels. */
  pw: number
  ph: number
  /** How much of the farm it shows, in pixels of art. */
  w: number
  h: number
}

/** The fewest pixels of art across the view (five tiles), and the most (thirty: a whole farm of nine fields and the forest round it). */
const ACROSS = { min: 160, max: 960 }

/** The zoom levels a canvas `pw` screen pixels wide may use: from showing thirty tiles across to showing five. */
export function zoomRange(pw: number): { min: number; max: number } {
  const min = Math.max(1, Math.ceil(pw / ACROSS.max))
  return { min, max: Math.max(min, Math.floor(pw / ACROSS.min)) }
}

export const clampZoom = (zoom: number, pw: number): number => {
  const { min, max } = zoomRange(pw)
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(zoom) ? zoom : min)))
}

/**
 * The zoom a farmer starts at: about as much of the farm as the game always showed (480 pixels of art across), but
 * never so small that a pixel of art is under 1.2 points of the screen. On a phone that is closer in, so a crop is big
 * enough to tap. `dpr` is screen pixels to a point (2 or 3 on most phones).
 */
export function defaultZoom(pw: number, dpr: number): number {
  return clampZoom(Math.max(Math.round(pw / REF.w), Math.ceil(1.2 * dpr)), pw)
}

/** The view for a canvas shown `cssW` by `cssH` points on a screen with `dpr` pixels to a point. */
export function fitView(cssW: number, cssH: number, dpr: number, zoom: number): View {
  const pw = Math.max(1, Math.round(cssW * dpr))
  const ph = Math.max(1, Math.round(cssH * dpr))
  const z = clampZoom(zoom, pw)
  return { zoom: z, pw, ph, w: pw / z, h: ph / z }
}

/** How far everything is moved so that what was in the middle of the reference view is in the middle of this one. */
export const shift = (v: Pick<View, 'w' | 'h'>): { x: number; y: number } => ({ x: (v.w - REF.w) / 2, y: (v.h - REF.h) / 2 })

/**
 * The camera after a change of view that keeps one point of the farm where it is on the screen: the point under
 * (fx, fy), given as fractions of the view's width and height. With (0.5, 0.5) the middle stays in the middle.
 */
export function cameraAfter(cam: { x: number; y: number }, from: View, to: View, fx = 0.5, fy = 0.5): { x: number; y: number } {
  const a = shift(from), b = shift(to)
  return { x: cam.x + a.x - fx * from.w + fx * to.w - b.x, y: cam.y + a.y - fy * from.h + fy * to.h - b.y }
}

/** The zoom two fingers ask for: the zoom they began at, scaled by how far apart they have moved. */
export const pinchZoom = (startZoom: number, startDist: number, dist: number, pw: number): number =>
  clampZoom(startDist > 0 ? startZoom * (dist / startDist) : startZoom, pw)
