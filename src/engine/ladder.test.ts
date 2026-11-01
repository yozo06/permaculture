import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog, type Seed } from './catalog'
import { smallCatalog as cat } from './fixtures'
import { explainChecklist, explainPasses, harvestWork, pickPrompt, recallBank, rungName, waterWork, writePasses } from './ladder'
import { RULES } from './rules'

const seed = (id: string): Seed => {
  const s = cat.seed(id)
  if (!s) throw new Error('no seed ' + id)
  return s
}
const at = (stage: number, perennial = false) => ({ stage, perennial })

describe('waterWork', () => {
  it('is recall at stages 1 to 3 of 5 and explain at 4 and 5, for a seed with cards', () => {
    expect([0, 1, 2, 3, 4].map((st) => waterWork(at(st), seed('corn')))).toEqual(['recall', 'recall', 'recall', 'explain', 'explain'])
  })

  it('is explain at every stage for a seed with no cards', () => {
    expect([0, 1, 2, 3, 4].map((st) => waterWork(at(st), seed('saw')))).toEqual(['explain', 'explain', 'explain', 'explain', 'explain'])
    expect(waterWork(at(4, true), seed('saw'))).toBe('explain')
  })

  it('is recall for a perennial check-in if the seed has any cards', () => {
    expect(waterWork(at(4, true), seed('corn'))).toBe('recall')
    expect(waterWork(at(4, true), seed('squash'))).toBe('recall')
  })

  it('needs water cards for recall before stage 4, even if there are harvest cards', () => {
    const harvestOnly: Seed = { ...seed('corn'), questions: { water: [], harvest: seed('corn').questions.harvest } }
    expect(waterWork(at(1), harvestOnly)).toBe('explain')
    expect(waterWork(at(4, true), harvestOnly)).toBe('recall')
  })
})

describe('recallBank', () => {
  it('uses the water cards, and the harder harvest cards for a perennial check-in', () => {
    const corn = seed('corn')
    expect(recallBank(at(1), corn)).toBe(corn.questions.water)
    expect(recallBank(at(4), corn)).toBe(corn.questions.water)
    expect(recallBank(at(4, true), corn)).toBe(corn.questions.harvest)
  })

  it('falls back to the water cards when a perennial seed has no harvest cards', () => {
    const beans = seed('beans')
    expect(recallBank(at(4, true), beans)).toBe(beans.questions.water)
  })
})

describe('harvestWork', () => {
  it('is a harder card for a recall seed, falling back to the water cards', () => {
    expect(harvestWork(seed('corn'))).toEqual({ kind: 'recall', bank: seed('corn').questions.harvest })
    expect(harvestWork(seed('beans'))).toEqual({ kind: 'recall', bank: seed('beans').questions.water })
  })

  it('is a write-up against the rubric for a judged seed', () => {
    expect(harvestWork(seed('squash'))).toEqual({ kind: 'write', checklist: ['Says what it is'], proof: false, minChars: RULES.writeMin })
  })

  it('is a write-up against the default rubric for a solve seed with none', () => {
    const solve: Seed = { ...seed('squash'), harvest: 'solve', rubric: [] }
    expect(harvestWork(solve)).toMatchObject({ kind: 'write', checklist: RULES.defaultRubric, proof: false })
  })

  it('is proof for an artifact: exists outside the game, does what the prompt asks', () => {
    const work = harvestWork(seed('saw'))
    expect(work).toMatchObject({ kind: 'write', proof: true, minChars: RULES.proofMin })
    expect(work.kind === 'write' && work.checklist).toEqual([
      'It exists outside this game: a link, a file, or a decision someone acted on',
      'It does what the prompt asks',
    ])
  })

  it('writes up a recall seed that has no cards at all, rather than asking nothing', () => {
    const bare: Seed = { ...seed('corn'), questions: { water: [], harvest: [] } }
    expect(harvestWork(bare).kind).toBe('write')
  })
})

describe('checklists and pass rules', () => {
  it('explains against the seed rubric, or the default one', () => {
    expect(explainChecklist(seed('squash'))).toEqual(['Says what it is'])
    expect(explainChecklist(seed('corn'))).toEqual(RULES.defaultRubric)
    expect(RULES.defaultRubric).toHaveLength(3)
  })

  it('explain passes with more than half the lines', () => {
    expect([0, 1, 2, 3].map((t) => explainPasses(t, 3))).toEqual([false, false, true, true])
    expect([0, 1, 2, 3, 4].map((t) => explainPasses(t, 4))).toEqual([false, false, false, true, true])
    expect([0, 1].map((t) => explainPasses(t, 1))).toEqual([false, true])
    expect(explainPasses(0, 0)).toBe(false)
  })

  it('a write-up needs every line', () => {
    expect([0, 1, 2, 3].map((t) => writePasses(t, 3))).toEqual([false, false, false, true])
    expect(writePasses(0, 0)).toBe(false)
  })

  it('more than half is exactly the strict majority, for any number of lines', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 12 }), fc.nat({ max: 12 }), (of, ticked) => {
      fc.pre(ticked <= of)
      expect(explainPasses(ticked, of)).toBe(ticked > of / 2)
      if (writePasses(ticked, of)) expect(explainPasses(ticked, of)).toBe(true)
    }))
  })
})

describe('pickPrompt', () => {
  it('is null when a seed has no prompts', () => {
    expect(pickPrompt(seed('corn'), 3)).toBeNull()
  })

  it('is the same for the same seed and day, and always one of the prompts', () => {
    const many: Seed = { ...seed('squash'), prompts: ['a', 'b', 'c'] }
    fc.assert(fc.property(fc.integer({ min: -5, max: 500 }), (day) => {
      expect(pickPrompt(many, day)).toBe(pickPrompt(many, day))
      expect(many.prompts).toContain(pickPrompt(many, day))
    }))
    expect(new Set([1, 2, 3].map((d) => pickPrompt(many, d))).size).toBe(3)
  })
})

describe('rungName', () => {
  it('names the rung by stage', () => {
    expect([0, 1, 2, 3, 4].map((st) => rungName(at(st)))).toEqual(['Sprout', 'Recall', 'Recall', 'Explain', 'Harvest'])
    expect(rungName(at(4, true))).toBe('Perennial')
  })
})

describe('the real packs', () => {
  const catalog = buildCatalog(collectPacks())
  const seeds = catalog.packs.flatMap((p) => catalog.seedsOf(p.pack))

  it('give every seed work at every stage', () => {
    for (const s of seeds) {
      for (const stage of [0, 1, 2, 3, 4]) {
        for (const perennial of [false, true]) {
          const c = at(stage, perennial)
          if (waterWork(c, s) === 'recall') expect(recallBank(c, s).length, s.id).toBeGreaterThan(0)
          else expect(explainChecklist(s).length, s.id).toBeGreaterThan(0)
        }
      }
      const h = harvestWork(s)
      if (h.kind === 'recall') expect(h.bank.length, s.id).toBeGreaterThan(0)
      else {
        expect(h.checklist.length, s.id).toBeGreaterThan(0)
        expect(pickPrompt(s, 1), s.id).not.toBeNull()
      }
    }
  })
})
