import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LAYERS } from '../../engine/catalog'
import { KEYS, SHEET, cropHeight, cropLook, cropSprite, iconHtml, paintKeys, sprite, spriteNames, tones } from './sprites'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('the sprite sheet', () => {
  it('is the size the atlas says it is', () => {
    // A PNG says its width and height in bytes 16 to 23.
    const png = readFileSync(path.join(here, 'sheet.png'))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(SHEET)
  })

  it('holds every sprite inside its edges, none on top of another', () => {
    const boxes = spriteNames().map((n) => ({ n, ...sprite(n)! }))
    for (const b of boxes) {
      expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= SHEET.width && b.y + b.h <= SHEET.height, b.n).toBe(true)
      expect(b.w > 0 && b.h > 0 && b.top >= 0 && b.top < b.h, b.n).toBe(true)
    }
    for (const a of boxes) for (const b of boxes) {
      if (a.n < b.n) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, a.n + ' and ' + b.n).toBe(true)
    }
  })

  it('has a sprite for every layer at every look, healthy and wilted', () => {
    for (const layer of LAYERS) for (let look = 0; look < 6; look++) {
      expect(sprite('crop/' + layer + '/' + look), layer + ' ' + look).toBeDefined()
      expect(sprite('crop/' + layer + '/' + look + '/wilted'), layer + ' ' + look + ' wilted').toBeDefined()
    }
  })

  it('has everything else the game draws', () => {
    const needed = [
      'tile/meadow/0', 'tile/meadow/1', 'tile/meadow/2', 'tile/wild/0', 'tile/wild/1', 'tile/wild/2', 'tile/path/0', 'tile/path/1', 'tile/path/2', 'tile/soil/0', 'tile/soil/1',
      'cliff/left/0', 'cliff/left/1', 'cliff/right/0', 'cliff/right/1',
      'wild/tree/0', 'wild/tree/1', 'wild/tree/2', 'wild/bush', 'wild/rock', 'wild/tuft/0', 'wild/tuft/1', 'wild/tuft/2', 'sky/sun', 'sky/cloud/0', 'sky/cloud/1', 'sky/cloud/2',
      'barn', 'gate', 'well', 'compost', 'sign', 'stall', 'stall/lit', 'fence/right', 'fence/left', 'fence/post', 'flag/0', 'flag/1', 'farmer/0', 'farmer/1',
      'mark/thirsty', 'mark/ripe/0', 'mark/ripe/1', 'mark/wilted',
    ]
    expect(needed.filter((n) => !sprite(n))).toEqual([])
    expect(sprite('no/such/sprite')).toBeUndefined()
  })
})

describe('the sprite for a crop', () => {
  it('is by its layer and how far it has grown, and a tree looks the same whatever its stage', () => {
    expect(cropSprite('canopy', 0, false)).toBe('crop/canopy/0')
    expect(cropSprite('root', 3, false)).toBe('crop/root/3')
    expect(cropSprite('vine', 4, true)).toBe('crop/vine/5')
    expect(cropSprite('vine', 1, true)).toBe('crop/vine/5')
  })

  it('reads a stage outside 0 to 4 as the nearest one', () => {
    expect([-3, 0, 2.7, 4, 9, NaN].map((s) => cropLook(s, false))).toEqual([0, 0, 2, 4, 4, 0])
  })

  it('is its own sprite when the crop is wilted', () => {
    expect(cropSprite('herb', 2, false, true)).toBe('crop/herb/2/wilted')
    expect(cropSprite('herb', 2, true, true)).toBe('crop/herb/5/wilted')
  })

  it('grows taller with every look, for the layers that grow up, and a canopy tree is the tallest thing in a field', () => {
    for (const layer of ['canopy', 'understory', 'herb', 'vine'] as const) {
      const heights = [0, 1, 2, 3].map((look) => cropHeight('crop/' + layer + '/' + look))
      expect(heights, layer).toEqual([...heights].sort((a, b) => a - b))
      expect(new Set(heights).size, layer).toBe(4)
    }
    const trees = LAYERS.map((layer) => cropHeight('crop/' + layer + '/5'))
    expect(Math.max(...trees)).toBe(cropHeight('crop/canopy/5'))
    expect(cropHeight('crop/canopy/5')).toBeGreaterThan(20)
    expect(cropHeight('crop/ground-cover/5')).toBeLessThan(14)
    expect(cropHeight('no/such')).toBe(0)
  })
})

describe("a field's colour", () => {
  it('is painted in three tones: lighter, itself, darker', () => {
    expect(tones('#808080')).toEqual({ light: [185, 185, 185], base: [128, 128, 128], dark: [87, 87, 87] })
  })

  it('falls back to one safe colour when a pack gives something that is not a plain hex colour', () => {
    expect(tones('red').base).toEqual(tones('#E0A93E').base)
    expect(tones('#12345').base).toEqual(tones('#E0A93E').base)
  })

  it('replaces the key colours and nothing else', () => {
    const px = (c: readonly number[], a = 255) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, a]
    const data = new Uint8ClampedArray([...px(KEYS.base), ...px(KEYS.light), ...px(KEYS.dark), ...px([10, 200, 30]), ...px(KEYS.base, 0), ...px([255, 0, 254])])
    paintKeys(data, '#808080')
    expect([...data]).toEqual([...px([128, 128, 128]), ...px([185, 185, 185]), ...px([87, 87, 87]), ...px([10, 200, 30]), ...px(KEYS.base, 0), ...px([255, 0, 254])])
  })
})

describe('a sprite in a page of text', () => {
  it('is a box the size of the sprite, cut to what is drawn of it, showing its place on the sheet', () => {
    const s = sprite('crop/canopy/5')!
    const html = iconHtml('crop/canopy/5', 3)
    expect(html).toContain('class="spr"')
    expect(html).toContain('width:' + s.w * 3 + 'px;height:' + (s.h - s.top) * 3 + 'px')
    expect(html).toContain('background-position:-' + s.x * 3 + 'px -' + (s.y + s.top) * 3 + 'px')
    expect(html).toContain('background-size:' + SHEET.width * 3 + 'px ' + SHEET.height * 3 + 'px')
  })

  it('is nothing for a sprite the sheet does not have', () => {
    expect(iconHtml('no/such')).toBe('')
  })
})
