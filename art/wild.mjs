// What grows and lies beyond the fence: forest trees, bushes, rocks, tufts of grass. And the sky's sun and clouds.
import { Bitmap, foliage, grid } from './kit.mjs'
import { P, SHADOW } from './palette.mjs'

const GREEN = [P.g0, P.g1, P.g2, P.g3, P.g4]
const PINE = [P.n0, P.n1, P.n2, P.n3, P.n4]
const WOOD = { a: P.w0, b: P.w1, c: P.w2, d: P.w3 }
const at = (b, ax, ay) => ({ b, ax, ay })

/** A row of shadow on the ground, `w` wide, centred on `cx`. */
function shade(b, cx, y, w) { for (let x = cx - Math.floor(w / 2); x <= cx + Math.floor(w / 2); x++) if (!b.get(x, y)) b.set(x, y, SHADOW) }

/** A broadleaf tree: a short trunk under a crown of three or four discs. */
function broadleaf(discs) {
  const b = new Bitmap(24, 30)
  b.blit(grid(['.ab.', 'abca', 'abca', 'abca', 'abca', 'abcda', '.aaa.'], WOOD), 10, 22)
  shade(b, 12, 29, 11)
  b.blit(foliage(24, 24, discs, GREEN), 0, 0)
  return at(b, 12, 17)
}

/** A pine: tiers of needles that come to a point, a step bluer than the leaves. */
function pine() {
  const b = new Bitmap(24, 30)
  b.blit(grid(['abca', 'abca', 'abca', '.aa.'], WOOD), 10, 25)
  shade(b, 12, 29, 9)
  const rows = [1, 3, 3, 5, 5, 7, 5, 7, 9, 9, 11, 9, 11, 13, 13, 15, 13, 15, 17, 17]
  const cone = new Bitmap(24, 30)
  rows.forEach((w, i) => {
    const x0 = 12 - Math.floor(w / 2)
    for (let k = 0; k < w; k++) {
      const t = w === 1 ? 0 : k / (w - 1)
      // each tier ends in a lip of shade, where the next tier begins narrower
      const lip = rows[i + 1] !== undefined && rows[i + 1] < w
      cone.set(x0 + k, 4 + i, lip && t > 0.2 ? PINE[1] : t < 0.28 ? PINE[4] : t < 0.52 ? PINE[3] : t < 0.8 ? PINE[2] : PINE[1])
    }
  })
  b.blit(cone.outline(PINE[0]), 0, 0)
  return at(b, 12, 17)
}

function bush() {
  const b = foliage(16, 13, [[8, 6, 3.6], [5, 7, 2.6], [11, 7, 2.6]], GREEN)
  shade(b, 8, 11, 9)
  return at(b, 8, 0)
}

const ROCK = { o: P.ink, S: P.k3, s: P.k2, K: P.k1, k: P.k0, x: SHADOW }
const rock = () => at(grid([
  '...oooo...',
  '.ooSSSsoo.',
  'oSSSsssKKo',
  'oSsssKKKko',
  '.oossKkoo.',
  '.xxooooxx.',
], ROCK), 5, -6)

const TUFT = { l: P.g3, G: P.g2, d: P.g1 }
const tuft = (n) => at(grid([['.l...l..', 'l.G.l.G.', '.G.d.G..'], ['...l....', '.l.G.l..', '.G.d.G.l'], ['l....l..', 'G.l..G..', '.d.G..G.']][n], TUFT), 4, -7)

const SKY = { o: P.y0, y: P.y1, Y: P.y2, w: '#FFFFFF', W: '#EAF4FB', b: '#CFE4F2' }
const sun = () => at(grid([
  '.......Y........',
  '..Y....y.....Y..',
  '...y..yyyy..y...',
  '.....yYYYYy.....',
  '....yYYYYYYy....',
  '...yYYYYYYYYy...',
  '.yyyYYYYYYYYyyy.',
  'Yy.yYYYYYYYYy.yY',
  '...yYYYYYYYYy...',
  '....yYYYYYYy....',
  '.....yYYYYy.....',
  '...y..yyyy..y...',
  '..Y....y.....Y..',
  '.......Y........',
], SKY), 8, 7)
const cloud = (n) => at(grid([
  ['.....wwww.......', '..wwwwwwwww.....', '.wwwwwwwwwwwww..', 'wwwwwwwwwwwwwww.', 'WWwwwwwwwwwwwwWW', '.bWWWWWWWWWWWb..'],
  ['...wwww.....', '.wwwwwwww...', 'wwwwwwwwwww.', 'WwwwwwwwwwWW', '.bWWWWWWWb..'],
  ['......wwwww.........', '...wwwwwwwwww.......', '.wwwwwwwwwwwwwwww...', 'wwwwwwwwwwwwwwwwwww.', 'WWwwwwwwwwwwwwwwwwWW', '.bbWWWWWWWWWWWWWbb..'],
][n], SKY), 0, 0)

export function wild() {
  return {
    'wild/tree/0': broadleaf([[12, 9, 7], [7, 13, 5], [17, 13, 5], [12, 15, 5]]),
    'wild/tree/1': broadleaf([[11, 8, 6], [15, 12, 6], [8, 14, 5]]),
    'wild/tree/2': pine(),
    'wild/bush': bush(),
    'wild/rock': rock(),
    'wild/tuft/0': tuft(0), 'wild/tuft/1': tuft(1), 'wild/tuft/2': tuft(2),
    'sky/sun': sun(),
    'sky/cloud/0': cloud(0), 'sky/cloud/1': cloud(1), 'sky/cloud/2': cloud(2),
  }
}
