// Draws every sprite and packs them into one sheet. Run it with `npm run art`.
//   src/game/art/sheet.png   the sprite sheet
//   src/game/art/atlas.json  where each sprite is on it: name -> [x, y, w, h, ax, ay, top]
// (ax, ay) is the pixel of the sprite that sits on the top corner of its tile, and `top` is its first row with
// anything drawn in it, so the game knows how tall the thing itself is.
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

/** Pack sprites onto shelves, tallest first, with a pixel of space round each so nothing bleeds into its neighbour. */
export function pack(all, width = 512) {
  const names = Object.keys(all).sort((a, b) => all[b].b.h - all[a].b.h || (a < b ? -1 : 1))
  const atlas = {}
  let x = 1, y = 1, shelf = 0
  for (const name of names) {
    const { b, ax, ay } = all[name]
    if (x + b.w + 1 > width) { x = 1; y += shelf + 1; shelf = 0 }
    let top = 0
    while (top < b.h - 1 && !Array.from({ length: b.w }, (_, i) => b.get(i, top)).some(Boolean)) top++
    atlas[name] = [x, y, b.w, b.h, ax, ay, top]
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
