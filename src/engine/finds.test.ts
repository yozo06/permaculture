import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { findCandidates, pickFind } from './finds'
import type { PackDef } from './types'

const seed = (id: string, extra: object = {}) => ({ id, name: id, layer: 'herb', branch: 'b', tier: 0, harvest: 'artifact', ...extra })
const pack: PackDef = {
  pack: 'p', version: 0, title: 'P', branches: [{ id: 'b', title: 'B' }],
  seeds: [seed('one'), seed('two'), seed('three')] as PackDef['seeds'],
  finds: [{ id: 'f-one', near: ['one'], text: 'near one' }, { id: 'f-two', near: ['two'], text: 'near two' }, { id: 'f-three', near: ['three'], text: 'near three' }],
}
const catalog = buildCatalog([pack])
const ids = (xs: { id: string }[]) => xs.map((f) => f.id)

describe('findCandidates', () => {
  it('prefers finds near a growing crop', () => {
    const crops = [{ seed: 'one', perennial: false }, { seed: 'two', perennial: true }]
    expect(ids(findCandidates({ crops, foraged: [] }, catalog))).toEqual(['f-one'])
  })

  it('then finds near anything planted', () => {
    expect(ids(findCandidates({ crops: [{ seed: 'two', perennial: true }], foraged: [] }, catalog))).toEqual(['f-two'])
  })

  it('then any find, but never one already foraged', () => {
    expect(ids(findCandidates({ crops: [], foraged: ['f-two'] }, catalog))).toEqual(['f-one', 'f-three'])
    expect(findCandidates({ crops: [], foraged: ['f-one', 'f-two', 'f-three'] }, catalog)).toEqual([])
  })
})

describe('pickFind', () => {
  it('gives the same find for the same tile and day', () => {
    const cands = findCandidates({ crops: [], foraged: [] }, catalog)
    expect(pickFind(cands, 3, 4, 5)).toEqual(pickFind(cands, 3, 4, 5))
    expect(pickFind([], 3, 4, 5)).toBeUndefined()
  })
})
