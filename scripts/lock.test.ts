// The lock on what saved farms depend on. A farm is replayed against today's packs, and an event that no longer
// fits is skipped, so renaming a seed or tightening what it needs would quietly empty someone's field.
// packs/lock.json records every id and the properties replay depends on; this test fails when a change would
// hurt a saved farm, and when the lock is simply out of date. `npm run lock` brings it up to date, and refuses to
// while a breaking change stands.
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PackDef } from '../src/engine/types'
import { lockOf, lockProblems, lockText, type Lock } from './lock'
import { collectPacks, defaultPacksDir } from './packs-lib.mjs'

const LOCK_FILE = path.join(defaultPacksDir, 'lock.json')

const base: PackDef[] = [
  {
    pack: 'garden', version: 0, title: 'Garden', energy_cap: 50,
    branches: [{ id: 'roots', title: 'Roots' }, { id: 'leaves', title: 'Leaves' }],
    finds: [{ id: 'bee-find', near: ['corn'], text: 'Bees.', seed: 'bees' }, { id: 'worm-find', near: ['corn'], text: 'Worms.' }],
    seeds: [
      { id: 'corn', name: 'Corn', layer: 'canopy', branch: 'roots', tier: 0, harvest: 'recall' },
      { id: 'squash', name: 'Squash', layer: 'herb', branch: 'leaves', tier: 1, needs: ['corn'], harvest: 'artifact' },
      { id: 'bees', name: 'Bees', layer: 'herb', branch: 'roots', tier: 1, wild: true, harvest: 'recall' },
    ],
  },
  { pack: 'shed', version: 0, title: 'Shed', branches: [{ id: 'build', title: 'Build' }], seeds: [{ id: 'saw', name: 'Saw', layer: 'herb', branch: 'build', tier: 0, harvest: 'judged' }] },
]
const locked = lockOf(base)
/** The packs with one thing changed. */
const changed = (edit: (packs: PackDef[]) => void): Lock => {
  const copy: PackDef[] = JSON.parse(JSON.stringify(base))
  edit(copy)
  return lockOf(copy)
}
const seedOf = (packs: PackDef[], id: string) => {
  const seed = packs.flatMap((p) => p.seeds).find((s) => s.id === id)
  if (!seed) throw new Error('no seed ' + id)
  return seed
}

describe('lockProblems', () => {
  it('finds nothing wrong with packs that have not changed', () => {
    expect(lockProblems(locked, lockOf(base))).toEqual([])
  })

  it('lets a pack grow and loosen: new seeds, finds and branches, fewer needs, a higher or lifted cap', () => {
    const now = changed((p) => {
      p[0]?.seeds.push({ id: 'peas', name: 'Peas', layer: 'vine', branch: 'new', tier: 0, harvest: 'recall' })
      p[0]?.branches.push({ id: 'new', title: 'New' })
      p[0]?.finds?.push({ id: 'ant-find', near: ['corn'], text: 'Ants.' })
      delete seedOf(p, 'squash').needs
      seedOf(p, 'bees').wild = false
      seedOf(p, 'saw').harvest = 'artifact'
      const worms = p[0]?.finds?.[1]
      if (worms) worms.seed = 'bees'
      if (p[0]) p[0].energy_cap = 60
      p.push({ pack: 'pond', version: 0, title: 'Pond', branches: [{ id: 'a', title: 'A' }], seeds: [] })
    })
    expect(lockProblems(locked, now)).toEqual([])
  })

  it.each<[string, (p: PackDef[]) => void, RegExp]>([
    ['a seed that is removed or renamed', (p) => { seedOf(p, 'corn').id = 'maize' }, /seed "corn" is gone/],
    ['a seed that moves to another pack', (p) => { p[1]?.seeds.push(...(p[0]?.seeds.splice(0, 1) ?? [])) }, /seed "corn" moved from garden to shed/],
    ['a seed that needs more', (p) => { seedOf(p, 'squash').needs = ['corn', 'bees'] }, /seed "squash" now needs "bees"/],
    ['a seed that becomes wild', (p) => { seedOf(p, 'corn').wild = true }, /seed "corn" became wild/],
    ['an artifact seed that asks for a longer write-up', (p) => { seedOf(p, 'squash').harvest = 'judged' }, /seed "squash" went from artifact to judged/],
    ['a find that is removed', (p) => { p[0]?.finds?.splice(1, 1) }, /find "worm-find" is gone/],
    ['a find that leads somewhere else', (p) => { const f = p[0]?.finds?.[0]; if (f) delete f.seed }, /find "bee-find" no longer leads to "bees"/],
    ['a branch that is removed', (p) => { p[0]?.branches.splice(1, 1) }, /branch "leaves" of garden is gone/],
    ['a pack that is removed', (p) => { p.splice(1, 1) }, /pack "shed" is gone/],
    ['a cap that is lowered', (p) => { if (p[0]) p[0].energy_cap = 40 }, /garden.*cap.*50.*40/],
    ['a cap that is added', (p) => { if (p[1]) p[1].energy_cap = 30 }, /shed.*cap/],
  ])('refuses %s', (_name, edit, message) => {
    const problems = lockProblems(locked, changed(edit))
    expect(problems.join('\n')).toMatch(message)
  })
})

describe('the packs in this repo', () => {
  it('have not changed in a way that would hurt a saved farm, and packs/lock.json is up to date', async () => {
    const now = lockOf(collectPacks())
    let committed: Lock | null = null
    try { committed = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as Lock } catch { /* the first run writes it */ }
    // Checked first on purpose: while a breaking change stands, `npm run lock` stops here and writes nothing.
    // If farms really cannot be hurt, edit packs/lock.json by hand in the same pull request and say why.
    if (committed) expect(lockProblems(committed, now)).toEqual([])
    // Out of date (a new seed, a loosened rule)? Run `npm run lock` and commit the file.
    await expect(lockText(now)).toMatchFileSnapshot(LOCK_FILE)
  })
})
