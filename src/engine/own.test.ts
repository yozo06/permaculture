/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { allowed, apply, check, fold, initialState, parseEvent, refusedCount } from './fold'
import { EXPLANATION, NOTES, earningCatalog, run, smallCatalog as cat, smallFarm, started } from './fixtures'
import { explainChecklist, harvestWork, waterWork } from './ladder'
import { fieldOrigin, fieldOf } from './land'
import { KINDS, KIND_ORDER, OWN, OWN_TODAY, catalogFor, isOwnId, ownPack, whyOwnSeed, whyTitle, type OwnField, type OwnSeed } from './own'
import { makePicture } from './picture'
import { earnedProgress, readiness } from './readiness'
import { RULES, cropOf } from './rules'
import { HIDDEN, TEXT, read } from './reader'
import type { FarmEvent, FarmState } from './types'

const F = 'my_abcd1234'
const G = 'my_zzzz9999'
const seed = (n: string, more: Partial<OwnSeed> = {}): OwnSeed => ({ id: F + '_' + n, name: 'Topic ' + n, kind: 'idea', summary: '', group: '', cards: [], ...more })
const field = (seeds: OwnSeed[], more: Partial<OwnField> = {}): OwnField => ({ id: F, title: 'German', color: '#C0794A', seeds, ...more })
const setField = (more: Partial<Extract<FarmEvent, { type: 'own-field-set' }>> = {}): FarmEvent => ({ type: 'own-field-set', field: F, slot: 2, title: 'German', color: '#C0794A', ...more })
const setSeeds = (seeds: OwnSeed[], f = F): FarmEvent => ({ type: 'own-seeds-set', field: f, seeds })
const words = (n: number, from = 0): { q: string; a: string }[] => Array.from({ length: n }, (_, i) => ({ q: 'wort' + (from + i), a: 'word' + (from + i) }))
/** The small farm with a field of its own in slot 2, holding these topics. */
const farm = (seeds: OwnSeed[] = [seed('aaaaaa'), seed('bbbbbb')]): FarmState => run(cat, [setField(), ...(seeds.length ? [setSeeds(seeds)] : [])], smallFarm())
const live = (s: FarmState) => catalogFor(cat, s.own)
const refusal = (s: FarmState, e: unknown): string => {
  const why = check(s, e, cat)
  if (why === null) throw new Error('expected a refusal for ' + JSON.stringify(e))
  expect(apply(s, e, cat)).toBe(s)
  return why
}
const tile = (s: FarmState, n = 0): { x: number; y: number } => {
  const { x0, y0 } = fieldOrigin(s.fields[F] ?? 0)
  return { x: x0 + (n % 3), y: y0 + Math.floor(n / 3) }
}
const plant = (s: FarmState, id: string, n = 0): FarmEvent => ({ type: 'planted', seed: id, ...tile(s, n), notes: NOTES })

describe('a field of your own, as a pack', () => {
  it('is a field with no end, in its own colour, under its own id', () => {
    const p = ownPack(field([seed('aaaaaa')]))
    expect(p).toMatchObject({ pack: F, title: 'German', color: '#C0794A', perennial: true })
    expect(p.seeds).toHaveLength(1)
    expect(p.guilds).toBeUndefined()
    expect(p.buyers).toBeUndefined()
    expect(p.finds).toBeUndefined()
    expect(p.energy_cap).toBeUndefined()
  })

  it('has a branch for each group, in the order they first come, and one for topics in none', () => {
    const p = ownPack(field([seed('aaaaaa', { group: 'Verbs' }), seed('bbbbbb'), seed('cccccc', { group: 'Nouns' }), seed('dddddd', { group: 'Verbs' })]))
    expect(p.branches.map((b) => b.title)).toEqual(['Verbs', 'Other topics', 'Nouns'])
    expect(new Set(p.branches.map((b) => b.id)).size).toBe(3)
    expect(p.seeds.map((s) => p.branches.find((b) => b.id === s.branch)?.title)).toEqual(['Verbs', 'Other topics', 'Nouns', 'Verbs'])
  })

  it('names its one branch after the field when nothing is grouped, and has a branch even when empty', () => {
    expect(ownPack(field([seed('aaaaaa')])).branches.map((b) => b.title)).toEqual(['German'])
    expect(ownPack(field([])).branches).toHaveLength(1)
  })

  it('keeps a group its branch id when topics come and go around it', () => {
    const before = ownPack(field([seed('aaaaaa', { group: 'Verbs' })]))
    const after = ownPack(field([seed('zzzzzz', { group: 'Nouns' }), seed('aaaaaa', { group: 'Verbs' })]))
    expect(after.seeds[1]?.branch).toBe(before.seeds[0]?.branch)
  })

  it('draws, asks about and harvests a topic by its kind', () => {
    const p = ownPack(field([seed('aaaaaa', { kind: 'idea' }), seed('bbbbbb', { kind: 'skill' }), seed('cccccc', { kind: 'facts' }), seed('dddddd', { kind: 'rule' }), seed('eeeeee', { kind: 'whole' })]))
    expect(p.seeds.map((s) => [s.layer, s.harvest])).toEqual([['shrub', 'judged'], ['herb', 'artifact'], ['ground-cover', 'judged'], ['understory', 'judged'], ['canopy', 'judged']])
    for (const s of p.seeds) {
      expect(s).toMatchObject({ tier: 0 })
      expect(s.needs).toBeUndefined()
      expect(s.edge).toBeUndefined()
      expect(s.earned).toBeUndefined()
      expect(s.wild).toBeUndefined()
      expect(s.sapling_of).toBeUndefined()
      expect(s.rubric?.length).toBe(3)
      expect(s.prompts).toHaveLength(1)
    }
  })

  it('says each kind in words a person uses, and rates each against three lines of its own', () => {
    expect(KIND_ORDER.map((k) => KINDS[k].label)).toEqual(['An idea to understand', 'Facts to remember', 'A skill to practise', 'A rule or a pattern', 'The big picture'])
    expect(ownPack(field([seed('aaaaaa', { kind: 'skill' })])).seeds[0]).toMatchObject({
      rubric: ['I did it today, and did not just read about it', 'I did it without following a guide step by step', 'I know what to work on next'],
      prompts: ['Do it for real, start to finish. Then say what you did, or give a link to it.'],
    })
    const said = KIND_ORDER.flatMap((k) => [KINDS[k].label, KINDS[k].such, KINDS[k].prompt, ...KINDS[k].rubric])
    expect(new Set(KIND_ORDER.map((k) => KINDS[k].rubric.join('|'))).size).toBe(KIND_ORDER.length)
    for (const line of said) {
      expect(line.length, line).toBeGreaterThan(8)
      // None of the game's own words for these things: a learner who made the topic never chose them.
      expect(line, line).not.toMatch(/layer|canopy|understory|shrub|herb|ground cover|judged|artifact|perennial|rubric|recall/i)
    }
  })

  it('makes a card with wrong answers out of the other answers, its own topic first', () => {
    const p = ownPack(field([seed('aaaaaa', { kind: 'facts', cards: words(4) }), seed('bbbbbb', { kind: 'facts', cards: words(4, 10) })]))
    const first = p.seeds[0]
    expect(first?.harvest).toBe('recall')
    const water = first?.questions?.water ?? []
    expect(water).toHaveLength(4)
    for (const [i, m] of water.entries()) {
      expect(m.q).toBe('Which of these goes with “wort' + i + '”?')
      expect(m.answer).toBe('word' + i)
      expect(m.distractors).toHaveLength(3)
      expect(new Set([m.answer, ...m.distractors]).size).toBe(4)
      expect(m.distractors.every((d) => ['word0', 'word1', 'word2', 'word3'].includes(d))).toBe(true)
      expect(m.why).toBe('wort' + i + ': word' + i)
    }
    // The cards do not all offer the same three wrong answers.
    expect(new Set(water.map((m) => m.distractors.slice().sort().join())).size).toBeGreaterThan(1)
  })

  it('asks a harvest the other way round: the answer is shown, and the question is picked', () => {
    const p = ownPack(field([seed('aaaaaa', { kind: 'facts', cards: words(4) })]))
    const harvest = p.seeds[0]?.questions?.harvest ?? []
    expect(harvest).toHaveLength(4)
    expect(harvest[0]).toMatchObject({ q: 'Which of these goes with “word0”?', answer: 'wort0' })
    expect(harvest[0]?.distractors.every((d) => d.startsWith('wort'))).toBe(true)
  })

  it('asks a card that is a question as it is written, and never the other way round', () => {
    const cards = [{ q: 'Where is DNA kept?', a: 'In the nucleus' }, { q: 'What makes proteins?', a: 'Ribosomes' }, { q: 'What burns sugar?', a: 'Mitochondria' }]
    const s = ownPack(field([seed('aaaaaa', { kind: 'facts', cards })])).seeds[0]
    expect(s?.questions?.water?.[0]).toMatchObject({ q: 'Where is DNA kept?', answer: 'In the nucleus', why: 'Where is DNA kept? In the nucleus' })
    expect(s?.questions?.harvest ?? []).toEqual([])
  })

  it('turns a card round only when its question is a short name, its answer is short, and there are names to choose between', () => {
    const turned = (cards: { q: string; a: string }[]): number => ownPack(field([seed('aaaaaa', { kind: 'facts', cards })])).seeds[0]?.questions?.harvest?.length ?? 0
    expect(turned(words(4))).toBe(4)
    expect(turned([...words(3), { q: 'x'.repeat(61), a: 'long name' }])).toBe(3)
    expect(turned([...words(3), { q: 'kurz', a: 'y'.repeat(81) }])).toBe(3)
    // A full-width question mark ends a question too.
    expect(turned([...words(3), { q: '何ですか？', a: 'what is it' }])).toBe(3)
    // Two cards: one name to offer as wrong, which is not enough to ask.
    expect(turned([{ q: 'eins', a: 'one' }, { q: 'zwei', a: 'two' }, { q: 'Was ist drei?', a: 'three' }])).toBe(0)
  })

  it('makes the same pack for a field that has not changed, and looks at only so much of a big field for each card', () => {
    const f = field([seed('aaaaaa', { cards: words(4) })])
    expect(ownPack(f)).toBe(ownPack(f))
    const big = field(Array.from({ length: 300 }, (_, i) => seed('n' + String(i).padStart(5, '0'), { kind: 'facts', cards: Array.from({ length: 10 }, (_, j) => ({ q: 'q' + i + '-' + j, a: 'same answer' })) })))
    const started = Date.now()
    expect(ownPack(big).seeds[0]?.questions).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('borrows wrong answers from the rest of the field when a topic has too few', () => {
    const p = ownPack(field([seed('aaaaaa', { kind: 'facts', cards: words(1) }), seed('bbbbbb', { kind: 'facts', cards: words(3, 10) })]))
    expect(p.seeds[0]?.questions?.water?.[0]?.distractors).toHaveLength(3)
  })

  it('makes no card it cannot give two wrong answers for, and then asks for an explanation', () => {
    const p = ownPack(field([seed('aaaaaa', { kind: 'facts', cards: [{ q: 'eins', a: 'one' }, { q: 'uno', a: 'One ' }, { q: 'zwei', a: 'two' }] })]))
    expect(p.seeds[0]?.questions).toBeUndefined()
    expect(p.seeds[0]?.harvest).toBe('judged')
  })

  it('never offers as a wrong answer one that reads the same as the right one', () => {
    const cards = [{ q: 'eins', a: 'one' }, { q: 'uno', a: 'ONE' }, { q: 'zwei', a: 'two' }, { q: 'drei', a: 'three' }, { q: 'vier', a: 'four' }]
    const water = ownPack(field([seed('aaaaaa', { kind: 'facts', cards })])).seeds[0]?.questions?.water ?? []
    expect(water[0]?.distractors.map((d) => d.toLowerCase())).not.toContain('one')
  })
})

describe('the catalog a farm plays by', () => {
  it('is the game\'s own, the very same, for a farm with no field of its own', () => {
    expect(catalogFor(cat, initialState().own)).toBe(cat)
    expect(catalogFor(cat, smallFarm().own)).toBe(cat)
  })

  it('has the farm\'s own fields after the game\'s', () => {
    const s = farm()
    const c = live(s)
    expect(c.packs.map((p) => p.pack)).toEqual(['garden', 'shed', F])
    expect(c.seed(F + '_aaaaaa')).toMatchObject({ pack: F, name: 'Topic aaaaaa', needs: [], extra: false, earned: null })
    expect(c.seed('corn')?.name).toBe('Corn')
  })

  it('is built once for a farm, and again only when its own fields change', () => {
    const s = farm()
    expect(live(s)).toBe(live(s))
    const slept = apply(s, { type: 'slept' }, cat)
    expect(live(slept)).toBe(live(s))
    const more = apply(s, setSeeds([seed('cccccc')]), cat)
    expect(live(more)).not.toBe(live(s))
  })

  it('is the same whether it is asked of the game\'s catalog or of one already made for a farm', () => {
    const s = farm()
    expect(catalogFor(live(s), s.own)).toBe(live(s))
    expect(catalogFor(live(s), initialState().own)).toBe(cat)
  })

  it('knows an id of the farmer\'s own from one of the game\'s', () => {
    expect(isOwnId(F)).toBe(true)
    expect(isOwnId(F + '_aaaaaa')).toBe(true)
    for (const id of ['garden', 'corn', 'my-field', 'my_', 'MY_abcd1234', '__proto__', 'constructor', '']) expect(isOwnId(id), id).toBe(false)
  })
})

describe('own-field-set', () => {
  it('opens a field on the plot it names', () => {
    const s = run(cat, [setField()], smallFarm())
    expect(s.fields[F]).toBe(2)
    expect(s.own[F]).toEqual({ id: F, title: 'German', color: '#C0794A', seeds: [] })
    const { x0, y0 } = fieldOrigin(2)
    expect(fieldOf(x0, y0, s.fields, s.cleared)).toBe(F)
  })

  it('trims the name', () => {
    expect(run(cat, [setField({ title: '  German A1 ' })], smallFarm()).own[F]?.title).toBe('German A1')
  })

  it('renames a field that is there, and leaves it where it is', () => {
    const s = run(cat, [setField({ title: 'Deutsch', color: '#4A90C0' })], farm())
    expect(s.own[F]).toMatchObject({ title: 'Deutsch', color: '#4A90C0' })
    expect(s.own[F]?.seeds).toHaveLength(2)
    expect(s.fields[F]).toBe(2)
    expect(refusal(farm(), setField({ slot: 5 }))).toMatch(/where it is/)
  })

  it('refuses a plot that is taken, a name that is empty or too long, and a farm that has not begun', () => {
    expect(refusal(smallFarm(), setField({ slot: 1 }))).toMatch(/taken/)
    expect(refusal(smallFarm(), setField({ title: '   ' }))).toMatch(/1 to 60/)
    expect(refusal(smallFarm(), setField({ title: 'x'.repeat(61) }))).toMatch(/1 to 60/)
    expect(refusal(initialState(), setField())).toMatch(/no farm/)
  })

  it('refuses what cannot be a field at all, without throwing', () => {
    const bad = [
      setField({ field: 'garden' }), setField({ field: 'my_ABCD1234' }), setField({ field: 'my_abc' }), setField({ field: '__proto__' }),
      setField({ color: 'red' }), setField({ color: '#fff' }), setField({ color: '#C0794A;x' }), setField({ color: '"><img>' }),
      setField({ slot: -1 }), setField({ slot: 1.5 }), setField({ slot: 100 }),
      { ...setField(), title: 7 }, { type: 'own-field-set', field: F },
    ]
    for (const e of bad) expect(refusal(smallFarm(), e), JSON.stringify(e)).toBe('That is not something the farm can do.')
    // Six characters after the hash are not enough: they have to be hex.
    for (const color of ['#zzzzzz', '#12345g', '#C0794A ', ' #C0794A']) expect(refusal(smallFarm(), setField({ color })), color).toBe('That is not something the farm can do.')
  })

  it('refuses text with characters that cannot be seen', () => {
    for (const title of ['Ger\u0000man', 'Ger\u202Eman', 'Ger\nman', 'Ger\u2066man', 'Ger\u200Bman', 'Ger\u00ADman', 'Ger\tman', 'Ger\u0085man', 'Ger\uFEFFman']) expect(refusal(smallFarm(), setField({ title })), JSON.stringify(title)).toMatch(/cannot show/)
    // The marks that Indic scripts, Persian and emoji are joined with can be seen in what they do, and are let through.
    for (const title of ['ಕನ್ನಡ', 'क्\u200Dष', 'می\u200Cخواهم', '👩\u200D🌾']) expect(whyTitle(title), title).toBeNull()
  })

  it('refuses exactly the characters the reader takes out of a paste, so that nothing read from a paste is refused for one', () => {
    const hidden = new RegExp('[' + HIDDEN + ']', 'g')
    for (let code = 0; code < 0x3000; code++) {
      const ch = String.fromCharCode(code)
      if (ch === '\n' || ch === '\r' || ch === '\t') continue
      const taken = 'a' + ch + 'b' !== ('a' + ch + 'b').replace(hidden, '')
      expect(whyTitle('a' + ch + 'b') !== null, 'U+' + code.toString(16)).toBe(taken || ch === '\u2028' || ch === '\u2029')
    }
    expect(read('Der\u200B Da\u00ADtiv\u202E').topics[0]?.name).toBe('Der Dativ')
  })

  it('counts the game\'s own fields against the same room, today and never in a saved farm', () => {
    const ids = Array.from({ length: OWN_TODAY.fields - 1 }, (_, i) => 'my_field00' + i)
    const full = run(cat, [started, ...ids.map((id, i): FarmEvent => setField({ field: id, slot: i })), { type: 'field-opened', pack: 'garden', slot: 20 }])
    expect(Object.keys(full.fields)).toHaveLength(OWN_TODAY.fields)
    const one: FarmEvent = { type: 'field-opened', pack: 'shed', slot: 21 }
    expect(check(full, one, cat)).toMatch(/room for/)
    expect(allowed(full, one, cat)).toBeNull()
  })

  it('asks of today, and never of a saved farm, that a farm has no more fields than its land was made for', () => {
    const ids = Array.from({ length: OWN_TODAY.fields - 2 }, (_, i) => 'my_field00' + i)
    const full = run(cat, ids.map((id, i): FarmEvent => setField({ field: id, slot: 2 + i })), smallFarm())
    expect(Object.keys(full.fields)).toHaveLength(OWN_TODAY.fields)
    const one: FarmEvent = setField({ field: 'my_onemore0', slot: 40 })
    expect(check(full, one, cat)).toMatch(/room for/)
    expect(allowed(full, one, cat)).toBeNull()
  })

  it('refuses, even of a saved farm, more fields of its own than the most there may ever be', () => {
    let s = smallFarm()
    for (let i = 0; i < OWN.fields; i++) s = run(cat, [setField({ field: 'my_f' + String(i).padStart(7, '0'), slot: 2 + i })], s)
    expect(allowed(s, setField({ field: 'my_onemore0', slot: 60 }), cat)).toMatch(/fields of your own/)
  })
})

describe('own-seeds-set', () => {
  it('adds topics to a field in the order given, and keeps them through what follows', () => {
    const s = run(cat, [{ type: 'slept' }, setSeeds([seed('cccccc', { name: ' Third ', summary: ' Read it. ', group: ' Later ', kind: 'skill', cards: [{ q: ' a ', a: ' b ' }] })])], farm())
    expect(s.own[F]?.seeds.map((x) => x.id)).toEqual([F + '_aaaaaa', F + '_bbbbbb', F + '_cccccc'])
    expect(s.own[F]?.seeds[2]).toEqual({ id: F + '_cccccc', name: 'Third', summary: 'Read it.', group: 'Later', kind: 'skill', cards: [{ q: 'a', a: 'b' }] })
  })

  it('changes a topic that is there, in its place', () => {
    const s = run(cat, [setSeeds([seed('aaaaaa', { name: 'Renamed', kind: 'rule' })])], farm())
    expect(s.own[F]?.seeds.map((x) => x.name)).toEqual(['Renamed', 'Topic bbbbbb'])
    expect(live(s).seed(F + '_aaaaaa')).toMatchObject({ name: 'Renamed', layer: 'understory' })
  })

  it('refuses topics for a field that is not there, or with another field\'s id', () => {
    expect(refusal(smallFarm(), setSeeds([seed('aaaaaa')]))).toMatch(/not one of your own/)
    expect(refusal(farm(), setSeeds([{ ...seed('aaaaaa'), id: G + '_aaaaaa' }]))).toMatch(/belong/)
    expect(refusal(farm(), setSeeds([seed('cccccc'), seed('cccccc')]))).toMatch(/twice/)
  })

  it('refuses a name, a line or a card that is empty or too long', () => {
    const s = farm()
    expect(refusal(s, setSeeds([seed('cccccc', { name: ' ' })]))).toMatch(/name/)
    expect(refusal(s, setSeeds([seed('cccccc', { name: 'x'.repeat(49) })]))).toMatch(/name/)
    expect(refusal(s, setSeeds([seed('cccccc', { summary: 'x'.repeat(301) })]))).toMatch(/what to read/)
    expect(refusal(s, setSeeds([seed('cccccc', { group: 'x'.repeat(61) })]))).toMatch(/group/)
    expect(refusal(s, setSeeds([seed('cccccc', { cards: [{ q: '', a: 'b' }] })]))).toMatch(/card/)
    expect(refusal(s, setSeeds([seed('cccccc', { cards: [{ q: 'a', a: 'x'.repeat(121) }] })]))).toMatch(/card/)
    expect(refusal(s, setSeeds([seed('cccccc', { cards: words(11) })]))).toMatch(/cards/)
    expect(refusal(s, setSeeds([seed('cccccc', { name: 'Bad\u202Ename' })]))).toMatch(/cannot show/)
    // Not only in a name: in every piece of text a topic holds.
    for (const more of [{ summary: 'a\u202Eb' }, { group: 'a\u0000b' }, { cards: [{ q: 'a\u2066b', a: 'c' }] }, { cards: [{ q: 'a', a: 'b\nc' }] }, { summary: 'two\nlines' }]) {
      expect(whyOwnSeed(seed('cccccc', more)), JSON.stringify(more)).toMatch(/cannot show/)
    }
  })

  it('refuses what cannot be a topic at all, without throwing', () => {
    const s = farm()
    const bad: unknown[] = [
      setSeeds([]), setSeeds([{ ...seed('cccccc'), kind: 'canopy' as never }]), setSeeds([{ ...seed('cccccc'), kind: 'constructor' as never }]),
      setSeeds([{ ...seed('cccccc'), id: F + '_CCCCCC' }]), setSeeds([{ ...seed('cccccc'), id: 'corn' }]),
      { type: 'own-seeds-set', field: F, seeds: [{ id: F + '_cccccc', name: 'No kind' }] },
      { type: 'own-seeds-set', field: F, seeds: 'all of them' },
      { type: 'own-seeds-set', field: F, seeds: [{ ...seed('cccccc'), cards: [{ q: 'a' }] }] },
      { type: 'own-seeds-set', field: F, seeds: [{ ...seed('cccccc'), cards: [['a', 'b']] }] },
      { type: 'own-seeds-set', field: 'garden', seeds: [seed('cccccc')] },
    ]
    for (const e of bad) expect(refusal(s, e), JSON.stringify(e)).toBe('That is not something the farm can do.')
  })

  it('keeps only what a topic is made of, whatever else the event carries', () => {
    const s = run(cat, [{ type: 'own-seeds-set', field: F, seeds: [{ ...seed('cccccc'), layer: 'canopy', needs: ['corn'], harvest: 'artifact', __proto__: { x: 1 } }] } as unknown as FarmEvent], farm())
    expect(Object.keys(s.own[F]?.seeds[2] ?? {}).sort()).toEqual(['cards', 'group', 'id', 'kind', 'name', 'summary'])
  })

  it('asks of today, and never of a saved farm, that a field holds no more than a farmer can tend', () => {
    const many = (n: number, from: number): OwnSeed[] => Array.from({ length: n }, (_, i) => seed('n' + String(from + i).padStart(5, '0')))
    const full = run(cat, [setSeeds(many(OWN_TODAY.seeds - 2, 0))], farm())
    expect(full.own[F]?.seeds).toHaveLength(OWN_TODAY.seeds)
    expect(check(full, setSeeds([seed('cccccc')]), cat)).toMatch(/holds/)
    expect(allowed(full, setSeeds([seed('cccccc')]), cat)).toBeNull()
    // Changing a topic that is there adds nothing, so it is never refused for that.
    expect(check(full, setSeeds([seed('aaaaaa', { name: 'Renamed' })]), cat)).toBeNull()
    const most = run(cat, [setSeeds(many(OWN.seeds - OWN_TODAY.seeds, 1000))], full)
    expect(allowed(most, setSeeds([seed('cccccc')]), cat)).toMatch(/holds/)
  })
})

describe('taking a topic or a field away', () => {
  it('takes away a topic that was never planted', () => {
    const s = run(cat, [{ type: 'own-seed-removed', topic: F + '_aaaaaa' }], farm())
    expect(s.own[F]?.seeds.map((x) => x.id)).toEqual([F + '_bbbbbb'])
    expect(live(s).seed(F + '_aaaaaa')).toBeUndefined()
  })

  it('keeps a topic that is in the ground, and says why', () => {
    const s = farm()
    const planted = run(cat, [plant(s, F + '_aaaaaa')], s)
    expect(refusal(planted, { type: 'own-seed-removed', topic: F + '_aaaaaa' })).toMatch(/planted/)
    expect(refusal(planted, { type: 'own-seed-removed', topic: F + '_zzzzzz' })).toMatch(/not one of your own/)
    expect(refusal(planted, { type: 'own-seed-removed', topic: 'corn' })).toBe('That is not something the farm can do.')
  })

  it('takes away a field with nothing planted in it, with its land and whatever was set for it', () => {
    const s0 = farm()
    const { x0, y0 } = fieldOrigin(2)
    const s1 = run(cat, [{ type: 'fenced', x: x0 + 3, y: y0, pack: F }], s0)
    expect(fieldOf(x0 + 3, y0, s1.fields, s1.cleared)).toBe(F)
    const s = run(cat, [{ type: 'own-field-removed', field: F }], s1)
    expect(s.own).toEqual({})
    expect(Object.hasOwn(s.fields, F)).toBe(false)
    expect(fieldOf(x0, y0, s.fields, s.cleared)).toBeNull()
    expect(fieldOf(x0 + 3, y0, s.fields, s.cleared)).toBeNull()
    expect(Object.values(s.cleared)).not.toContain(F)
    expect(catalogFor(cat, s.own)).toBe(cat)
    // The plot is free again.
    expect(check(s, setField({ field: G }), cat)).toBeNull()
  })

  it('forgets what was set for a field that is taken away', () => {
    const branch = ownPack(field([seed('aaaaaa')])).branches[0]?.id ?? ''
    const s = run(cat, [{ type: 'focus-set', pack: F, branch }, { type: 'own-field-removed', field: F }], farm())
    expect(s.focus).toEqual({})
    expect(s.bars).toEqual({})
    expect(Object.keys(s.fields).sort()).toEqual(['garden', 'shed'])
  })

  it('keeps a field whose going would leave another field\'s land beyond the edge of the map', () => {
    // Four fields make a world of two rings; a fifth makes a third ring, and land can then be fenced in out there.
    const five = run(cat, [setField({ field: 'my_ring0003', slot: 3 }), setField({ field: G, slot: 4 })], farm([]))
    const far = fieldOrigin(4)
    const fenced = run(cat, [{ type: 'fenced', x: far.x0 + 3, y: far.y0, pack: G }], { ...five, coins: 500 })
    expect(check(fenced, { type: 'own-field-removed', field: G }, cat)).toBeNull()
    // Give that far tile to another field instead, and the field in the outer ring has to stay.
    const lent = { ...fenced, cleared: { ...fenced.cleared, [(far.x0 + 3) + ',' + far.y0]: F } }
    expect(refusal(lent, { type: 'own-field-removed', field: G })).toMatch(/land out where the farm would end/)
    expect(check(five, { type: 'own-field-removed', field: G }, cat)).toBeNull()
  })

  it('keeps a field that has something planted in it', () => {
    const s = farm()
    const planted = run(cat, [plant(s, F + '_aaaaaa')], s)
    expect(refusal(planted, { type: 'own-field-removed', field: F })).toMatch(/planted/)
    expect(refusal(planted, { type: 'own-field-removed', field: G })).toMatch(/not one of your own/)
  })
})

describe('growing a topic of your own', () => {
  it('is planted, explained and harvested like any other', () => {
    const id = F + '_aaaaaa'
    let s = farm()
    s = run(cat, [plant(s, id)], s)
    expect(cropOf(s, id)).toMatchObject({ stage: 0, perennial: false })
    const sd = live(s).seed(id)
    if (!sd) throw new Error('no seed')
    const of = explainChecklist(sd).length
    for (let stage = 0; stage < RULES.maxStage; stage++) {
      while (s.day < (cropOf(s, id)?.due ?? 0)) s = run(cat, [{ type: 'slept' }], s)
      const c = cropOf(s, id)
      if (!c) throw new Error('no crop')
      expect(waterWork(c, sd)).toBe('explain')
      s = run(cat, [{ type: 'watered', seed: id, ok: true, work: 'explain', text: EXPLANATION, ticked: of, of }], s)
    }
    expect(harvestWork(sd)).toMatchObject({ kind: 'write', proof: false })
    const coins = s.coins
    s = run(cat, [{ type: 'harvested', seed: id, ok: true, text: EXPLANATION, ticked: of, of }], s)
    expect(cropOf(s, id)).toMatchObject({ perennial: true })
    expect(s.coins).toBe(coins + RULES.harvest.coins)
  })

  it('is watered and harvested by its cards when it has them', () => {
    const id = F + '_aaaaaa'
    let s = farm([seed('aaaaaa', { kind: 'facts', cards: words(4) })])
    s = run(cat, [plant(s, id), { type: 'slept' }], s)
    const sd = live(s).seed(id)
    const c = cropOf(s, id)
    if (!sd || !c) throw new Error('not planted')
    expect(waterWork(c, sd)).toBe('recall')
    expect(harvestWork(sd).kind).toBe('recall')
    s = run(cat, [{ type: 'watered', seed: id, ok: true, work: 'recall' }], s)
    expect(cropOf(s, id)?.stage).toBe(1)
  })

  it('asks a skill for proof that it was done, not for an essay', () => {
    const sd = live(farm([seed('aaaaaa', { kind: 'skill' })])).seed(F + '_aaaaaa')
    if (!sd) throw new Error('no seed')
    expect(harvestWork(sd)).toMatchObject({ kind: 'write', proof: true, minChars: RULES.proofMin })
  })

  it('refuses a topic of one field on the land of another', () => {
    const s = farm()
    const { x0, y0 } = fieldOrigin(0)
    expect(refusal(s, { type: 'planted', seed: F + '_aaaaaa', x: x0, y: y0, notes: NOTES })).toMatch(/belongs in the German field/)
  })

  it('has no readiness, so nothing in it waits for a lower layer', () => {
    const s = farm([seed('aaaaaa', { kind: 'whole' }), seed('bbbbbb', { kind: 'facts' })])
    expect(readiness(F, s, live(s))).toBeNull()
    expect(check(s, plant(s, F + '_aaaaaa'), cat)).toBeNull()
  })

  it('costs less to fence land in for than the game\'s own fields do', () => {
    const s = { ...farm(), coins: 100 }
    const own = fieldOrigin(2), garden = fieldOrigin(0)
    const a = run(cat, [{ type: 'fenced', x: own.x0 + 3, y: own.y0, pack: F }], s)
    expect(s.coins - a.coins).toBe(RULES.fence.own)
    const b = run(cat, [{ type: 'fenced', x: garden.x0 + 3, y: garden.y0, pack: 'garden' }], s)
    expect([RULES.fence.open, RULES.fence.forest]).toContain(s.coins - b.coins)
    expect(RULES.fence.own).toBeLessThan(RULES.fence.open)
    const poor = { ...farm(), coins: RULES.fence.own - 1 }
    expect(refusal(poor, { type: 'fenced', x: own.x0 + 3, y: own.y0, pack: F })).toMatch(/coins/)
    // With exactly the price in hand the land is theirs, and the same coins do not buy land for one of the game's fields.
    const exact = { ...farm(), coins: RULES.fence.own }
    expect(run(cat, [{ type: 'fenced', x: own.x0 + 3, y: own.y0, pack: F }], exact).coins).toBe(0)
    expect(refusal(exact, { type: 'fenced', x: garden.x0 + 3, y: garden.y0, pack: 'garden' })).toMatch(/coins/)
  })

  it('is never in the picture of a farm, whatever is asked to be shown', () => {
    const s0 = farm()
    const s = run(cat, [plant(s0, F + '_aaaaaa')], s0)
    const picture = makePicture(s, { code: 'abcdefgh', at: '2026-11-18T00:00:00Z', game: '0.9.0', show: ['garden', F] })
    expect(picture.fields.map((f) => f.pack)).toEqual(['garden'])
    expect(JSON.stringify(picture)).not.toContain('my_')
  })

  it('does not count towards a seed that is earned by trees in other fields', () => {
    const elmLike = earningCatalog.seed('kiln')
    if (!elmLike) throw new Error('no kiln')
    const id = F + '_aaaaaa'
    let s = run(earningCatalog, [setField(), setSeeds([seed('aaaaaa')])], run(earningCatalog, [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }]))
    s = { ...s, crops: [{ seed: id, ...tile(s), stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [] }] }
    expect(earnedProgress(elmLike, s, catalogFor(earningCatalog, s.own))).toMatchObject({ have: 0, met: false })
  })
})

describe('a farm with a field of its own, replayed', () => {
  const log = (): FarmEvent[] => {
    const s = farm()
    return [
      started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 },
      setField(), setSeeds([seed('aaaaaa'), seed('bbbbbb')]), plant(s, F + '_aaaaaa'), { type: 'focus-set', pack: F, branch: ownPack(field([seed('aaaaaa')])).branches[0]?.id ?? '' },
      { type: 'slept' }, setSeeds([seed('aaaaaa', { name: 'Renamed' }), seed('cccccc', { group: 'New' })]), { type: 'own-seed-removed', topic: F + '_bbbbbb' },
      setField({ title: 'Deutsch' }),
    ]
  }

  it('replays with nothing refused, to the same farm each time', () => {
    expect(refusedCount(log(), cat)).toBe(0)
    const s = fold(log(), cat)
    expect(s).toEqual(fold(log(), cat))
    expect(s.own[F]).toMatchObject({ title: 'Deutsch' })
    expect(s.own[F]?.seeds.map((x) => x.name)).toEqual(['Renamed', 'Topic cccccc'])
    expect(s.crops.map((c) => c.seed)).toEqual([F + '_aaaaaa'])
  })

  it('forgets the fields of the farm before when a farm is started over', () => {
    const s = fold([...log(), started], cat)
    expect(s.own).toEqual({})
    expect(s.fields).toEqual({})
  })

  it('never changes the farm it was handed', () => {
    const s = farm()
    const frozen = JSON.stringify(s)
    apply(s, setSeeds([seed('cccccc')]), cat)
    apply(s, { type: 'own-seed-removed', topic: F + '_aaaaaa' }, cat)
    apply(s, { type: 'own-field-removed', field: F }, cat)
    apply(s, setField({ title: 'Other' }), cat)
    expect(JSON.stringify(s)).toBe(frozen)
  })

  it('forgets its own fields when a farm from the first prototype is brought in over it', () => {
    const s = fold([...log(), { type: 'snapshot-imported', snapshot: { v: 2, day: 3, coins: 5, fields: { garden: 0 }, crops: [], farmer: {} } }], cat)
    expect(s.day).toBe(3)
    expect(s.own).toEqual({})
    expect(Object.keys(s.fields)).toEqual(['garden'])
  })

  it('skips an event it does not know, as an older game skips these, and keeps the rest', () => {
    expect(parseEvent({ type: 'own-field-painted', field: F })).toBeNull()
    const withUnknown = [...log().slice(0, 5), { type: 'own-field-painted', field: F }, ...log().slice(5)]
    expect(fold(withUnknown, cat)).toEqual(fold(log(), cat))
    expect(refusedCount(withUnknown, cat)).toBe(1)
  })

  it('keeps no part of an event under the names the log stamps on every entry', () => {
    for (const e of log()) {
      const parsed = parseEvent({ ...e, id: 'entry-1', at: '2026-11-18T00:00:00Z' })
      expect(parsed, e.type).not.toBeNull()
      expect(Object.keys(parsed ?? {}), e.type).not.toContain('id')
      expect(Object.keys(parsed ?? {}), e.type).not.toContain('at')
      expect(parsed).toEqual(parseEvent(e))
    }
  })

  it('replays a field that was changed three hundred times without rebuilding it three hundred times over', () => {
    const many = Array.from({ length: 150 }, (_, i) => seed('n' + String(i).padStart(5, '0'), { kind: 'facts', cards: words(8, i * 10) }))
    const edits = Array.from({ length: 300 }, (_, i): FarmEvent => setSeeds([{ ...(many[i % 150] as OwnSeed), name: 'Edit ' + i }]))
    const events: FarmEvent[] = [started, setField({ slot: 0 }), setSeeds(many), ...edits]
    const startedAt = Date.now()
    const s = fold(events, cat)
    expect(Date.now() - startedAt).toBeLessThan(3000)
    expect(s.own[F]?.seeds).toHaveLength(150)
    expect(catalogFor(cat, s.own).seed(F + '_n00149')?.name).toBe('Edit 299')
  })
})

describe('any game played with fields of its own', () => {
  const id = fc.constantFrom('aaaaaa', 'bbbbbb', 'cccccc', 'dddddd')
  const kind = fc.constantFrom(...KIND_ORDER)
  const topic = fc.record({ n: id, kind, cards: fc.integer({ min: 0, max: 4 }), group: fc.constantFrom('', 'One', 'Two') })
  type Move =
    | { do: 'field'; which: 0 | 1; title: string } | { do: 'seeds'; which: 0 | 1; topics: { n: string; kind: OwnSeed['kind']; cards: number; group: string }[] }
    | { do: 'unseed'; which: 0 | 1; n: string } | { do: 'unfield'; which: 0 | 1 } | { do: 'plant'; which: 0 | 1; n: string; at: number }
    | { do: 'sleep' } | { do: 'water'; which: 0 | 1; n: string; ok: boolean } | { do: 'focus'; which: 0 | 1 } | { do: 'fence'; which: 0 | 1 }
  const which = fc.constantFrom<0 | 1>(0, 1)
  const move: fc.Arbitrary<Move> = fc.oneof(
    fc.record({ do: fc.constant('field' as const), which, title: fc.constantFrom('German', 'Guitar', '  Spaced  ') }),
    fc.record({ do: fc.constant('seeds' as const), which, topics: fc.array(topic, { minLength: 1, maxLength: 4 }) }),
    fc.record({ do: fc.constant('unseed' as const), which, n: id }),
    fc.record({ do: fc.constant('unfield' as const), which }),
    fc.record({ do: fc.constant('plant' as const), which, n: id, at: fc.integer({ min: 0, max: 8 }) }),
    fc.record({ do: fc.constant('sleep' as const) }),
    fc.record({ do: fc.constant('water' as const), which, n: id, ok: fc.boolean() }),
    fc.record({ do: fc.constant('focus' as const), which }),
    fc.record({ do: fc.constant('fence' as const), which }),
  )
  const IDS = [F, G] as const

  it('replays to the same farm with nothing refused, whatever was made, changed, planted and taken away', () => {
    fc.assert(fc.property(fc.array(move, { maxLength: 60 }), (moves) => {
      let s = smallFarm()
      const kept: unknown[] = [started, { type: 'field-opened', pack: 'garden', slot: 0 }, { type: 'field-opened', pack: 'shed', slot: 1 }]
      const tryIt = (e: FarmEvent): void => {
        const next = apply(s, e, cat)
        // What today's rules refuse, the farm does not take, and what they allow, it does.
        expect(next !== s || allowed(s, e, cat) !== null).toBe(true)
        if (next === s) return
        kept.push(e)
        s = next
      }
      for (const m of moves) {
        if (m.do === 'sleep') { tryIt({ type: 'slept' }); continue }
        const f = IDS[m.which]
        const mine = catalogFor(cat, s.own)
        if (m.do === 'field') tryIt({ type: 'own-field-set', field: f, slot: s.fields[f] ?? 2 + m.which, title: m.title, color: '#4DB6A4' })
        else if (m.do === 'seeds') {
          const seen = new Set<string>()
          const seeds = m.topics.filter((t) => !seen.has(t.n) && seen.add(t.n)).map((t): OwnSeed => ({ id: f + '_' + t.n, name: 'Topic ' + t.n, kind: t.kind, summary: '', group: t.group, cards: words(t.cards, t.n.charCodeAt(0)) }))
          tryIt({ type: 'own-seeds-set', field: f, seeds })
        } else if (m.do === 'unseed') tryIt({ type: 'own-seed-removed', topic: f + '_' + m.n })
        else if (m.do === 'unfield') tryIt({ type: 'own-field-removed', field: f })
        else if (m.do === 'focus') tryIt({ type: 'focus-set', pack: f, branch: mine.pack(f)?.branches[0]?.id ?? 'main' })
        else if (m.do === 'fence') { const o = fieldOrigin(s.fields[f] ?? 2 + m.which); tryIt({ type: 'fenced', x: o.x0 + 3, y: o.y0, pack: f }) }
        else if (m.do === 'plant') { const o = fieldOrigin(s.fields[f] ?? 2 + m.which); tryIt({ type: 'planted', seed: f + '_' + m.n, x: o.x0 + (m.at % 3), y: o.y0 + Math.floor(m.at / 3), notes: NOTES }) }
        else {
          const sd = mine.seed(f + '_' + m.n), c = cropOf(s, f + '_' + m.n)
          if (!sd || !c) continue
          const of = explainChecklist(sd).length
          tryIt(waterWork(c, sd) === 'recall' ? { type: 'watered', seed: sd.id, ok: m.ok, work: 'recall' } : { type: 'watered', seed: sd.id, ok: m.ok, work: 'explain', text: EXPLANATION, ticked: m.ok ? of : 0, of })
        }
        // Every crop is of a topic the farm still has, on land its field still has.
        const now = catalogFor(cat, s.own)
        for (const crop of s.crops) {
          expect(now.seed(crop.seed), crop.seed).toBeDefined()
          expect(fieldOf(crop.x, crop.y, s.fields, s.cleared)).toBe(now.seed(crop.seed)?.pack)
        }
        for (const [f2, field2] of Object.entries(s.own)) expect(Object.hasOwn(s.fields, f2) && field2.id === f2).toBe(true)
      }
      expect(refusedCount(kept, cat)).toBe(0)
      expect(fold(kept, cat)).toEqual(s)
      // The log as a file: written, read back, replayed.
      expect(fold(JSON.parse(JSON.stringify(kept)) as unknown[], cat)).toEqual(s)
    }), { numRuns: 150 })
  })
})

describe('docs/own-fields.md', () => {
  const doc = readFileSync(new URL('../../docs/own-fields.md', import.meta.url), 'utf8')
  it('says the numbers the game plays by', () => {
    expect(doc).toContain('costs ' + RULES.fence.own + ' coins')
    expect(doc).toContain('room for ' + OWN_TODAY.fields + ' fields in all, and a field of your own for ' + OWN_TODAY.seeds + ' topics, each with up to ' + TEXT.cards + ' cards')
    expect(doc).toContain('up to ' + OWN.fields + ' fields of your own and ' + OWN.seeds + ' topics in each')
    expect(doc).toContain('plant ' + ['zero', 'one', 'two', 'three'][RULES.newSeedsPerDay] + ' new ones a day')
  })
  it('names every kind a topic can be, and every event that keeps one', () => {
    for (const k of Object.values(KINDS)) expect(doc, k.label).toContain('| ' + k.label + ' |')
    for (const e of ['own-field-set', 'own-seeds-set', 'own-seed-removed', 'own-field-removed']) expect(doc).toContain('`' + e + '`')
  })
})
