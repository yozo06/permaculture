// Draws every sprite and packs them into one sheet. Run it with `npm run art`.
//   src/game/art/sheet.png   the sprite sheet
//   src/game/art/atlas.json  where each sprite is on it: name -> [x, y, w, h, ax, ay, top, left, right, bottom]
// (ax, ay) is the pixel of the sprite that sits on the top corner of its tile. The last four are the box of what is
// drawn in it: its first and last rows and columns with anything in them, so the game knows how big the thing itself
// is, whatever the size of the box it was drawn in.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bitmap, png } from './kit.mjs'
import { crops } from './crops.mjs'
import { props } from './props.mjs'
import { tiles } from './tiles.mjs'
import { wild } from './wild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '..', 'src', 'game', 'art')

/** Every sprite, by name. */
export const sprites = () => ({ ...tiles(), ...wild(), ...crops(), ...props() })

/** The box of what is drawn in a bitmap: [top, left, right, bottom], the first and last rows and columns with anything in them. */
export function drawn(b) {
  let top = b.h - 1, left = b.w - 1, right = 0, bottom = 0
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (!b.get(x, y)) continue
    top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  return [top, left, right, bottom]
}

/** Pack sprites onto shelves, tallest first, with a pixel of space round each so nothing bleeds into its neighbour. */
export function pack(all, width = 512) {
  const names = Object.keys(all).sort((a, b) => all[b].b.h - all[a].b.h || (a < b ? -1 : 1))
  const atlas = {}
  let x = 1, y = 1, shelf = 0
  for (const name of names) {
    const { b, ax, ay } = all[name]
    if (x + b.w + 1 > width) { x = 1; y += shelf + 1; shelf = 0 }
    atlas[name] = [x, y, b.w, b.h, ax, ay, ...drawn(b)]
    x += b.w + 1
    shelf = Math.max(shelf, b.h)
  }
  const sheet = new Bitmap(width, y + shelf + 1)
  for (const name of names) { const [sx, sy] = atlas[name]; sheet.blit(all[name].b, sx, sy) }
  // the atlas lists sprites by name, so a change to one shows as one line
  const sorted = Object.fromEntries(Object.keys(atlas).sort().map((k) => [k, atlas[k]]))
  return { sheet, atlas: { width: sheet.w, height: sheet.h, sprites: sorted } }
}

/** The atlas as the committed file holds it: one sprite to a line. */
export const atlasText = (atlas) =>
  '{\n  "width": ' + atlas.width + ',\n  "height": ' + atlas.height + ',\n  "sprites": {\n' +
  Object.entries(atlas.sprites).map(([k, v]) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n') + '\n  }\n}\n'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { sheet, atlas } = pack(sprites())
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'sheet.png'), png(sheet))
  writeFileSync(path.join(outDir, 'atlas.json'), atlasText(atlas))
  console.log(Object.keys(atlas.sprites).length + ' sprites on a ' + sheet.w + ' by ' + sheet.h + ' sheet')
}
