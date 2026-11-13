// The ground: one 32 by 16 diamond for each kind of land, in a few variants so no two neighbours match, and the
// faces of earth under the island's two front edges.
import { Bitmap, hash } from './kit.mjs'
import { P } from './palette.mjs'

const half = (r) => (r < 8 ? (r + 1) * 2 : (16 - r) * 2)

/** A diamond of `base`, flecked with `dark` and `light`. `n` picks the variant. */
function diamond(base, dark, light, n, { flecks = 10, furrows = false } = {}) {
  const b = new Bitmap(32, 16)
  for (let r = 0; r < 16; r++) for (let x = 16 - half(r); x < 16 + half(r); x++) b.set(x, r, base)
  // Furrows run along one edge of the tile, two pixels across for every one down.
  if (furrows) for (let r = 0; r < 16; r++) for (let x = 16 - half(r); x < 16 + half(r); x++) { const k = (x + 2 * r + n * 3) % 8; if (k === 0 || k === 1) b.set(x, r, dark) }
  for (let i = 0; i < flecks; i++) {
    const r = 1 + Math.floor(hash(i, n, 1) * 14)
    const x = 16 - half(r) + 1 + Math.floor(hash(i, n, 2) * (half(r) * 2 - 3))
    const c = hash(i, n, 3) > 0.5 ? light : dark
    b.set(x, r, c)
    if (hash(i, n, 4) > 0.6) b.set(x + 1, r, c)
  }
  return b
}

/** A few flowers on a meadow tile. */
function flowers(b, n) {
  const petals = [P.y1, P.c2, P.pink]
  for (let i = 0; i < 3; i++) {
    const r = 3 + Math.floor(hash(i, n, 7) * 10)
    const x = 16 - half(r) + 2 + Math.floor(hash(i, n, 8) * (half(r) * 2 - 5))
    b.set(x, r, petals[i % 3])
  }
  return b
}

/** The face of earth under a front edge of the island: `side` is 'left' (below a tile's lower left edge) or 'right'. */
function cliff(side, n) {
  const b = new Bitmap(16, 22)
  for (let t = 0; t < 16; t++) {
    // The first row under the tile's edge, column by column: the edge falls (or rises) one pixel for every two across.
    const top = side === 'left' ? Math.floor(t / 2) : 7 - Math.floor(t / 2)
    for (let k = 0; k < 13; k++) {
      const lit = side === 'left'
      const c = k < 2 ? (lit ? P.f0 : P.g1) : k > 10 ? P.s0 : k > 7 ? (lit ? P.s1 : P.s0) : lit ? P.s2 : P.s1
      b.set(t, top + k, c)
    }
    // a stone now and then, so the face is not one flat band
    if (hash(t, n, side === 'left' ? 21 : 22) > 0.86) { b.set(t, top + 4 + Math.floor(hash(t, n, 23) * 4), side === 'left' ? P.s3 : P.s2) }
  }
  return b
}

const at = (b, ax, ay) => ({ b, ax, ay })

export function tiles() {
  const out = {}
  for (let n = 0; n < 3; n++) {
    out['tile/meadow/' + n] = at(n === 1 ? flowers(diamond(P.m1, P.m0, P.m2, n), n) : diamond(P.m1, P.m0, P.m2, n), 16, 0)
    out['tile/wild/' + n] = at(diamond(P.f1, P.f0, P.f2, n), 16, 0)
    out['tile/path/' + n] = at(diamond(P.p1, P.p0, P.p2, n, { flecks: 6 }), 16, 0)
  }
  for (let n = 0; n < 2; n++) {
    out['tile/soil/' + n] = at(diamond(P.s1, P.s0, P.s2, n, { flecks: 4, furrows: true }), 16, 0)
    // A cliff hangs from the tile's left or bottom corner: its top row is the row under that edge.
    out['cliff/left/' + n] = at(cliff('left', n), 16, -9)
    out['cliff/right/' + n] = at(cliff('right', n), 0, -9)
  }
  return out
}
