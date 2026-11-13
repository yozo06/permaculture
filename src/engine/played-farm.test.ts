// A farm played on purpose and committed as a log: forty days on the real packs, with every kind of event, right and
// wrong answers, a failed harvest, lazy days, fenced land, finds and a jump over the fence. (Not anyone's real farm:
// a real log holds its owner's notes.) It was given a name when farms could first have one, and a bar for its Infra
// field when a farmer could first set one.
//
// Saved farms are replayed against today's packs and rules, and what no longer fits is skipped. This test is the
// alarm for that: if a change to a rule's number or to a pack makes this farm lose anything, real farms would too.
// Update played-farm.json or the numbers below only on purpose, and say in the pull request how saved farms change.
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from './catalog'
import { allowed, apply, check, fold, initialState, refusedCount } from './fold'
import { fieldOrigin } from './land'
import { parseFarmFile } from './log'
import edge from './edge-farm.json'
import played from './played-farm.json'
import { RULES } from './rules'
import type { FarmEvent, FarmState } from './types'
import yielding from './yield-farm.json'
import { guildCoins, harvestCoins } from './yields'

const catalog = buildCatalog(collectPacks())
const file = parseFarmFile(JSON.stringify(played))
const events = file.kind === 'log' ? file.events : []

describe('the played farm', () => {
  it('is a readable export with every kind of event a player can cause', () => {
    expect(file.kind).toBe('log')
    expect(events).toHaveLength(361)
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual(
      ['bar-set', 'domesticated', 'farm-named', 'farm-started', 'fenced', 'field-opened', 'focus-set', 'foraged', 'harvested', 'planted', 'slept', 'unlocked', 'watered'],
    )
  })

  it('replays with nothing refused', () => {
    expect(refusedCount(events, catalog)).toBe(0)
  })

  it('ends where it ended when it was played', () => {
    const s = fold(events, catalog)
    expect(s).toMatchObject({ name: 'Played farm', day: 41, coins: 404, energy: 90, barrel: 1, compost: ['num'], unlocked: ['hash-sets-maps'], volunteers: ['fpaxos', 'linear-types', 'nonmoving'], bars: { infra: 60 } })
    expect(s.crops).toHaveLength(47)
    expect(s.crops.filter((c) => c.perennial)).toHaveLength(29)
    expect(s.crops.filter((c) => c.wilted)).toHaveLength(1)
    expect(s.foraged).toHaveLength(3)
    expect(Object.keys(s.cleared)).toHaveLength(4)
    expect(s.crops.reduce((n, c) => n + c.journal.length, 0)).toBe(66)
  })

  it('lived through nights the barrel saved and nights it could not', () => {
    let s: FarmState = initialState()
    let saved = 0
    let wilted = 0
    for (const e of events) {
      s = apply(s, e, catalog)
      if (e.type === 'slept' && s.night) { saved += s.night.saved.length; wilted += s.night.wilted.length }
    }
    expect({ saved, wilted }).toEqual({ saved: 12, wilted: 9 })
  })
})

// A second, small farm that stands exactly on each limit the played farm clears by a wide margin: a name of 24
// characters, notes of exactly 40 and of exactly 5000, an explanation of exactly 80, a write-up of exactly 80, a proof
// of exactly 8, a night that ends on exactly 30 energy and one that ends on 29, and a jump over the fence taken with
// exactly the 10 energy it costs. On its last day, a walk day, it also holds a sale of exactly 8 characters to a buyer
// whose id is exactly 60, and a walk with as many questions as a walk may ask, each as long as a question may be, and
// an answer of exactly 5000. (The sale is to a buyer who is not buying: a log may hold that, since a buyer's bars can
// rise after a sale.) Real farms sit on these limits too. Tighten any of them and this farm loses something.
describe('the edge farm', () => {
  const file = parseFarmFile(JSON.stringify(edge))
  const events = file.kind === 'log' ? file.events : []
  const lengths = (pick: (e: (typeof events)[number]) => string | undefined): number[] =>
    [...new Set(events.flatMap((e) => { const t = pick(e); return t === undefined ? [] : [t.trim().length] }))].sort((a, b) => a - b)

  it('really stands on the limits, so nobody mends it by padding', () => {
    expect(events).toHaveLength(51)
    expect(lengths((e) => (e.type === 'farm-named' ? e.name : undefined))).toEqual([24])
    expect(events.flatMap((e) => (e.type === 'sold' ? [[e.buyer.length, e.text.length]] : []))).toEqual([[60, RULES.proofMin]])
    const walk = events.find((e) => e.type === 'walked')
    expect(walk?.type === 'walked' && [walk.asked.length, ...new Set(walk.asked.map((q) => q.length)), walk.answers[0]?.length]).toEqual([RULES.walk.most, RULES.walk.asked, RULES.textMax])
    expect(lengths((e) => (e.type === 'planted' ? e.notes : undefined))).toEqual([40, 5000])
    expect(lengths((e) => (e.type === 'watered' ? e.text : undefined))).toEqual([80])
    expect(lengths((e) => (e.type === 'harvested' ? e.text : undefined))).toEqual([8, 80])
  })

  it('replays with nothing refused', () => {
    expect(refusedCount(events, catalog)).toBe(0)
  })

  it('fills the barrel on a night that ends with 30 energy, not on one that ends with 29, and jumps the fence on its last 10', () => {
    let s: FarmState = initialState()
    const nights: { energy: number; barrel: number }[] = []
    let beforeJump = -1
    for (const e of events) {
      const energy = s.energy
      s = apply(s, e, catalog)
      if (e.type === 'slept') nights.push({ energy, barrel: s.barrel })
      if (e.type === 'unlocked' && e.ok) beforeJump = energy
    }
    expect(nights.slice(0, 3)).toEqual([{ energy: 30, barrel: 1 }, { energy: 29, barrel: 1 }, { energy: 0, barrel: 0 }])
    expect(beforeJump).toBe(10)
  })

  it('ends where it ended when it was played', () => {
    const s = fold(events, catalog)
    expect(s).toMatchObject({ name: 'Edge farm at every limit', day: 14, coins: 183, energy: 90, barrel: 5, unlocked: ['market'], foraged: ['pandi-curry'], compost: [] })
    expect(s.crops.map((c) => [c.seed, c.perennial, c.journal.length])).toEqual([['repo', true, 5], ['incident-roles', true, 2]])
    expect(s.sales.map((x) => [x.day, x.text])).toEqual([[14, 'An offer']])
    expect(s.walks.map((w) => [w.day, w.asked.length, w.answers[0]?.length])).toEqual([[14, 6, 5000]])
  })
})

// A third farm, for the coins a guild and an edge pay. Those coins are part of a farm, unlike anything readiness or
// layer balance decides, and the two farms above happen to earn none of them. This one roots Raft and the three
// saplings it drops, which makes the Raft in depth guild whole, checks in on them for a month, and harvests Golden
// signals on a live edge. Then it spends every coin it has on fences and seeds, and ends with none. So if that guild
// or that edge ever pays less, by a change to a number or to a pack, something this farm bought is refused. (It stands
// guard over the two numbers and over one guild and one edge. The other guilds and edges are held by packs/lock.json.)
describe('the yield farm', () => {
  const file = parseFarmFile(JSON.stringify(yielding))
  const events = file.kind === 'log' ? file.events : []

  it('replays with nothing refused, and ends with no coins to spare', () => {
    expect(events).toHaveLength(165)
    expect(refusedCount(events, catalog)).toBe(0)
    const s = fold(events, catalog)
    expect(s).toMatchObject({ name: 'Yield farm', day: 65, coins: 0, compost: [] })
    expect(s.crops.filter((c) => c.perennial).map((c) => c.seed)).toEqual(['con', 'latency-numbers', 'linux-namespaces', 'raft', 'golden-signals', 'raft-log-compaction', 'raft-membership', 'raft-read-index'])
    expect(Object.keys(s.cleared)).toHaveLength(15)
  })

  it('was paid by a whole guild thirteen times and by a live edge once', () => {
    let s: FarmState = initialState()
    const paid = { guild: 0, times: 0, edge: 0 }
    for (const e of events) {
      s = apply(s, e, catalog)
      if ((e.type !== 'harvested' && e.type !== 'watered') || !e.ok) continue
      const share = guildCoins(e.seed, s, catalog)
      paid.guild += share
      if (share > 0) paid.times++
      const seed = catalog.seed(e.seed)
      if (e.type === 'harvested' && seed) paid.edge += harvestCoins(seed, s, catalog) - RULES.harvest.coins
    }
    expect(paid).toEqual({ guild: 13 * RULES.guild.coins, times: 13, edge: (RULES.edge.times - 1) * RULES.harvest.coins })
    expect(paid).toEqual({ guild: 65, times: 13, edge: 30 })
  })

  it('could not have bought what it bought without that pay', () => {
    // The same packs with the guilds and the edges taken out, and the saplings left in.
    const plain = buildCatalog(collectPacks().map((p) => ({ ...p, guilds: [], seeds: p.seeds.map(({ edge: _edge, ...seed }) => seed) })))
    expect(refusedCount(events, plain)).toBeGreaterThan(0)
    // Take away just the guild, or just the edge, and something it bought is refused.
    for (const lost of ['raft-in-depth', 'golden-signals']) {
      const less = buildCatalog(collectPacks().map((p) => ({
        ...p,
        guilds: (p.guilds ?? []).filter((g) => g.id !== lost),
        seeds: p.seeds.map((seed) => (seed.id === lost ? (({ edge: _edge, ...rest }) => rest)(seed) : seed)),
      })))
      expect(refusedCount(events, less), lost).toBeGreaterThan(0)
    }
  })
})

// Sprite sheets have to be earned now: a seed rooted in another field. A farm from before that rule may have them in
// the ground with nothing rooted anywhere, as this one does (it jumped the fence to them on its first day). The rule is
// asked of what a player does today and never of a log, so this farm keeps its crop. If it ever loses it, a rule about
// earning has crept into replay.
describe('a farm that planted Sprite sheets before they had to be earned', () => {
  const { x0, y0 } = fieldOrigin(0)
  const planting: FarmEvent = { type: 'planted', seed: 'sprites', x: x0, y: y0, notes: 'One sheet for every crop, tree and building, drawn the same way.' }
  const before: FarmEvent[] = [
    { type: 'farm-started', ...RULES.start, energy: RULES.energyMax },
    { type: 'field-opened', pack: 'workshop', slot: 0 },
    { type: 'unlocked', seed: 'sprites', ok: true, text: 'A link to the sheet.', ticked: 2, of: 2 },
  ]

  it('would not be allowed that planting today', () => {
    const s = fold(before, catalog)
    expect(s.unlocked).toEqual(['sprites'])
    expect(check(s, planting, catalog)).toBe('You have not earned Sprite sheets yet. It takes a seed rooted in another field.')
    expect(allowed(s, planting, catalog)).toBeNull()
  })

  it('replays with nothing refused, and the crop where it was', () => {
    const log = [...before, planting]
    expect(refusedCount(log, catalog)).toBe(0)
    expect(fold(log, catalog).crops.map((c) => c.seed)).toEqual(['sprites'])
  })
})
