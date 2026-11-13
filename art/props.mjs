// What stands on the homestead: the barn, the well, the compost heap, the signpost, the gate, the market stall,
// fences and flags; the farmer; and the marks that float over a crop. Each comes with the place in its bitmap that
// sits on the top corner of its tile.
import { Bitmap, grid, line, poly } from './kit.mjs'
import { P, SHADOW } from './palette.mjs'

const mod = (a, n) => ((a % n) + n) % n
const at = (b, ax, ay) => ({ b, ax, ay })

// What each letter of a hand-drawn grid is painted with.
const G = {
  o: P.ink, x: SHADOW,
  a: P.w0, b: P.w1, c: P.w2, e: P.w3, f: P.w4,
  k: P.k0, K: P.k1, s: P.k2, S: P.k3,
  w: P.b0, W: P.b1, X: P.b2,
  r: P.r1, R: P.r2, q: P.r3, Q: P.r0,
  y: P.c0, Y: P.c1, Z: P.c2,
  d: P.g0, g: P.g1, G: P.g2, l: P.g3, h: P.g4,
  t: P.s0, u: P.s1, v: P.s2, V: P.s3,
  '1': P.y1, '2': P.y2, '3': P.y0,
  F: P.key, H: P.keyLight, D: P.keyDark,
  P: P.h1, p: P.h0, i: P.ink, T: P.t1, U: P.t0, L: P.t2,
}
const made = (rows, ax, ay) => at(grid(rows, G), ax, ay)

/** The barn: two tiles by two, red boards under a slate roof, a door in the gable end. */
function barn() {
  const W = 68, H = 62, ax = 34, ay = 26
  const b = new Bitmap(W, H)
  const pt = (x, y) => [ax + x, ay + y]
  const h = 17, r = 13
  const T = [0, 0], R = [32, 16], L = [-32, 16], B = [0, 32]
  const up = ([x, y], z) => [x, y - z]
  const M1 = up([-16, 8], h + r), M2 = up([16, 24], h + r)
  const pts = (...ps) => ps.map(([x, y]) => pt(x, y))
  // the far slope of the roof, the near slope, then the two walls
  poly(b, pts(M1, M2, up(R, h), up(T, h)), (x, y) => (mod(Math.floor(y - ay - (x - ax) / 2), 4) === 0 ? P.k0 : P.k1))
  poly(b, pts(up(L, h), up(B, h), M2, M1), (x, y) => (mod(Math.floor(y - ay - (x - ax) / 2), 4) === 3 ? P.k1 : P.k2))
  poly(b, pts(L, B, up(B, h), up(L, h)), (x) => (mod(x - ax, 5) === 0 ? P.r1 : P.r2))
  poly(b, pts(B, R, up(R, h), M2, up(B, h)), (x) => (mod(x - ax, 5) === 2 ? P.r0 : P.r1))
  // light along the top of the lit wall, cream trim on the eaves and the gable, a pale ridge
  line(b, ...pt(-32, 16 - h + 1), ...pt(-1, 32 - h), P.r3)
  line(b, ...pt(-32, 16 - h), ...pt(0, 32 - h), P.c2)
  line(b, ...pt(0, 32 - h), ...pt(16, 24 - h - r), P.c2)
  line(b, ...pt(16, 24 - h - r), ...pt(31, 16 - h), P.c1)
  line(b, ...pt(-16, 8 - h - r), ...pt(16, 24 - h - r), P.k3)
  // the door and the loft, on the gable wall
  const gable = (u, z) => pt(32 * u, 32 - 16 * u - z)
  poly(b, [gable(0.26, 0), gable(0.66, 0), gable(0.66, 13), gable(0.26, 13)], P.c1)
  poly(b, [gable(0.31, 0), gable(0.61, 0), gable(0.61, 11.5), gable(0.31, 11.5)], (x) => (mod(x - ax, 3) === 0 ? P.w0 : P.w1))
  poly(b, [gable(0.36, 16), gable(0.64, 16), gable(0.64, 23), gable(0.36, 23)], P.c1)
  poly(b, [gable(0.41, 17), gable(0.59, 17), gable(0.59, 22), gable(0.41, 22)], P.w0)
  // a window on the lit wall
  const wall = (u, z) => pt(-32 + 32 * u, 16 + 16 * u - z)
  poly(b, [wall(0.3, 5), wall(0.58, 5), wall(0.58, 13), wall(0.3, 13)], P.c2)
  poly(b, [wall(0.35, 6.5), wall(0.53, 6.5), wall(0.53, 11.5), wall(0.35, 11.5)], P.k0)
  b.set(...wall(0.38, 10.5), P.k3); b.set(...wall(0.41, 10.5), P.k2)
  b.outline(P.ink)
  // its shadow on the ground, under both front walls
  for (let x = 2; x < W - 2; x++) { let y = H - 1; while (y > 0 && !b.get(x, y)) y--; for (const d of [1, 2]) if (y + d < H) b.set(x, y + d, SHADOW) }
  return at(b, ax, ay)
}

/** The gate over the main path: two posts, a beam between their tops, a lantern hung from it. */
function gate() {
  const b = new Bitmap(40, 46)
  const ax = 35, ay = 24
  // the far post stands on the tile's top corner, the near one a tile's width down the path's edge
  for (const [x, y] of [[ax, ay + 1], [ax - 32, ay + 17]]) {
    b.rect(x - 1, y - 20, 3, 21, P.w2)
    for (let k = 0; k < 21; k++) { b.set(x - 1, y - 20 + k, P.w3); b.set(x + 1, y - 20 + k, P.w1) }
    b.rect(x - 1, y - 21, 3, 1, P.w4)
  }
  for (let t = 0; t <= 16; t++) { b.rect(ax - 2 * t - 1, ay - 22 + t, 3, 3, P.w2); b.rect(ax - 2 * t - 1, ay - 22 + t, 3, 1, P.w4); b.rect(ax - 2 * t - 1, ay - 20 + t, 3, 1, P.w1) }
  // the lantern: a cord, a frame, a flame
  b.rect(ax - 17, ay - 11, 1, 2, P.w0)
  b.rect(ax - 18, ay - 9, 3, 4, P.y1); b.set(ax - 17, ay - 8, P.y2); b.set(ax - 17, ay - 7, P.y2)
  b.outline(P.ink)
  for (const [x, y] of [[ax, ay + 1], [ax - 32, ay + 17]]) for (let k = -2; k <= 2; k++) if (!b.get(x + k, y + 2)) b.set(x + k, y + 2, SHADOW)
  return at(b, ax, ay)
}

/** The well: a ring of stone with water in it, under a small roof on two posts. */
const well = () => made([
  '.....oooooo.....',
  '...ooqqRRRRoo...',
  '..oqqRRRRRRrro..',
  '.oqRRRRRRRRrrro.',
  '.oooooooooooooo.',
  '..oeo......oco..',
  '..oeo......oco..',
  '..oeo.oooo.oco..',
  '..oeoSSsssooco..',
  '..oSSXWWwwsKo...',
  '.oSssWWwwwwKKo..',
  '.oSssswwwwKKKo..',
  '.oSsssssKKKKko..',
  '..osssssKKKko...',
  '.x.oossKKkoo.x..',
  '..xxxooooooxxx..',
], 8, 3)

/** The compost heap: a mound of dark earth with scraps in it. */
const compost = () => made([
  '......oooo......',
  '....ooVvvuoo....',
  '...oVvlvuuuuo...',
  '..oVvvvu1uuuto..',
  '.oVvhvuuuuutuo..',
  '.ovvvvuuGuuttto.',
  'ovvvuuuuuuttttto',
  'ouvuuu1uutttttto',
  '.oouuuuuttttttoo',
  '.xxoooooooooooxx',
], 8, -3)

/** The signpost: a board on a post. */
const sign = () => made([
  'oooooooooooooo',
  'offffffeeeeeco',
  'ofbbbbbbbbbeco',
  'ofeeeeeeeeeeco',
  'ofebbbbbbeeeco',
  'oeeeeeeeeeccco',
  'oooooocboooooo',
  '.....oecbo....',
  '.....oecbo....',
  '.....oecbo....',
  '.....oecbo....',
  '.....oecbo....',
  '...xxoecboxx..',
  '....xxoooxx...',
], 7, 1)

/** The market stall: a counter with produce on it under a striped awning; `lit` lights the lantern on its ridge. */
const stall = (lit) => made([
  '.........o.........',
  '........o' + (lit ? '2' : 'K') + 'o........',
  '........o' + (lit ? '1' : 'k') + 'o........',
  '.ooooooooooooooooo.',
  'oRRZZRRZZRRZZRRZZRo',
  'oRRZZRRZZRRZZRRZZRo',
  'orrYYrrYYrrYYrrYYro',
  'orYyrrYyrrYyrrYyrro',
  '.ooooooooooooooooo.',
  '..oeo.........oco..',
  '..oeo.........oco..',
  '..oeo.........oco..',
  '.ooeooooooooooocoo.',
  '.of1e1Gflfqef1Gfeo.',
  '.offffffffeeeeeeco.',
  '.oeeeeeeeeeecccbbo.',
  '.oebebebebcbcbcbbo.',
  '.oeeeeeeeccccbbbbo.',
  'xxoooooooooooooooxx',
  '.xxxxxxxxxxxxxxxxx.',
], 9, 6)

/** A stretch of fence along one edge of a tile: two rails. `dir` is 1 for an edge that runs down to the right, -1 for one that runs down to the left. */
function rails(dir) {
  const b = new Bitmap(18, 16)
  // the edge starts at (1, 6) for dir 1 and at (16, 6) for dir -1, and falls one pixel for every two across
  for (let t = 0; t < 8; t++) for (const [lift, hi, lo] of [[5, P.w4, P.w2], [2, P.w3, P.w1]]) {
    const x = dir === 1 ? 1 + 2 * t : 15 - 2 * t
    b.rect(x, 6 + t - lift, 2, 1, hi)
    b.rect(x, 7 + t - lift, 2, 1, lo)
  }
  return at(b, dir === 1 ? 1 : 17, 6)
}

/** A fence post, capped in the key colour so each field's fence says whose it is. */
const post = () => made([
  '.oo.',
  'oHFo',
  'oFDo',
  'oeco',
  'oeco',
  'oeco',
  'oeco',
  'oebo',
  '.oo.',
], 2, 8)

/** A field's flag on its pole. The cloth is in the key colour; the two frames are its ripple. */
const flag = (n) => made([
  '33..........',
  'ecooooooooo.',
  n ? 'ecHHFFFFDDo.' : 'ecHFFFFFFDDo',
  n ? 'ecHFFFFFDDDo' : 'ecHHFFFFDDo.',
  n ? 'ecFFFFFFDDo.' : 'ecHFFFFFDDDo',
  n ? 'ecFFFFFDDDo.' : 'ecFFFFFFDDo.',
  n ? 'ecFFFFDDDo..' : 'ecFFFFDDDDo.',
  n ? 'ecooooooo...' : 'ecoooooooo..',
  ...Array(15).fill('ec..........'),
], 0, 28)

/** The farmer, standing and mid-step: a straw hat, a blue shirt. */
const farmer = (n) => made([
  '...oooo...',
  '..offffo..',
  '.offeeffo.',
  'offffffffo',
  '.oooooooo.',
  '..oPPppo..',
  '..oPiPio..',
  '..oPPppo..',
  '.ooTTTToo.',
  'oPoLTTUopo',
  'oPoLTTUopo',
  '.ooTTUUoo.',
  ...(n ? ['..okkkko..', '.oko..oko.', '.oko...oko', '.ooo...ooo'] : ['..okkkko..', '..oko.oko.', '..oko.oko.', '..ooo.ooo.']),
], 5, 2)

/** What floats over a crop: a droplet when it is thirsty, a sparkle when it is ripe, a mark when it has wilted. */
const droplet = () => made(['..o..', '.oXo.', '.oWo.', 'oXWwo', 'oWWwo', 'oWwwo', '.ooo.'], 2, 12)
// The sparkle twinkles between a small star and a big one, each with a line round it so it shows on leaves and on soil.
const sparkle = (n) => made(n ? ['..o..', '.o2o.', 'oo1oo', 'o212o', 'oo1oo', '.o2o.', '..o..'] : ['.....', '..o..', '.o2o.', 'o212o', '.o2o.', '..o..', '.....'], 2, 13)
const wiltMark = () => made(['.ooo.', '.o3o.', '.o3o.', '.o3o.', '.ooo.', '.o3o.', '.ooo.'], 2, 11)

export function props() {
  return {
    barn: barn(), gate: gate(), well: well(), compost: compost(), sign: sign(),
    stall: stall(false), 'stall/lit': stall(true),
    'fence/right': rails(1), 'fence/left': rails(-1), 'fence/post': post(),
    'flag/0': flag(0), 'flag/1': flag(1),
    'farmer/0': farmer(0), 'farmer/1': farmer(1),
    'mark/thirsty': droplet(), 'mark/ripe/0': sparkle(0), 'mark/ripe/1': sparkle(1), 'mark/wilted': wiltMark(),
  }
}
