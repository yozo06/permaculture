import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RULES } from './rules'
import {
  BARN, COMPOST, FIELD_SIZE, GATE, MARKET, SIGN, WELL, fenceCost, fieldOf, fieldOrigin, flagTile, hash, homestead, isBuildingTile, neighbourFields,
  nextFreeSlot, shells, slotCell, terrain, tileKey, worldSize, type Fields,
} from './land'

const FOUR: Fields = { a: 0, b: 1, c: 2, d: 3 }
const FIVE: Fields = { ...FOUR, e: 4 }

describe('hash', () => {
  it('is in [0, 1] and deterministic', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 100 }), (x, y, k) => {
        const h = hash(x, y, k)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(1)
        expect(hash(x, y, k)).toBe(h)
      }),
    )
  })

  it('treats a missing salt as zero', () => {
    expect(hash(3, 4)).toBe(hash(3, 4, 0))
  })
})

describe('field slots', () => {
  it('fill in shells: the first four are the Phase 0 positions', () => {
    expect([0, 1, 2, 3].map(fieldOrigin)).toEqual([{ x0: 5, y0: 5 }, { x0: 12, y0: 5 }, { x0: 5, y0: 12 }, { x0: 12, y0: 12 }])
  })

  it('put the fifth field at the right of the top row', () => {
    expect(slotCell(4)).toEqual({ col: 2, row: 0 })
    expect(fieldOrigin(4)).toEqual({ x0: 19, y0: 5 })
  })

  it('give every slot its own cell', () => {
    const cells = new Set(Array.from({ length: 100 }, (_, i) => JSON.stringify(slotCell(i))))
    expect(cells.size).toBe(100)
  })

  it('find the lowest free slot', () => {
    expect(nextFreeSlot({})).toBe(0)
    expect(nextFreeSlot(FOUR)).toBe(4)
    expect(nextFreeSlot({ a: 0, b: 2 })).toBe(1)
  })
})

describe('world size', () => {
  it('is 20 for up to four fields and 27 for five to nine', () => {
    expect(worldSize({})).toBe(20)
    expect(worldSize(FOUR)).toBe(20)
    expect(worldSize(FIVE)).toBe(27)
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['p' + i, i]))
    expect(shells(nine)).toBe(3)
    expect(worldSize(nine)).toBe(27)
    expect(worldSize({ ...nine, p9: 9 })).toBe(34)
  })

  it('has a homestead from tile 4 to 15 (20 wide) or 22 (27 wide)', () => {
    expect(homestead(FOUR)).toEqual({ lo: 4, hi: 15 })
    expect(homestead(FIVE)).toEqual({ lo: 4, hi: 22 })
  })
})

/** The Phase 0 game, written out the way it was, for a farm of four fields. */
function phase0Terrain(x: number, y: number): string {
  const inField = [[5, 5], [12, 5], [5, 12], [12, 12]].some(([x0, y0]) => x >= x0! && x <= x0! + 2 && y >= y0! && y <= y0! + 2)
  if (inField) return 'soil'
  if (x >= 4 && x <= 15 && y >= 4 && y <= 15) return x === 9 || x === 10 || y === 9 || y === 10 ? 'path' : 'grass'
  return 'wild'
}

describe('terrain', () => {
  it('matches Phase 0 on a 20 by 20 world', () => {
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) expect(terrain(x, y, FOUR, {})).toBe(phase0Terrain(x, y))
  })

  it('keeps the buildings where they were, and blocked', () => {
    expect([BARN, WELL, COMPOST, SIGN]).toEqual([{ x: 9, y: 4 }, { x: 15, y: 9 }, { x: 15, y: 10 }, { x: 8, y: 8 }])
    const blocked: string[] = []
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (isBuildingTile(x, y)) blocked.push(tileKey(x, y))
    expect(blocked.sort()).toEqual(['10,15', '10,4', '10,5', '15,10', '15,9', '4,9', '8,8', '9,4', '9,5'].sort())
  })

  it('stands the gate on the main path at the west edge, where nothing could ever be fenced or planted', () => {
    expect(GATE).toEqual({ x: 4, y: 9 })
    for (const fields of [{}, FOUR, FIVE]) expect(terrain(GATE.x, GATE.y, fields, {})).toBe('path')
  })

  it('stands the market stall on the path south of the barn, where nothing could ever be fenced or planted either', () => {
    expect(MARKET).toEqual({ x: 10, y: 15 })
    for (const fields of [{}, FOUR, FIVE]) expect(terrain(MARKET.x, MARKET.y, fields, {})).toBe('path')
  })

  it('repeats the paths every seven tiles in a bigger homestead', () => {
    const paths = Array.from({ length: 27 }, (_, x) => x).filter((x) => terrain(x, 4, FIVE, {}) === 'path')
    expect(paths).toEqual([9, 10, 16, 17])
    expect(terrain(23, 4, FIVE, {})).toBe('wild')
  })

  it('puts the fifth field inside the bigger homestead', () => {
    expect(terrain(19, 5, FIVE, {})).toBe('soil')
    expect(terrain(21, 7, FIVE, {})).toBe('soil')
    expect(terrain(22, 5, FIVE, {})).toBe('grass')
    expect(fieldOf(20, 6, FIVE, {})).toBe('e')
  })
})

describe('fenced tiles', () => {
  const cleared = { [tileKey(8, 5)]: 'a', [tileKey(1, 1)]: 'grass', [tileKey(2, 2)]: 'constructor' }

  it('belong to the pack that fenced them', () => {
    expect(fieldOf(8, 5, FOUR, cleared)).toBe('a')
    expect(terrain(8, 5, FOUR, cleared)).toBe('soil')
  })

  it('can be cleared grass, which is not a field', () => {
    expect(fieldOf(1, 1, FOUR, cleared)).toBeNull()
    expect(terrain(1, 1, FOUR, cleared)).toBe('grass')
  })

  it('ignore a pack that has no field', () => {
    expect(fieldOf(2, 2, FOUR, cleared)).toBeNull()
  })

  it('list the fields that touch a tile, up then left then right then down', () => {
    expect(neighbourFields(8, 5, FOUR, {})).toEqual(['a'])
    expect(neighbourFields(11, 6, FOUR, { [tileKey(10, 6)]: 'a' })).toEqual(['a', 'b'])
    expect(neighbourFields(0, 0, FOUR, {})).toEqual([])
  })

  it('cost what RULES says, and more in forest', () => {
    expect(fenceCost('wild')).toBe(RULES.fence.forest)
    expect(fenceCost('grass')).toBe(RULES.fence.open)
    expect(fenceCost('wild')).toBe(40)
    expect(fenceCost('grass')).toBe(25)
  })
})

describe('flagTile', () => {
  // Where a tile's top corner falls on the screen, as the game draws it: 16 pixels across and 8 down for each step.
  const corner = (t: { x: number; y: number }): { sx: number; sy: number } => ({ sx: (t.x - t.y) * 16, sy: (t.x + t.y) * 8 })
  /** The pole of a flag: one column of pixels, 28 tall, rising from the corner. */
  const poleMeets = (t: { x: number; y: number }, box: { x0: number; x1: number; y0: number; y1: number }): boolean => {
    const { sx, sy } = corner(t)
    return sx >= box.x0 && sx <= box.x1 && sy >= box.y0 && sy - 28 <= box.y1
  }
  // The barn and the gate as they are drawn: the barn two tiles each way under its roof, the gate a post on each side of the main path with a beam between.
  const barn = { x0: corner(BARN).sx - 32, x1: corner(BARN).sx + 32, y0: corner(BARN).sy - 28, y1: corner(BARN).sy + 32 }
  const gate = { x0: corner(GATE).sx - 33, x1: corner(GATE).sx + 1, y0: corner(GATE).sy - 23, y1: corner(GATE).sy + 18 }
  const SLOTS = Array.from({ length: 36 }, (_, i) => i)

  it('stands a flag at a corner of its own field', () => {
    for (const slot of SLOTS) {
      const { x0, y0 } = fieldOrigin(slot)
      expect([{ x: x0, y: y0 }, { x: x0 + FIELD_SIZE, y: y0 }, { x: x0, y: y0 + FIELD_SIZE }], 'slot ' + slot).toContainEqual(flagTile(slot))
    }
  })

  it('uses the north corner wherever nothing is in the way', () => {
    for (const slot of [0, 3, 4, 5, 6, 7, 8]) {
      const { x0, y0 } = fieldOrigin(slot)
      expect(flagTile(slot), 'slot ' + slot).toEqual({ x: x0, y: y0 })
    }
  })

  it('never stands a flag in the gate or against the barn', () => {
    // The north corners of the second and third fields are exactly there.
    expect(poleMeets({ x: fieldOrigin(1).x0, y: fieldOrigin(1).y0 }, barn)).toBe(true)
    expect(poleMeets({ x: fieldOrigin(2).x0, y: fieldOrigin(2).y0 }, gate)).toBe(true)
    for (const slot of SLOTS) {
      expect(poleMeets(flagTile(slot), barn), 'slot ' + slot + ' and the barn').toBe(false)
      expect(poleMeets(flagTile(slot), gate), 'slot ' + slot + ' and the gate').toBe(false)
    }
  })

  it('gives every field a corner of its own', () => {
    const seen = new Set(SLOTS.map((slot) => flagTile(slot).x + ',' + flagTile(slot).y))
    expect(seen.size).toBe(SLOTS.length)
  })
})
