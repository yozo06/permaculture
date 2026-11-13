import { describe, expect, it } from 'vitest'
import { REF, cameraAfter, clampZoom, defaultZoom, fitView, pinchZoom, shift, zoomRange } from './view'

describe('the zoom a screen may use', () => {
  it('runs from thirty tiles across to five', () => {
    expect(zoomRange(1912)).toEqual({ min: 2, max: 11 })
    expect(zoomRange(1029)).toEqual({ min: 2, max: 6 })
    expect(zoomRange(480)).toEqual({ min: 1, max: 3 })
  })

  it('is at least 1 on the smallest canvas, and never upside down', () => {
    expect(zoomRange(100)).toEqual({ min: 1, max: 1 })
    expect(zoomRange(1)).toEqual({ min: 1, max: 1 })
  })

  it('is a whole number inside that range, whatever is asked', () => {
    expect([0, 1, 2.4, 2.6, 6, 40, NaN, -3].map((z) => clampZoom(z, 1029))).toEqual([2, 2, 2, 3, 6, 6, 2, 2])
  })
})

describe('the zoom a farmer starts at', () => {
  it('shows what the game always showed on a laptop: 480 pixels of art across', () => {
    // 956 points wide at 2 pixels to a point, and at 1.
    expect(defaultZoom(1912, 2)).toBe(4)
    expect(defaultZoom(956, 1)).toBe(2)
  })

  it('is closer in on a phone, so a pixel of art is never under 1.2 points', () => {
    // 343 points wide at 3 pixels to a point: 480 across would be zoom 2, two thirds of a point to a pixel.
    expect(defaultZoom(1029, 3)).toBe(4)
    expect(defaultZoom(686, 2)).toBe(3)
  })
})

describe('the view', () => {
  it('is the canvas at the screen\'s own resolution, with a whole number of screen pixels to each pixel of art', () => {
    expect(fitView(956, 597.5, 2, 4)).toEqual({ zoom: 4, pw: 1912, ph: 1195, w: 478, h: 298.75 })
  })

  it('keeps the zoom inside what the screen may use', () => {
    expect(fitView(343, 429, 3, 99).zoom).toBe(6)
    expect(fitView(343, 429, 3, 0).zoom).toBe(2)
    expect(fitView(0, 0, 2, 2)).toMatchObject({ pw: 1, ph: 1, zoom: 1 })
  })

  it('moves nothing for the view the farm was first drawn for', () => {
    expect(shift(REF)).toEqual({ x: 0, y: 0 })
    expect(shift({ w: 240, h: 150 })).toEqual({ x: -120, y: -75 })
  })
})

describe('the camera after a change of view', () => {
  const big = fitView(480, 300, 2, 2)   // 480 by 300 of art
  const close = fitView(480, 300, 2, 4) // 240 by 150
  /** Where a point of the farm is on the screen, as a fraction of the view. */
  const place = (world: { x: number; y: number }, cam: { x: number; y: number }, v: typeof big) =>
    ({ fx: (world.x + cam.x + shift(v).x) / v.w, fy: (world.y + cam.y + shift(v).y) / v.h })

  it('does not move when the view does not change', () => {
    expect(cameraAfter({ x: 240, y: -18 }, big, big)).toEqual({ x: 240, y: -18 })
  })

  it('keeps the middle in the middle by default, so a saved camera means the same on every screen', () => {
    // The camera is kept as if the view were the reference size: zooming about the middle leaves it as it is.
    expect(cameraAfter({ x: 240, y: -18 }, big, close)).toEqual({ x: 240, y: -18 })
    const world = { x: 0, y: 168 }
    expect(place(world, { x: 240, y: -18 }, big)).toEqual({ fx: 0.5, fy: 0.5 })
    expect(place(world, { x: 240, y: -18 }, close)).toEqual({ fx: 0.5, fy: 0.5 })
  })

  it('keeps the point under two fingers where it is', () => {
    const cam = { x: 240, y: -18 }
    // The point of the farm a quarter of the way across and three quarters down.
    const world = { x: 0.25 * big.w - cam.x - shift(big).x, y: 0.75 * big.h - cam.y - shift(big).y }
    const after = cameraAfter(cam, big, close, 0.25, 0.75)
    expect(place(world, after, close)).toEqual({ fx: 0.25, fy: 0.75 })
    // And back out again lands where it began.
    expect(cameraAfter(after, close, big, 0.25, 0.75)).toEqual(cam)
  })
})

describe('a pinch', () => {
  it('scales the zoom it began at by how far the fingers have moved, to a whole number the screen may use', () => {
    expect(pinchZoom(3, 100, 200, 1029)).toBe(6)
    expect(pinchZoom(3, 100, 140, 1029)).toBe(4)
    expect(pinchZoom(3, 100, 50, 1029)).toBe(2)
    expect(pinchZoom(3, 100, 10, 1029)).toBe(2)
    expect(pinchZoom(3, 100, 900, 1029)).toBe(6)
  })

  it('changes nothing for fingers that began on the same spot', () => {
    expect(pinchZoom(3, 0, 200, 1029)).toBe(3)
  })
})
