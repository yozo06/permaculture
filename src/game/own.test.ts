import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../engine/catalog'
import { smallCatalog as cat, smallFarm, run } from '../engine/fixtures'
import { check } from '../engine/fold'
import { OWN_TODAY, catalogFor, isOwnFieldId, isOwnSeedId, type OwnField, type OwnSeed } from '../engine/own'
import { read } from '../reader'
import type { FarmEvent } from '../engine/types'
import {
  OWN_COLORS, addSheetHtml, aiPrompt, cardsFromText, cardsText, explainAsk, fieldSheetHtml, harvestTag, layerText, nameFieldSheetHtml, newFieldId, newSeedId, pickColor, readingHtml,
  toAdd, topicSheetHtml,
} from './own'

const F = 'my_abcd1234'
/** A source of numbers that looks random and is the same every run, so ids in tests are too. */
const counting = (): (() => number) => {
  let a = 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seed = (n: string, more: Partial<OwnSeed> = {}): OwnSeed => ({ id: F + '_' + n, name: 'Topic ' + n, kind: 'idea', summary: '', group: '', cards: [], ...more })
const field = (seeds: OwnSeed[] = []): OwnField => ({ id: F, title: 'German', color: '#4DB6A4', seeds })

describe('ids and colours', () => {
  it('makes ids the farm will take', () => {
    const rand = counting()
    const id = newFieldId(() => false, rand)
    expect(isOwnFieldId(id)).toBe(true)
    expect(isOwnSeedId(newSeedId(id, new Set(), rand))).toBe(true)
  })

  it('never hands out an id that is taken', () => {
    const first = newFieldId(() => false, counting())
    const second = newFieldId((id) => id === first, counting())
    expect(second).not.toBe(first)
    const one = newSeedId(F, new Set(), counting())
    const taken = new Set([one])
    const two = newSeedId(F, taken, counting())
    expect(two).not.toBe(one)
    // It is taken from then on.
    expect([...taken]).toEqual([one, two])
  })

  it('picks a colour no field on the farm has, and still picks one when all are used', () => {
    expect(pickColor([])).toBe(OWN_COLORS[0])
    expect(pickColor([(OWN_COLORS[0] ?? '').toLowerCase()])).toBe(OWN_COLORS[1])
    expect(OWN_COLORS).toContain(pickColor([...OWN_COLORS]))
    for (const c of OWN_COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('has no colour one of the game\'s own fields flies', () => {
    for (const taken of ['#B089D6', '#6DB24F', '#E58A5C', '#5FA8C9', '#E0A93E', '#A9A692', '#D98CA6']) expect(OWN_COLORS).not.toContain(taken)
  })
})

describe('what is added from a reading', () => {
  it('gives each topic an id in the field, and keeps what the reader found', () => {
    const a = toAdd(read('Recursion - a function that calls itself until a base case stops it\nPractise the serve'), field(), counting())
    expect(a.seeds.map((s) => [s.name, s.kind, s.summary])).toEqual([['Recursion', 'idea', 'a function that calls itself until a base case stops it'], ['Practise the serve', 'skill', '']])
    expect(a.seeds.every((s) => isOwnSeedId(s.id) && s.id.startsWith(F + '_'))).toBe(true)
    expect(new Set(a.seeds.map((s) => s.id)).size).toBe(2)
    expect(a).toMatchObject({ already: 0, over: 0, unfit: 0 })
  })

  it('leaves out what the field has already, whatever its capitals', () => {
    const a = toAdd(read('topic AAAAAA\nNew one'), field([seed('aaaaaa')]), counting())
    expect(a.seeds.map((s) => s.name)).toEqual(['New one'])
    expect(a.already).toBe(1)
  })

  it('adds no more than the field has room for, and counts the rest', () => {
    const full = field(Array.from({ length: OWN_TODAY.seeds - 2 }, (_, i) => seed('n' + String(i).padStart(5, '0'))))
    const a = toAdd(read('One\nTwo\nThree\nFour'), full, counting())
    expect(a.seeds.map((s) => s.name)).toEqual(['One', 'Two'])
    expect(a.over).toBe(2)
  })

  it('leaves out a topic the farm would refuse, so that the rest are still added', () => {
    const draft = { ...read('Good one\nAnother'), topics: [...read('Good one\nAnother').topics, { name: '', summary: '', kind: 'idea' as const, group: '', cards: [] }, { name: 'x'.repeat(49), summary: '', kind: 'idea' as const, group: '', cards: [] }] }
    const a = toAdd(draft, field(), counting())
    expect(a.seeds.map((s) => s.name)).toEqual(['Good one', 'Another'])
    expect(a.unfit).toBe(2)
    expect(readingHtml(draft, a)).toContain('2 lines could not be made into a topic')
  })

  it('knows a topic it has already, whatever space stands round its name', () => {
    expect(toAdd({ ...read('x'), topics: [{ name: ' Topic aaaaaa ', summary: '', kind: 'idea', group: '', cards: [] }] }, field([seed('aaaaaa')]), counting()).already).toBe(1)
  })

  it('is taken by the farm as it is', () => {
    const text = '## Verbs\ngehen = to go\nkommen = to come\nsehen = to see\n## Grammar\n- The dative: when a verb asks for it, and how the articles change with it\n- Practise word order'
    const s = run(cat, [{ type: 'own-field-set', field: F, slot: 2, title: 'German', color: '#4DB6A4' }], smallFarm())
    const e: FarmEvent = { type: 'own-seeds-set', field: F, seeds: toAdd(read(text), field(), counting()).seeds }
    expect(check(s, e, cat)).toBeNull()
  })
})

describe('the reading, as the sheet shows it', () => {
  it('says how many topics, groups and cards it found', () => {
    const d = read('## Verbs\ngehen = to go\nkommen = to come\nsehen = to see\n## Grammar\n- The dative\n- Word order')
    const html = readingHtml(d, toAdd(d, field(), counting()))
    expect(html).toContain('<b>3 topics</b>')
    expect(html.indexOf('<div class="fh">Grammar</div>')).toBeGreaterThan(html.indexOf('Verbs'))
    // The set of cards stands under no heading of its own, and is not taken for part of the group beside it.
    expect(html.indexOf('<div class="fh">Other topics</div>')).toBeLessThan(html.indexOf('Verbs'))
    expect(html.indexOf('<div class="fh">Other topics</div>')).toBeGreaterThan(-1)
    expect(html).toContain('3 question cards')
    expect(html).toContain('The dative')
  })

  it('offers the other reading of lines in two parts, and marks the one in use', () => {
    const d = read('Hund - dog\nKatze - cat\nMaus - mouse')
    const html = readingHtml(d, toAdd(d, field(), counting()))
    expect(html).toMatch(/data-act="ownPairs" data-arg="" class="on"/)
    expect(html).toMatch(/data-act="ownPairs" data-arg="cards">/)
    expect(html).toMatch(/data-act="ownPairs" data-arg="topics">/)
    expect(readingHtml(d, toAdd(d, field(), counting()), 'topics')).toMatch(/data-act="ownPairs" data-arg="topics" class="on"/)
    expect(readingHtml(read('Loops\nRecursion'), toAdd(read('Loops\nRecursion'), field(), counting()))).not.toContain('ownPairs')
  })

  it('says what it left out, what is there already and what there is no room for', () => {
    const d = read('Topic aaaaaa\nLoops\nloops')
    const html = readingHtml(d, toAdd(d, field([seed('aaaaaa')]), counting()))
    expect(html).toContain('there twice')
    expect(html).toContain('1 is in the field already')
    const full = field(Array.from({ length: OWN_TODAY.seeds }, (_, i) => seed('n' + String(i).padStart(5, '0'))))
    expect(readingHtml(read('One'), toAdd(read('One'), full, counting()))).toContain('holds ' + OWN_TODAY.seeds)
  })

  it('says so when there is nothing to add, and shows only the first of a long list', () => {
    expect(readingHtml(read(''), toAdd(read(''), field(), counting()))).toContain('One topic to a line')
    // All of it is in the field already: that is not "nothing yet".
    const again = readingHtml(read('Topic aaaaaa'), toAdd(read('Topic aaaaaa'), field([seed('aaaaaa')]), counting()))
    expect(again).toContain('Nothing new to add.')
    expect(again).not.toContain('One topic to a line')
    const many = read(Array.from({ length: 60 }, (_, i) => 'Topic number ' + i).join('\n'))
    const html = readingHtml(many, toAdd(many, field(), counting()))
    expect(html).toContain('<b>60 topics</b>')
    expect(html).toContain('and 30 more')
  })

  it('never lets a topic\'s text become markup', () => {
    const d = read('<img src=x onerror=alert(1)> - "quoted" & <b>bold</b>\n## <script>x</script>\n- inside')
    const html = readingHtml(d, toAdd(d, field(), counting()))
    expect(html).not.toMatch(/<img|<script|onerror=alert\(1\)>/)
  })
})

describe('the sheets', () => {
  const s = run(cat, [
    { type: 'own-field-set', field: F, slot: 2, title: 'German <b>', color: '#4DB6A4' },
    { type: 'own-seeds-set', field: F, seeds: [seed('aaaaaa', { group: 'Verbs', kind: 'facts', cards: [{ q: 'gehen', a: 'to go' }] }), seed('bbbbbb', { name: 'Word "order"', summary: 'Read ch. 3' })] },
  ], smallFarm())
  const mine = s.own[F] as OwnField

  it('lists a field\'s topics under their groups, with what can be done to each', () => {
    const html = fieldSheetHtml(mine, s, catalogFor(cat, s.own))
    expect(html).toContain('German &lt;b&gt;')
    expect(html).toContain('2 topics')
    expect(html.indexOf('Verbs')).toBeLessThan(html.indexOf('Topic aaaaaa'))
    expect(html).toContain('Word &quot;order&quot;')
    expect(html).toContain('data-act="ownEdit" data-arg="' + F + '_aaaaaa"')
    expect(html).toContain('data-act="ownAddOpen" data-arg="' + F + '"')
    expect(html).toContain('data-act="ownDrop"')
    expect(html).toContain('Facts to remember')
    expect(html).not.toMatch(/Ground cover|Shrub|judged|perennial|Z[1-4]/)
  })

  it('does not offer to take away a field with something planted in it', () => {
    const planted = { ...s, crops: [{ seed: F + '_aaaaaa', x: 0, y: 0, stage: 1, best: 1, due: 3, wilted: false, perennial: false, notes: '', journal: [] }] }
    const html = fieldSheetHtml(mine, planted, catalogFor(cat, planted.own))
    expect(html).not.toContain('data-act="ownDrop"')
    expect(html).toContain('growing')
  })

  it('asks for a paste, and says what a paste can be', () => {
    const html = addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, true)
    expect(html).toContain('id="ownText"')
    expect(html).toContain('data-min="1"')
    expect(html).toContain('id="ownFile"')
    expect(html).toContain('data-act="ownPrompt"')
    expect(html).toContain('Skip for now')
    expect(addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, false)).toContain('Back')
  })

  it('shows a topic for changing, with its cards one to a line', () => {
    const html = topicSheetHtml(mine, mine.seeds[0] as OwnSeed, false)
    expect(html).toContain('value="Topic aaaaaa"')
    expect(html).toContain('gehen = to go')
    expect(html).toMatch(/<option value="facts" selected>/)
    expect(html).toContain('data-act="ownRemove"')
    expect(topicSheetHtml(mine, mine.seeds[0] as OwnSeed, true)).not.toContain('data-act="ownRemove"')
  })

  it('reads cards back from the lines of the box, and counts the lines it could not read', () => {
    expect(cardsFromText('gehen = to go\n\nsehen\tto see\nno answer here\n = x')).toEqual({ cards: [{ q: 'gehen', a: 'to go' }, { q: 'sehen', a: 'to see' }], unread: 2 })
  })

  it('hands back the cards a topic had when the box still says them, equals signs and all', () => {
    const had = [{ q: '2 + 2 = ?', a: '4' }, { q: 'x', a: 'y = z' }, { q: 'a = b', a: 'c = d' }]
    expect(cardsFromText(cardsText(had), had)).toEqual({ cards: had, unread: 0 })
    // One line changed, the others untouched.
    expect(cardsFromText(cardsText(had).replace('x = y = z', 'x = why'), had).cards).toEqual([{ q: '2 + 2 = ?', a: '4' }, { q: 'x', a: 'why' }, { q: 'a = b', a: 'c = d' }])
    // A new line with two equals signs is a sum and its answer when its first part is a question...
    expect(cardsFromText('3 + 3 = ? = 6').cards).toEqual([{ q: '3 + 3 = ?', a: '6' }])
    // ...and otherwise a name and a formula, as the reader reads it.
    expect(cardsFromText('Force = F = ma').cards).toEqual([{ q: 'Force', a: 'F = ma' }])
  })

  it('keeps the question of a card whose answer is changed, wherever its equals signs are', () => {
    const had = [{ q: 'Force', a: 'F = ma' }, { q: '2 + 2 = ?', a: '4' }]
    expect(cardsFromText('Force = F = m a\n2 + 2 = ? = four', had).cards).toEqual([{ q: 'Force', a: 'F = m a' }, { q: '2 + 2 = ?', a: 'four' }])
  })

  it('hands out two cards that read as the same line one each, in their order', () => {
    const had = [{ q: 'a', a: 'b = c' }, { q: 'a = b', a: 'c' }, { q: 'x', a: 'y' }]
    expect(cardsFromText(cardsText(had), had).cards).toEqual(had)
  })

  it('reads a line with a tab at its end or its start', () => {
    expect(cardsFromText('q = a\t\n\tr = b')).toEqual({ cards: [{ q: 'q', a: 'a' }, { q: 'r', a: 'b' }], unread: 0 })
  })

  it('never lets what a farmer typed become markup, on any of its sheets', () => {
    const evil = '"><img src=x onerror=alert(1)><script>x</script>'
    const bad: OwnField = { id: F, title: evil, color: '#4DB6A4', seeds: [seed('aaaaaa', { name: evil, summary: evil, group: evil, cards: [{ q: evil, a: evil }] })] }
    const state = { crops: [], focus: {} }
    const sheets = [
      fieldSheetHtml(bad, state, catalogFor(cat, { [F]: bad })), topicSheetHtml(bad, bad.seeds[0] as OwnSeed, false), addSheetHtml(bad, true), addSheetHtml(bad, false),
      nameFieldSheetHtml({ id: F, title: evil }), readingHtml(read(evil + '\n## ' + evil + '\n- ' + evil + ' = ' + evil), toAdd(read(evil + '\n- a = ' + evil + '\n- b = c\n- d = e'), bad, counting())),
      explainAsk({ pack: F, layer: 'herb', name: evil }),
    ]
    for (const html of sheets) {
      expect(html).not.toMatch(/<img|<script|onerror=alert\(1\)>/)
      // Nothing typed ends an attribute early.
      expect(html).not.toContain('value=""><')
    }
    expect(sheets[1]).toContain('&lt;script&gt;')
  })
})

describe('plain words for a topic of your own', () => {
  const s = run(cat, [
    { type: 'own-field-set', field: F, slot: 2, title: 'German', color: '#4DB6A4' },
    { type: 'own-seeds-set', field: F, seeds: [seed('aaaaaa', { kind: 'skill' }), seed('bbbbbb', { kind: 'rule' })] },
  ], smallFarm())
  const c = catalogFor(cat, s.own)
  const own = (n: string) => { const x = c.seed(F + '_' + n); if (!x) throw new Error('no seed'); return x }
  const corn = buildCatalog(cat.packs).seed('corn')

  it('says what kind of thing it is, where the game\'s own seeds say their layer', () => {
    expect(layerText(own('aaaaaa'))).toBe('A skill to practise')
    expect(layerText(own('bbbbbb'))).toBe('A rule or a pattern')
    if (corn) expect(layerText(corn)).toBe('Canopy layer')
  })

  it('says how it is harvested in words a person uses', () => {
    expect(harvestTag(own('aaaaaa'))).toBe('do it')
    expect(harvestTag(own('bbbbbb'))).toBe('write-up')
    if (corn) expect(harvestTag(corn)).toBe('recall')
  })

  it('asks for what was practised of a skill, and for an explanation of anything else', () => {
    expect(explainAsk(own('aaaaaa'))).toMatch(/what you did today/)
    expect(explainAsk(own('bbbbbb'))).toMatch(/in your own words/)
    if (corn) expect(explainAsk(corn)).toMatch(/in your own words/)
  })
})

describe('the prompt for an AI chat', () => {
  it('names the subject, and asks for a shape the reader reads', () => {
    const p = aiPrompt('German A1')
    expect(p).toContain('German A1')
    const answer = '## Greetings\n- Saying hello: the three greetings and when each is used\n- Introducing yourself: name, where you are from\n## Food words\nBrot = bread\nKäse = cheese\nMilch = milk\nWasser = water'
    const d = read(answer)
    expect(d.topics.map((t) => [t.group, t.name, t.cards.length])).toEqual([['Greetings', 'Saying hello', 0], ['Greetings', 'Introducing yourself', 0], ['', 'Food words', 4]])
  })
})
