// A small pixel-drawing kit: a bitmap, a few shape helpers, and a PNG writer. No dependencies: only Node.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

export const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255] }

export class Bitmap {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4) }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null; const i = (y * this.w + x) * 4; return this.d[i + 3] ? [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]] : null }
  set(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return; const i = (y * this.w + x) * 4; const [r, g, b, a] = typeof c === 'string' ? hex(c) : c; this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a ?? 255 }
  clear(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; this.d[i + 3] = 0 }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c) }
  /** Copy a sprite on. A see-through pixel is mixed with what is under it, if anything is; onto nothing it stays see-through. */
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y); if (!c) continue
      const under = this.get(ox + x, oy + y)
      if (c[3] === 255 || !under) { this.set(ox + x, oy + y, c); continue }
      const a = c[3] / 255
      this.set(ox + x, oy + y, [Math.round(c[0] * a + under[0] * (1 - a)), Math.round(c[1] * a + under[1] * (1 - a)), Math.round(c[2] * a + under[2] * (1 - a)), under[3]])
    }
  }
  /** Paint every empty pixel that touches a filled one (4 sides). `only` limits it to sides: 'all' or 'below'. */
  outline(c, { corners = false } = {}) {
    const add = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1], ...(corners ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [])]
      if (n.some(([dx, dy]) => this.get(x + dx, y + dy))) add.push([x, y])
    }
    for (const [x, y] of add) this.set(x, y, c)
    return this
  }
  scaled(k) { const o = new Bitmap(this.w * k, this.h * k); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y); if (c) o.rect(x * k, y * k, k, k, c) } return o }
  fill(c) { this.rect(0, 0, this.w, this.h, c); return this }
}

/** A sprite from rows of characters and a legend of character -> colour. '.' and ' ' are empty. */
export function grid(rows, legend) {
  const w = Math.max(...rows.map((r) => r.length))
  const b = new Bitmap(w, rows.length)
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && ch !== ' ') { const c = legend[ch]; if (!c) throw new Error('no colour for "' + ch + '"'); b.set(x, y, c) } }))
  return b
}

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }

/** The bitmap as PNG bytes: 8-bit RGBA, no interlace. */
export function png(b) {
  const head = Buffer.alloc(13); head.writeUInt32BE(b.w, 0); head.writeUInt32BE(b.h, 4); head[8] = 8; head[9] = 6
  const raw = Buffer.alloc((b.w * 4 + 1) * b.h)
  for (let y = 0; y < b.h; y++) { raw[y * (b.w * 4 + 1)] = 0; Buffer.from(b.d.buffer, y * b.w * 4, b.w * 4).copy(raw, y * (b.w * 4 + 1) + 1) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
export const save = (b, file) => writeFileSync(file, png(b))

/** Fill a polygon (points as [x, y]) by testing pixel centres. `paint(x, y)` may return a colour, or nothing to skip. */
export function poly(b, pts, paint) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
    if (!inside) continue
    const c = typeof paint === 'function' ? paint(x, y) : paint
    if (c) b.set(x, y, c)
  }
}
/** A line of pixels from one point to another. */
export function line(b, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let i = 0; i <= n; i++) b.set(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), c)
}

/**
 * Leaves as a cluster of discs, lit from the top left, with a dark rim: the one rule every crown and bush is drawn by.
 * `discs` are [cx, cy, r]; `ramp` is five colours, dark to light.
 */
export function foliage(w, h, discs, ramp) {
  const b = new Bitmap(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = null
    for (const [cx, cy, r] of discs) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy > r * r + r * 0.6) continue
      const lit = (-dx * 0.7 - dy) / r
      if (best === null || lit > best) best = lit
    }
    if (best === null) continue
    b.set(x, y, best > 0.62 ? ramp[4] : best > 0.18 ? ramp[3] : best > -0.45 ? ramp[2] : ramp[1])
  }
  return b.outline(ramp[0])
}

/** A number from 0 to 1 that depends only on what it is given: the same texture every time the sheet is drawn. */
export function hash(x, y, k = 0) { let h = (x * 374761393 + y * 668265263 + k * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return (h >>> 0) / 4294967295 }
