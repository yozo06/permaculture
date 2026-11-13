import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/engine/catalog'
import { apply, fieldsToOpen, fold } from '../src/engine/fold'
import sampleFarm from '../src/game/sample-farm.json'
import { bagView, treeView } from '../src/game/views'
import { collectPacks, defaultPacksDir, loadPacks, packFiles } from './packs-lib.mjs'

const temps: string[] = []
function tempCopy(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'permaculture-packs-'))
  temps.push(dir)
  cpSync(defaultPacksDir, dir, { recursive: true })
  return dir
}
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Rewrite one pack file in a temp copy. */
function edit(dir: string, file: string, change: (text: string) => string): void {
  const p = path.join(dir, file)
  const before = readFileSync(p, 'utf8')
  const after = change(before)
  if (after === before) throw new Error('the edit to ' + file + ' changed nothing')
  writeFileSync(p, after)
}
const errorsOf = (dir: string): string[] => loadPacks(dir).flatMap((r) => r.errors)

describe('the repo packs', () => {
  it('all load, with no errors', () => {
    const files = packFiles()
    expect(files).toEqual(expect.arrayContaining(['haskell-backend.yaml', 'infra.yaml', 'kannada.yaml', 'system-design.yaml', 'workshop.yaml']))
    expect(errorsOf(defaultPacksDir)).toEqual([])
    expect(collectPacks()).toHaveLength(files.length)
  })

  it('give the Workshop an energy cap', () => {
    expect(collectPacks().find((p) => p.pack === 'workshop')?.energy_cap).toBe(30)
  })
})

describe('a broken pack', () => {
  it('names an unknown branch', () => {
    const dir = tempCopy()
    edit(dir, 'infra.yaml', (t) => t.replace('branch: network-and-platform', 'branch: nowhere'))
    expect(errorsOf(dir).join('\n')).toContain('branch "nowhere" is not in branches')
  })

  it('names a prerequisite cycle', () => {
    const dir = tempCopy()
    // tcp (tier 0) needs mesh, and mesh needs k8s and tls, which need tcp.
    edit(dir, 'infra.yaml', (t) => t.replace('  - id: tcp\n', '  - id: tcp\n    needs: [mesh]\n'))
    expect(errorsOf(dir).join('\n')).toContain('prerequisite cycle')
  })

  it('names a seed id used in two packs', () => {
    const dir = tempCopy()
    edit(dir, 'workshop.yaml', (t) => t.replace('id: repo\n', 'id: raft\n'))
    expect(errorsOf(dir).join('\n')).toContain('seed id "raft" is also used in')
  })

  it('names a wild seed that no find points at', () => {
    const dir = tempCopy()
    edit(dir, 'infra.yaml', (t) => t.replace('  - id: slo\n', '  - id: slo\n    wild: true\n'))
    expect(errorsOf(dir).join('\n')).toContain('seed slo: wild, but no find points at it')
  })

  it('names a find that points at a seed that is not wild', () => {
    const dir = tempCopy()
    edit(dir, 'infra.yaml', (t) => t.replace('  - id: quic\n', '  - id: quic\n    seed: tcp\n'))
    expect(errorsOf(dir).join('\n')).toContain('find quic: seed "tcp" is not wild')
  })

  it('names a guild id used twice in one pack, and a guild that lists a seed twice', () => {
    const dir = tempCopy()
    edit(dir, 'infra.yaml', (t) => t.replace('  - id: edge-and-names\n', '  - id: container-runtime\n'))
    expect(errorsOf(dir).join('\n')).toContain('duplicate guild id container-runtime')
    const twice = tempCopy()
    edit(twice, 'infra.yaml', (t) => t.replace('seeds: [linux-namespaces, container-images, k8s-resources, k8s]', 'seeds: [linux-namespaces, container-images, k8s, k8s]'))
    expect(errorsOf(twice).join('\n')).toContain('guild container-runtime: lists "k8s" twice')
  })

  it('lists every problem in one Error from collectPacks', () => {
    const dir = tempCopy()
    edit(dir, 'infra.yaml', (t) => t.replace('branch: network-and-platform', 'branch: nowhere'))
    edit(dir, 'workshop.yaml', (t) => t.replace('id: repo\n', 'id: raft\n'))
    expect(() => collectPacks(dir)).toThrowError(/Invalid packs:[\s\S]*infra\.yaml[\s\S]*workshop\.yaml/)
  })

  it('fails on YAML that does not parse', () => {
    const dir = tempCopy()
    writeFileSync(path.join(dir, 'oops.yaml'), 'pack: [unclosed\n')
    expect(errorsOf(dir).join('\n')).toContain('YAML does not parse')
  })
})

describe('a seed that has to be earned', () => {
  /** The errors after giving the Workshop's first seed, which asks for nothing, this `earned`. */
  const withEarned = (earned: string): string => {
    const dir = tempCopy()
    edit(dir, 'workshop.yaml', (t) => t.replace('\n  - id: repo\n', '\n  - id: repo\n    earned: ' + earned + '\n'))
    return errorsOf(dir).join('\n')
  }

  it('may ask for seeds rooted in other fields, seeds rooted in one field, or the readiness of one field', () => {
    for (const ok of ['{ rooted: 1 }', '{ pack: kannada, rooted: 4 }', '{ pack: infra, readiness: 60 }']) expect(withEarned(ok), ok).toBe('')
  })

  it('asks for one thing: seeds rooted or a readiness, and a readiness names its field', () => {
    expect(withEarned('{ pack: infra, rooted: 2, readiness: 60 }')).toContain('seed repo: earned asks for rooted or readiness, not both')
    expect(withEarned('{ pack: infra }')).toContain('seed repo: earned asks for nothing: give it rooted or readiness')
    expect(withEarned('{ readiness: 60 }')).toContain('seed repo: earned by readiness has to name the pack')
  })

  it('names a pack that exists, is not its own, and for readiness has an end', () => {
    expect(withEarned('{ pack: nowhere, rooted: 1 }')).toContain('seed repo: earned names an unknown pack "nowhere"')
    expect(withEarned('{ pack: workshop, rooted: 1 }')).toContain('seed repo: earned names its own pack')
    expect(withEarned('{ pack: kannada, readiness: 60 }')).toContain('seed repo: earned asks for the readiness of kannada, which has no end and so no readiness')
  })

  it('never asks for more than there is to root', () => {
    expect(withEarned('{ pack: kannada, rooted: 9 }')).toContain('seed repo: earned asks for 9 rooted seeds, and kannada has 8')
    expect(withEarned('{ rooted: 100000 }')).toContain('/seeds/')
    const every = collectPacks().filter((p) => p.pack !== 'workshop').reduce((n, p) => n + p.seeds.filter((x) => x.wild !== true).length, 0)
    expect(withEarned('{ rooted: ' + every + ' }')).toBe('')
    expect(withEarned('{ rooted: ' + (every + 1) + ' }')).toContain('seed repo: earned asks for ' + (every + 1) + ' rooted seeds, and the other packs have ' + every)
  })

  it('does not blame a pack that exists for another file being broken', () => {
    const dir = tempCopy()
    // The Workshop's weather is earned by Infra. Break Infra's shape: only Infra should be reported.
    edit(dir, 'infra.yaml', (t) => t.replace('\nversion: 0\n', '\nversion: zero\n'))
    const said = errorsOf(dir).join('\n')
    expect(said).toContain('/version')
    expect(said).not.toContain('unknown pack')
  })

  it('takes whole numbers in range and no other keys', () => {
    for (const bad of ['{ rooted: 0 }', '{ pack: infra, readiness: 0 }', '{ pack: infra, readiness: 101 }', '{ rooted: 1.5 }', '{ rooted: 1, by: friday }', 'soon']) {
      expect(withEarned(bad), bad).toContain('/seeds/')
    }
  })
})

describe("a pack's own bar", () => {
  it('is one a farmer could have set: 1 to 100', () => {
    const withBar = (bar: string): string => {
      const dir = tempCopy()
      edit(dir, 'infra.yaml', (t) => t.replace('\nversion: 0\n', '\nversion: 0\nreadiness_bar: ' + bar + '\n'))
      return errorsOf(dir).join('\n')
    }
    for (const ok of ['1', '80', '100']) expect(withBar(ok), ok).toBe('')
    for (const bad of ['0', '101', '79.5']) expect(withBar(bad), bad).toContain('/readiness_bar')
  })
})

describe('adding a seed to a YAML file', () => {
  // An id real content will never use, so the test keeps working as the packs grow.
  const NEW_SEED = `  - id: added-in-a-test
    name: A seed added in a test
    layer: ground-cover
    branch: network-and-platform
    tier: 0
    harvest: recall
    questions:
      water:
        - q: A lower TTL on a record means…
          answer: Resolvers re-ask sooner, so a change spreads faster
          distractors:
            - The record is encrypted
            - The name server answers faster
          why: The TTL is how long a resolver may reuse its answer.
`

  it('shows up in the seed bag and the learning tree with no code change', () => {
    const dir = tempCopy()
    // The new seed goes first in the pack's `seeds:` list, wherever that list sits in the file.
    edit(dir, 'infra.yaml', (t) => t.replace('\nseeds:\n', '\nseeds:\n' + NEW_SEED))
    const catalog = buildCatalog(collectPacks(dir))
    const imported = fold([{ type: 'snapshot-imported', snapshot: sampleFarm }], catalog)
    const state = fieldsToOpen(imported, catalog).reduce((s, e) => apply(s, e, catalog), imported)

    const bag = bagView(state, catalog).find((s) => s.pack === 'infra')
    expect(bag?.seeds.find((s) => s.id === 'added-in-a-test')).toMatchObject({ name: 'A seed added in a test', status: 'ready', harvest: 'recall' })

    const tree = treeView('infra', state, catalog)
    expect(tree?.nodes.find((n) => n.id === 'added-in-a-test')).toMatchObject({ status: 'ready' })
  })
})
