# The art

Everything on the farm is drawn from one picture, the **sprite sheet** (`src/game/art/sheet.png`), and a list of where each thing is on it (`src/game/art/atlas.json`). The land and everything that stands on it are copied from the sheet onto the screen. Only three things are still drawn by code: the sky's two bands of colour, the highlight under the pointer, and the sparks of a small moment.

## Changing the art

There are two ways, and they do not mix.

**By hand.** Open `src/game/art/sheet.png` in Aseprite (or any pixel editor), change the pixels, save. Keep each sprite inside its box: the atlas says where the boxes are. The game reads the file as it is. Two things to mind:

- Save plain pixels: no smoothing, no dithering, no colour profile. The three key colours (below) have to stay exactly themselves, or the game will not know them.
- If a sprite's outline grows or shrinks (a taller crop, a wider barn), the last four numbers of its line in the atlas need changing to match. They say where the drawing itself begins and ends inside its box, and the game uses them to float a droplet over a crop and to decide what a tap lands on. Repainting inside the outline needs nothing.

**By code.** The first version of the sheet was drawn by the scripts in this folder, and `npm run art` draws it again. It writes over the sheet and the atlas, so it also writes over anything changed by hand. Use it to add a sprite or to change every sprite at once (a new palette, say). If the sheet has been touched up by hand since, redo those touches after.

## What is in this folder

- `palette.mjs`: the one palette every sprite uses. Each colour ramp runs from dark to light and shifts its hue as it goes: shadows lean blue, lights lean yellow.
- `kit.mjs`: a small drawing kit with no dependencies: a bitmap, a sprite from rows of letters, polygons and lines, a PNG writer, and `foliage`, the rule every crown and bush is drawn by (a cluster of discs, lit from the top left, with a dark rim).
- `tiles.mjs`: the ground, 32 by 16 diamonds, and the earth under the island's edge.
- `wild.mjs`: forest trees, bushes, rocks, tufts; the sun and the clouds.
- `crops.mjs`: the seven layers, six looks each (stages 1 to 5, then the tree), and a wilted twin of every one.
- `props.mjs`: the barn, the well, the compost heap, the signpost, the gate, the market stall, fences, flags, the farmer, and the marks that float over a crop.
- `build.mjs`: draws everything, packs it onto one sheet and writes the atlas.

## The rules the art follows

- **One light, one palette.** Light comes from the top left. Use the colours in `palette.mjs` and no others, so that a new sprite belongs with the old ones.
- **The key colours.** Three colours stand for "this field's own": `#FF99FF`, `#FF00FF` and `#990099` (its light, itself, its shade). The game repaints them with the colour of the field a thing belongs to. Fruit, flags and the caps of fence posts are drawn in them. A wilted crop has none of them: its fruit dries to the same straw as its leaves. No other colour on the sheet may come within a hair of these three.
- **Where a sprite stands.** Each entry in the atlas is `[x, y, w, h, ax, ay, top, left, right, bottom]`. `(ax, ay)` is the pixel of the sprite that sits on the top corner of its tile. The last four are the box of what is drawn: its first and last rows and columns with anything in them. A crop's foot is 11 pixels below its tile's top corner.
- **Names.** `tile/<kind>/<n>`, `wild/...`, `crop/<layer>/<look>` and `crop/<layer>/<look>/wilted`, and the buildings by their own names. `src/game/art/sprites.test.ts` lists what the game needs and fails if one is missing.

## Licence

The art was made for this game and is part of this repository.
