// The seven layers, six looks each: stages 1 to 5, then the tree a harvested crop becomes. Each layer has a shape of
// its own, so the map says what kind of knowledge sits where. Every sprite is 24 wide and 32 tall and stands on the
// row GROUND - 1 with its middle at x = 12. Fruit is drawn in the key colours, which the game repaints with the
// field's own colour.
import { Bitmap, foliage as leaves, grid } from './kit.mjs'
import { P, SHADOW } from './palette.mjs'

const GREEN = [P.g0, P.g1, P.g2, P.g3, P.g4]
const foliage = (w, h, discs) => leaves(w, h, discs, GREEN)

export const CW = 24, CH = 32, CX = 12, GROUND = CH - 2
// What each letter of a hand-drawn grid is painted with.
const L = { o: P.g0, d: P.g1, m: P.g2, l: P.g3, h: P.g4, a: P.w0, b: P.w1, c: P.w2, e: P.w3, f: P.w4, s: P.s0, t: P.s1, u: P.s2, v: P.s3, F: P.key, G: P.keyLight, D: P.keyDark }

/** A soft shadow on the ground under a sprite, `w` pixels wide. */
function shadow(b, w) {
  if (w < 3) return
  const half = Math.floor(w / 2)
  for (let x = -half; x <= half; x++) { if (!b.get(CX + x, GROUND)) b.set(CX + x, GROUND, SHADOW) }
  for (let x = -half + 2; x <= half - 2; x++) { if (!b.get(CX + x, GROUND + 1)) b.set(CX + x, GROUND + 1, SHADOW) }
}
/** Put a hand-drawn grid so its bottom row sits on the ground and its middle on the centre line. */
function stand(b, rows, dx = 0) { const g = grid(rows, L); b.blit(g, CX - Math.floor(g.w / 2) + dx, GROUND - g.h); return b }
/** A fruit two pixels square: its light, itself, its shade. */
const fruit = (b, x, y) => { b.set(x, y, P.keyLight); b.set(x + 1, y, P.key); b.set(x, y + 1, P.key); b.set(x + 1, y + 1, P.keyDark) }
const trunk = (b, h, w) => {
  const x0 = CX - Math.floor(w / 2)
  for (let i = 0; i < h; i++) for (let k = 0; k < w; k++) b.set(x0 + k, GROUND - 1 - i, w === 1 ? P.w2 : k === 0 ? P.w1 : k === w - 1 ? P.w3 : P.w2)
  if (w > 1) { b.set(x0 - 1, GROUND - 1, P.w0); b.set(x0 + w, GROUND - 1, P.w0) }
}

/* ---------- canopy: a tall trunk under a wide crown ---------- */
function canopy(look) {
  const b = new Bitmap(CW, CH)
  if (look === 0) return shadowed(stand(b, ['.h.l.', '.lml.', '..m..', '..c..']), 3)
  if (look === 1) return shadowed(stand(b, ['..oo...', '.ohlo..', 'ohllmo.', 'olmmdo.', '.oddo..', '..oc...', '...c...', '...c...']), 5)
  const th = [0, 0, 7, 10, 13, 15][look], tw = look >= 4 ? 3 : 2
  trunk(b, th, tw)
  const top = GROUND - th
  const discs = [null, null,
    [[CX, top - 2, 4], [CX - 3, top, 2.6], [CX + 3, top, 2.6]],
    [[CX, top - 3, 5], [CX - 4, top, 3.5], [CX + 4, top, 3.5]],
    [[CX, top - 4, 6], [CX - 5, top - 1, 4], [CX + 5, top - 1, 4], [CX, top + 1, 4]],
    [[CX, top - 5, 7], [CX - 6, top - 1, 4.5], [CX + 6, top - 1, 4.5], [CX, top + 1, 5]],
  ][look]
  b.blit(foliage(CW, CH, discs), 0, 0)
  const f = [[], [], [], [], [[CX - 4, top - 2], [CX + 3, top - 5], [CX, top]], [[CX - 6, top - 2], [CX + 4, top - 3], [CX - 1, top - 8], [CX + 1, top + 1]]][look]
  for (const [x, y] of f) fruit(b, x, y)
  return shadowed(b, [0, 0, 7, 9, 11, 13][look])
}

/* ---------- understory: a small tree that comes to a point ---------- */
function understory(look) {
  const b = new Bitmap(CW, CH)
  if (look === 0) return shadowed(stand(b, ['.h.', 'lml', '.c.']), 3)
  // Tiers of a cone, widest at the bottom, each row lit on the left.
  const rowsFor = [null, [1, 3, 3, 5], [1, 3, 3, 5, 5, 7, 5], [1, 3, 3, 5, 5, 7, 7, 9, 7], [1, 3, 5, 5, 7, 7, 9, 9, 11, 11, 9], [1, 3, 5, 5, 7, 9, 9, 11, 11, 13, 13, 13, 11]][look]
  const th = [0, 2, 2, 3, 3, 4][look]
  trunk(b, th, look >= 4 ? 2 : 1)
  const base = GROUND - th
  const cone = new Bitmap(CW, CH)
  rowsFor.forEach((w, i) => {
    const y = base - rowsFor.length + i
    const x0 = CX - Math.floor(w / 2)
    for (let k = 0; k < w; k++) {
      const t = w === 1 ? 0 : k / (w - 1)
      // a notch of shade under each tier's lip, every third row
      const lip = i % 3 === 2
      cone.set(x0 + k, y, lip && t > 0.25 ? P.g1 : t < 0.3 ? P.g4 : t < 0.55 ? P.g3 : t < 0.8 ? P.g2 : P.g1)
    }
  })
  cone.outline(P.g0)
  b.blit(cone, 0, 0)
  const f = [[], [], [], [], [[CX - 3, base - 4], [CX + 2, base - 7]], [[CX - 4, base - 4], [CX + 3, base - 6], [CX - 1, base - 10]]][look]
  for (const [x, y] of f) fruit(b, x, y)
  return shadowed(b, [0, 5, 7, 9, 11, 13][look])
}

/* ---------- shrub: a round bush on the ground ---------- */
function shrub(look) {
  const b = new Bitmap(CW, CH)
  if (look === 0) return shadowed(stand(b, ['.ll.', 'lmmd', '.dd.']), 3)
  const g = GROUND
  const discs = [null,
    [[CX, g - 3, 2.6], [CX - 2, g - 2, 1.8], [CX + 2, g - 2, 1.8]],
    [[CX, g - 4, 3.6], [CX - 3, g - 3, 2.6], [CX + 3, g - 3, 2.6]],
    [[CX, g - 5, 4.4], [CX - 4, g - 3, 3], [CX + 4, g - 3, 3]],
    [[CX, g - 6, 5.2], [CX - 5, g - 4, 3.6], [CX + 5, g - 4, 3.6]],
    [[CX - 2, g - 7, 5], [CX + 3, g - 6, 4.6], [CX - 6, g - 4, 3.6], [CX + 6, g - 4, 3.6], [CX, g - 3, 3.5]],
  ][look]
  b.blit(foliage(CW, CH, discs), 0, 0)
  const f = [[], [], [], [], [[CX - 4, g - 5], [CX + 2, g - 7], [CX, g - 3]], [[CX - 6, g - 5], [CX + 4, g - 6], [CX - 2, g - 9], [CX + 1, g - 4]]][look]
  for (const [x, y] of f) fruit(b, x, y)
  return shadowed(b, [0, 7, 9, 11, 13, 15][look])
}

/* ---------- herb: one stalk with leaves in pairs ---------- */
function herb(look) {
  const b = new Bitmap(CW, CH)
  const looks = [
    ['.h.l', '.lm.', '..m.'],
    ['..h..', 'll.m.', '.lmhl', '..ml.', '.lm..', '..m..', '..d..'],
    ['...h...', '..lm...', 'hl.m.ll', '.llmlh.', '...m...', '.hlmll.', '.l.m.l.', '...d...', '...d...'],
    ['...h....', '..hlm...', '...m.lh.', 'hl.mll..', '.llm....', '...m.ll.', '.hlmll..', '.l.m....', '...mlh..', '..lm....', '...d....', '...d....'],
    ['...G....', '..GFD...', '...m.lh.', 'hl.mll..', '.llm....', '...m.ll.', 'hllmll..', '...m..G.', '...mlFD.', 'GFlm....', 'FD.m.ll.', '..lmll..', '...d....', '...d....'],
    ['..GFG...', '.GFFFD..', '..FDD...', '...m....', 'hl.m.llh', '.llmll..', '...m....', '.hlmllh.', 'll.m.ll.', '...m....', 'hllmllh.', '.l.m.l..', '...c....', '...c....', '...b....', '...b....'],
  ]
  return shadowed(stand(b, looks[look]), [3, 3, 5, 5, 7, 7][look])
}

/* ---------- ground cover: a mat lying flat on the soil ---------- */
function groundCover(look) {
  const b = new Bitmap(CW, CH)
  const looks = [
    ['.lh.', 'lmml', '.dd.'],
    ['..lhl..', '.lmmml.', 'lmdmmdl', '.ddmdd.', '..ooo..'],
    ['...lhll...', '.lhmmmlhl.', 'lmmdmmmdml', 'mdmmlmdmmd', '.ddmddmdd.', '...oooo...'],
    ['....lhhl....', '..lhmmmmhl..', '.lmmdmlmmml.', 'lmdmmmmdmmdl', 'mdmmlmdmmlmd', '.ddmddmddmd.', '...oooooo...'],
    ['.....lhhl.....', '...lhmmFmhl...', '.lhmmdmmmmGhl.', 'lmGmmmmdmmmFml', 'mdFmmlmmmdmmmd', 'mdmmdmmGmmdmmd', '.ddmddmFddmdd.', '...oooooooo...'],
    ['......lhhl......', '...lhhmmmmhhl...', '..lmmGmmdmmFml..', '.lmdmFmmmmGmmdl.', 'lmmmmdmmGmmFmmml', 'mdGmmmmdFmmmmdmd', 'mdFmdmmmmmdmGmmd', '.ddmmdmmdmmdFdd.', '..oddmddmddmdo..', '....oooooooo....'],
  ]
  return shadowed(stand(b, looks[look]), 0)
}

/* ---------- root: a mound of earth with a fan of leaves ---------- */
function root(look) {
  const b = new Bitmap(CW, CH)
  // The mound: a dome of turned earth, paler than the soil it sits on, lit from the left, with a dark line down
  // each side so it stands out from the tile. The leaves fan out of its top.
  const looks = [
    ['.h.', '.m.', 'svus'],
    ['..h..', '.lml.', '..m..', '.svu.', 'svuts'],
    ['.h.h.h.', '.l.m.l.', '..lml..', '..svu..', '.svuts.', 'svvuuts'],
    ['h...h...h', '.l..m..l.', '..l.m.l..', '...lml...', '..svvus..', '.svvuuts.', 'svvuuuuts'],
    ['h...h...h', '.l..m..l.', '..l.m.l..', '...lml...', '..GFFFD..', '..sFFDs..', '.svvuuts.', 'svvuuuuts'],
    ['.h..h.h..h.', '.l..l.m..l.', '..l.lhm.l..', '...l.m.l...', '....lml....', '..GGFFFFD..', '..GFFFFDD..', '...sFFDs...', '..svvuuts..', '.svvvuuuts.', 'svvvuuuuuts'],
  ]
  return shadowed(stand(b, looks[look]), 0)
}

/* ---------- vine: leaves climbing a pole; the tree is a trellis ---------- */
function vine(look) {
  const b = new Bitmap(CW, CH)
  const looks = [
    ['.f.', '.e.', 'le.', '.eh', '.c.'],
    ['..f..', '..e..', '.le..', '..ehl', '..e..', 'hle..', '..el.', '..c..', '..c..'],
    ['..f...', '..e...', '.hel..', '.le...', '..e.lh', '..ell.', 'hle...', '.le...', '..ehl.', '..e.l.', '..c...', '..c...'],
    ['...f...', '..hel..', '..le...', '...e.lh', '...ell.', '.hle...', '..le...', '...ehl.', '...e.ll', 'hlle...', '.l.e...', '...elh.', '...el..', '...c...', '...c...'],
    ['..lhl.f.lhl..', '.lmmmfefmmml.', '..dFDfefdmd..', '...G..e......', '....hle......', '....le.......', '.....e.lh....', '.....ell.....', '...hle..G....', '....le.FD....', '.....ehl.....', '.....e.ll....', '..hlle.......', '...l.e.......', '.....elh.....', '.....c.......', '.....c.......'],
    ['...lhhhhhhhl...', '.lhmmlmmmlmmhl.', 'lmmGmmmdmmmFmml', 'dmFDmdmmmdmDmmd', '.ffeeeeeeeeeff.', '.e.dmd.d.dmd.e.', '.ehl...G...hle.', 'lle...FD....ell', '.e.lh.....hl.e.', '.ell.......lle.', 'hle.........elh', '.e.........l.e.', '.ehl.......hle.', '.e...........e.', '.c...........c.', '.c...........c.', '.b...........b.'],
  ]
  return shadowed(stand(b, looks[look]), [3, 3, 3, 5, 7, 15][look])
}

function shadowed(b, w) { shadow(b, w); return b }

const LAYERS = { canopy, understory, shrub, herb, 'ground-cover': groundCover, root, vine }

const hexOf = (c) => '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
const STRAW = new Map([[P.g0, P.d0], [P.g1, P.d1], [P.g2, P.d2], [P.g3, P.d3], [P.g4, P.d4], [P.key, P.d2], [P.keyLight, P.d3], [P.keyDark, P.d1]])

/** The same sprite gone dry: its greens turned to straw, and its fruit dried to the same brown, so nothing of the field's colour is left on it. */
export function wilted(b) {
  const o = new Bitmap(b.w, b.h)
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const c = b.get(x, y)
    if (c) o.set(x, y, c[3] === 255 && STRAW.has(hexOf(c)) ? STRAW.get(hexOf(c)) : c)
  }
  return o
}

export const LAYER_ORDER = ['canopy', 'understory', 'shrub', 'herb', 'ground-cover', 'root', 'vine']

/** Every crop sprite: `crop/<layer>/<look>` and its wilted twin, each with the tile's top corner at (12, 18). */
export function crops() {
  const out = {}
  for (const layer of LAYER_ORDER) for (let look = 0; look < 6; look++) {
    const b = LAYERS[layer](look)
    out['crop/' + layer + '/' + look] = { b, ax: CX, ay: GROUND - 12 }
    out['crop/' + layer + '/' + look + '/wilted'] = { b: wilted(b), ax: CX, ay: GROUND - 12 }
  }
  return out
}
