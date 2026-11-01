import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/engine/catalog'
import { upgradeV2 } from '../src/engine/v2'
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
    expect(packFiles()).toHaveLength(5)
    expect(errorsOf(defaultPacksDir)).toEqual([])
    expect(collectPacks()).toHaveLength(5)
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

describe('adding a seed to a YAML file', () => {
  const NEW_SEED = `  - id: dns-ttl
    name: DNS TTLs
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
    // Seeds come before finds in the file, so the new seed goes in just ahead of `finds:`.
    edit(dir, 'infra.yaml', (t) => t.replace('\nfinds:\n', '\n' + NEW_SEED.trimEnd() + '\nfinds:\n'))
    const catalog = buildCatalog(collectPacks(dir))
    const state = upgradeV2(sampleFarm, catalog)
    if (!state) throw new Error('the sample farm should upgrade')

    const bag = bagView(state, catalog).find((s) => s.pack === 'infra')
    expect(bag?.seeds.find((s) => s.id === 'dns-ttl')).toMatchObject({ name: 'DNS TTLs', status: 'ready', harvest: 'recall' })

    const tree = treeView('infra', state, catalog)
    expect(tree?.nodes.find((n) => n.id === 'dns-ttl')).toMatchObject({ status: 'ready' })
  })
})
