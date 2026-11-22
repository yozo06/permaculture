import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../engine/catalog'
import { smallCatalog as cat, smallFarm, run } from '../engine/fixtures'
import { check } from '../engine/fold'
import { OWN_TODAY, catalogFor, isOwnFieldId, isOwnSeedId, type OwnField, type OwnSeed } from '../engine/own'
import { read } from '../reader'
import type { FarmEvent, FarmState } from '../engine/types'
import {
  AMOUNT, FILL_AT_ONCE, OWN_COLORS, aboutLines, addSheetHtml, aiPrompt, cardsFromText, cardsText, explainAsk, fieldSheetHtml, harvestTag, layerText, nameFieldSheetHtml, newFieldId, newSeedId, pickColor, readingHtml,
  toAdd, topicSheetHtml, type About,
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
/** The small farm with that field made on it, holding these topics. */
const farmWith = (...batches: OwnSeed[][]): FarmState =>
  run(cat, [{ type: 'own-field-set', field: F, slot: 2, title: 'German', color: '#4DB6A4' }, ...batches.map((seeds): FarmEvent => ({ type: 'own-seeds-set', field: F, seeds }))], smallFarm())

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
    // What a note says of a paste is the learner's own text: it goes on the page as text.
    const evil = read('Rock <img src=x onerror=alert(1);//\nrock <img src=x onerror=alert(1);//')
    const shown = readingHtml(evil, toAdd(evil, field(), counting()))
    expect(shown).toContain('there twice')
    expect(shown).not.toContain('<img')
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
  /** The lines of the prompt that show a shape, which are a small list in that shape themselves. */
  const shapes = (p: string): string => p.slice(p.indexOf('line shapes'), p.indexOf('Rules:')).split('\n').slice(1).join('\n')

  it('names the subject, and asks for questions with wrong answers under every topic', () => {
    const p = aiPrompt('German A1')
    expect(p).toContain('I am learning: German A1')
    expect(p).toMatch(/Under every topic[^\n]*question lines/)
    expect(p).toMatch(/three wrong answers/)
    expect(p).not.toContain('##')
    expect(p).not.toContain('**')
  })

  it('shows the chat a shape that the reader reads as a topic with its part, its note and a card with three wrong answers', () => {
    const d = read(shapes(aiPrompt('German A1')))
    expect(d.notes).toEqual([])
    expect(d.topics).toHaveLength(1)
    // One part alone stands over everything, as a title does. Two or more are the groups of their topics.
    expect(d.title).toBe('the name of a part of the subject')
    expect(d.topics[0]?.name).toBe('the name of one topic in that part')
    expect(d.topics[0]?.summary).toBe('one line on what to read for that topic')
    expect(d.topics[0]?.cards).toHaveLength(1)
    expect(d.topics[0]?.cards[0]?.wrong).toHaveLength(3)
    expect(d.topics[0]?.cards[0]?.q.endsWith('?')).toBe(true)
  })

  it('reads an answer in that shape, and the farm takes every topic of it', () => {
    const answer = [
      'Part: Greetings', 'Topic: Saying hello', 'Read: the three greetings and when each is used',
      'Which greeting is used in the morning? = Guten Morgen | Guten Abend | Gute Nacht | Tschüss',
      'What does "Tschüss" mean? = Bye | Hello | Thanks | Please',
      'Topic: Introducing yourself', 'Practise: saying your name and where you are from',
      'How do you say "My name is"? = Ich heiße | Ich bin aus | Ich habe | Ich mag',
      'Part: Food', 'Topic: Bread and cheese', 'Read: the words on a breakfast table',
      'What is "Brot"? = Bread | Butter | Cheese | Milk',
    ].join('\n')
    const d = read(answer)
    expect(d.topics.map((t) => [t.group, t.name, t.kind, t.cards.length])).toEqual([['Greetings', 'Saying hello', 'idea', 2], ['Greetings', 'Introducing yourself', 'skill', 1], ['Food', 'Bread and cheese', 'idea', 1]])
    const a = toAdd(d, field(), counting())
    expect(a.seeds).toHaveLength(3)
    expect(a.unfit).toBe(0)
    const after = farmWith(a.seeds)
    expect(after.own[F]?.seeds[1]?.cards[0]).toEqual({ q: 'How do you say "My name is"?', a: 'Ich heiße', wrong: ['Ich bin aus', 'Ich habe', 'Ich mag'] })
    // Every one of them is asked as multiple choice, with the wrong answers it came with.
    const pack = catalogFor(cat, after.own).pack(F)
    expect(pack?.seeds.map((x) => x.harvest)).toEqual(['recall', 'recall', 'recall'])
    expect(pack?.seeds[2]?.questions?.water?.[0]?.distractors).toEqual(['Butter', 'Cheese', 'Milk'])
  })

  it('shows the chat one finished topic, which the reader reads as it reads the answer', () => {
    const p = aiPrompt('German A1')
    const example = p.slice(p.indexOf('Do not copy it'))
    const d = read(example.split('\n').slice(1).join('\n'))
    expect(d.topics).toHaveLength(1)
    expect(d.topics[0]?.cards.length).toBeGreaterThanOrEqual(2)
    expect(d.topics[0]?.cards.every((c) => c.wrong?.length === 3)).toBe(true)
    expect(d.notes).toEqual([])
    // And it tells the chat off the shapes that weaker ones fall back on.
    expect(p).toMatch(/no number after/)
    expect(p).toMatch(/one line/)
    expect(p).toMatch(/End on the last question line/)
  })

  it('hands the chat what the learner wrote in the box, cut to what a chat will read', () => {
    const p = aiPrompt('Coffee', '  I trade physical coffee and want to understand futures.  ')
    expect(p).toContain('I trade physical coffee and want to understand futures.')
    expect(p.indexOf('I trade')).toBeLessThan(p.indexOf('line shapes'))
    expect(aiPrompt('Coffee', '   ')).toBe(aiPrompt('Coffee'))
    expect(aiPrompt('Coffee', 'x'.repeat(9000)).length).toBeLessThan(aiPrompt('Coffee').length + 6200)
    // A list too long to go whole is cut at the end of a line, not through a topic.
    const lines = Array.from({ length: 400 }, (_, i) => 'Topic number ' + i + ' of my own list')
    const carried = aiPrompt('Coffee', lines.join('\n'))
    const last = carried.slice(0, carried.indexOf('\n\nWrite me')).split('\n').pop()
    expect(lines).toContain(last)
    // A list of forty topics with a line each fits whole.
    expect(aiPrompt('Coffee', readFileSync('src/reader/pastes/coffee-chat.txt', 'utf8'))).toContain('Broker and market access')
  })

  it('tells the chat what each of the five answers said, and nothing of a question left unanswered', () => {
    const plain = aiPrompt('Coffee')
    const all: About = { purpose: 'work', level: 'basics', amount: 'working', mode: 'do', lean: 'Skip the history.' }
    const p = aiPrompt('Coffee', '', [], all)
    for (const q of ['purpose', 'level', 'mode'] as const) {
      const said = aiPrompt('Coffee', '', [], { [q]: all[q] })
      expect(said).not.toBe(plain)
      expect(aboutLines({ [q]: all[q] }).every((l) => p.includes(l))).toBe(true)
    }
    expect(aboutLines({})).toEqual([])
    expect(aiPrompt('Coffee', '', [], {})).toBe(plain)
    // What is to lean on or leave out goes with what was written in the box.
    expect(p).toContain('Skip the history.')
    expect(aiPrompt('Coffee', 'I trade', [], { lean: 'Skip the history.' })).toMatch(/I trade\nSkip the history\./)
    // How much decides the size of the list.
    expect(aiPrompt('Coffee', '', [], { amount: 'taste' })).toMatch(new RegExp('about ' + AMOUNT.taste + ' topics'))
    expect(aiPrompt('Coffee', '', [], { amount: 'thorough' })).toMatch(new RegExp('about ' + AMOUNT.thorough + ' topics'))
    expect(plain).toMatch(/3 to 6 parts/)
    expect(p).not.toMatch(/3 to 6 parts/)
  })

  it('stays short enough to go inside a link with every answer given', () => {
    const p = aiPrompt('Organic chemistry for my second year', '', [], { purpose: 'exam', level: 'using', amount: 'thorough', mode: 'both', lean: 'Lean on Clayden, chapters 1 to 12.' })
    expect(encodeURIComponent(p).length).toBeLessThanOrEqual(4000)
  })

  it('reads an answer written to a request with the five answers in it, as it reads one without', () => {
    const p = aiPrompt('German A1', '', [], { purpose: 'talk', level: 'new', amount: 'taste', mode: 'know' })
    const d = read(shapes(p))
    expect(d.notes).toEqual([])
    expect(d.topics).toHaveLength(1)
    expect(d.topics[0]?.cards[0]?.wrong).toHaveLength(3)
  })

  it('asks for questions on the topics a field has the same way whatever the five answers were', () => {
    const have = [seed('aaaaaa', { name: 'Basis risk' })]
    expect(aiPrompt('Coffee', '', have, { level: 'new', amount: 'taste' })).toBe(aiPrompt('Coffee', '', have))
  })

  it('asks for questions on the topics a field has that have none, by their own names', () => {
    const have = [seed('aaaaaa', { name: 'Basis risk', summary: 'practise examples' }), seed('bbbbbb', { name: 'Core vocabulary', cards: [{ q: 'FOB', a: 'Free on board' }] }), seed('cccccc', { name: 'Weather risk' })]
    const p = aiPrompt('Coffee', '', have)
    expect(p).toContain('Topic: Basis risk')
    expect(p).toContain('Topic: Weather risk')
    expect(p).not.toContain('Core vocabulary')
    expect(p).toMatch(/exactly as/)
    expect(p).not.toContain('Part:')
    // With no topic that lacks questions, it is the prompt for a new list.
    expect(aiPrompt('Coffee', '', [have[1] as OwnSeed])).toBe(aiPrompt('Coffee'))
    // A chat writes only so much at once: twenty topics to a prompt, the first twenty that have no questions.
    const many = Array.from({ length: 45 }, (_, i) => seed('n' + String(i).padStart(5, '0'), { name: 'Bare topic ' + i }))
    const first = aiPrompt('Coffee', '', many)
    expect((first.match(/^Topic: Bare topic /gm) ?? []).length).toBe(FILL_AT_ONCE)
    expect(first).toContain('Topic: Bare topic 19')
    expect(first).not.toContain('Topic: Bare topic 20')
  })
})

describe('questions for topics that are there already', () => {
  const have = field([seed('aaaaaa', { name: 'Basis risk', summary: 'practise examples', group: 'Hedging', kind: 'skill' }), seed('bbbbbb', { name: 'Weather risk' }), seed('cccccc', { name: 'Core vocabulary', cards: [{ q: 'FOB', a: 'Free on board' }] })])
  const answer = 'Topic: basis risk\nRead: something else\nWhat is basis? = Cash minus futures | Futures minus cash | A fee | A grade\nTopic: Weather risk\nRead: frost and drought\nWhich hurts Brazil most? = Frost | Hail | Fog | Snow\nTopic: Core vocabulary\nPTBF = Price to be fixed | Paid | Posted | Port\nTopic: New one\nWhat? = a | b | c'

  it('gives a topic that had none its questions, and leaves everything else of it as it was', () => {
    const a = toAdd(read(answer), have, counting())
    expect(a.filled.map((s) => [s.id, s.name, s.kind, s.group, s.summary, s.cards.length])).toEqual([
      [F + '_aaaaaa', 'Basis risk', 'skill', 'Hedging', 'practise examples', 1],
      [F + '_bbbbbb', 'Weather risk', 'idea', '', '', 1],
    ])
    expect(a.filled[0]?.cards[0]).toEqual({ q: 'What is basis?', a: 'Cash minus futures', wrong: ['Futures minus cash', 'A fee', 'A grade'] })
    // A topic that has cards keeps them, and a new topic is new.
    expect(a.already).toBe(1)
    expect(a.seeds.map((s) => s.name)).toEqual(['New one'])
  })

  it('knows a topic by its name however the chat wrote it back', () => {
    const mine = field([seed('aaaaaa', { name: 'Knife skills: dicing & slicing' }), seed('bbbbbb', { name: 'Roasting vs. baking' }), seed('cccccc', { name: 'HEAT CONTROL' }), seed('dddddd', { name: 'Stocks' })])
    const back = 'Topic: 1. Knife Skills - Dicing & Slicing\nWhat is a dice? = Small even cubes | Thin strips | A rough chop | A fine paste\nTopic: "Roasting vs baking"\nWhich uses dry heat? = Both | Neither | Only roasting | Only baking\nTopic: Heat control.\nWhat does simmer mean? = Just below boiling | A rolling boil | No heat | Deep frying\nTopic: **Stocks**\nWhat is stock made from? = Bones | Flour | Cream | Sugar'
    const a = toAdd(read(back), mine, counting())
    expect(a.filled.map((s) => s.name)).toEqual(['Knife skills: dicing & slicing', 'Roasting vs. baking', 'HEAT CONTROL', 'Stocks'])
    expect(a.seeds).toEqual([])
  })

  it('gives the questions to the one of two topics of a name that has none', () => {
    const twins = field([seed('aaaaaa', { name: 'Stocks' }), seed('bbbbbb', { name: 'Stocks', cards: [{ q: 'a', a: 'b' }] })])
    expect(toAdd(read('Topic: Stocks\nWhat is stock made from? = Bones | Flour | Cream | Sugar'), twins, counting()).filled.map((s) => s.id)).toEqual([F + '_aaaaaa'])
    const other = field([seed('bbbbbb', { name: 'Stocks', cards: [{ q: 'a', a: 'b' }] }), seed('aaaaaa', { name: 'Stocks' })])
    expect(toAdd(read('Topic: Stocks\nWhat is stock made from? = Bones | Flour | Cream | Sugar'), other, counting()).filled.map((s) => s.id)).toEqual([F + '_aaaaaa'])
  })

  it('gives a topic the questions of every set the reader made of them, as many as a topic holds', () => {
    const lots = 'Topic: Weather risk\n' + Array.from({ length: 13 }, (_, i) => 'Question ' + i + '? = right ' + i + ' | wrong a | wrong b | wrong c').join('\n')
    const d = read(lots, { limits: { cards: 8 } })
    expect(d.topics.map((t) => t.name)).toEqual(['Weather risk (1)', 'Weather risk (2)'])
    const a = toAdd(d, have, counting())
    expect(a.filled.map((s) => [s.name, s.cards.length])).toEqual([['Weather risk', 10]])
    expect(a.seeds).toEqual([])
  })

  it('says so on the sheet, and the farm takes them', () => {
    const d = read(answer)
    const a = toAdd(d, have, counting())
    const html = readingHtml(d, a)
    expect(html).toContain('2 topics you already have get their questions')
    expect(html).toContain('1 is in the field already')
    const s1 = farmWith(have.seeds, [...a.filled, ...a.seeds])
    expect(s1.own[F]?.seeds.map((x) => [x.name, x.cards.length])).toEqual([['Basis risk', 1], ['Weather risk', 1], ['Core vocabulary', 1], ['New one', 1]])
  })

  it('shows what it would do when there is nothing new but questions', () => {
    const only = 'Topic: Weather risk\nWhich hurts Brazil most? = Frost | Hail | Fog | Snow'
    const a = toAdd(read(only), have, counting())
    expect(a.seeds).toEqual([])
    expect(readingHtml(read(only), a)).toContain('1 topic you already have gets its questions')
    expect(readingHtml(read(only), a)).not.toContain('Nothing new to add')
  })
})

describe('topics with nothing to ask', () => {
  it('says how many there are, and what that means, before they are added', () => {
    const d = read('Part: A\nTopic: One\nWhat? = a | b | c\nTopic: Two\nTopic: Three')
    const html = readingHtml(d, toAdd(d, field(), counting()))
    expect(html).toContain('2 of them have no questions')
    expect(html).toMatch(/explain(ing)? (them )?in writing/)
    const all = read('Topic: One\nWhat? = a | b | c')
    expect(readingHtml(all, toAdd(all, field(), counting()))).not.toContain('no questions')
  })

  it('says on the field\'s sheet how many of its topics have none, and where to get them', () => {
    const mine = field([seed('aaaaaa'), seed('bbbbbb', { cards: [{ q: 'a', a: 'b' }] })])
    const s = farmWith(mine.seeds)
    expect(fieldSheetHtml(s.own[F] as OwnField, s, catalogFor(cat, s.own))).toContain('1 topic has no questions')
    const full = farmWith([seed('bbbbbb', { cards: [{ q: 'a', a: 'b' }] })])
    expect(fieldSheetHtml(full.own[F] as OwnField, full, catalogFor(cat, full.own))).not.toContain('no questions')
  })

  it('offers on the add sheet a prompt for questions when the field has topics without any', () => {
    expect(addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, false, 3)).toContain('data-act="ownPromptFill"')
    expect(addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, false, 3)).toContain('questions on your 3 topics without any')
    expect(addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, false, 45)).toContain('questions on ' + FILL_AT_ONCE + ' of your 45 topics without any')
    expect(addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, false, 0)).not.toContain('ownPromptFill')
    expect(addSheetHtml({ id: F, title: 'German', color: '#4DB6A4' }, true)).not.toContain('ownPromptFill')
  })
})

describe('the box of a topic\'s cards, with wrong answers', () => {
  it('writes a card\'s wrong answers after its answer, and reads them back', () => {
    const had = [{ q: 'Capital of Peru?', a: 'Lima', wrong: ['Quito', 'Bogotá'] }, { q: 'Hund', a: 'dog' }]
    expect(cardsText(had)).toBe('Capital of Peru? = Lima | Quito | Bogotá\nHund = dog')
    expect(cardsFromText(cardsText(had), had)).toEqual({ cards: had, unread: 0 })
    expect(cardsFromText('Capital of Chile? = Santiago | Lima|Quito | | lima | Lima').cards).toEqual([{ q: 'Capital of Chile?', a: 'Santiago', wrong: ['Lima', 'Quito'] }])
    expect(cardsFromText('q = a | b | c | d | e').cards).toEqual([{ q: 'q', a: 'a', wrong: ['b', 'c', 'd'] }])
  })

  it('leaves a card whose answer has an upright bar in it alone, while its line is not changed', () => {
    const had = [{ q: 'or in shell', a: 'a | b' }]
    expect(cardsFromText(cardsText(had), had)).toEqual({ cards: had, unread: 0 })
  })

  it('takes away a card\'s wrong answers when they are taken off its line', () => {
    const had = [{ q: 'Capital of Peru?', a: 'Lima', wrong: ['Quito', 'Bogotá'] }]
    expect(cardsFromText('Capital of Peru? = Lima', had).cards).toEqual([{ q: 'Capital of Peru?', a: 'Lima' }])
    expect(cardsFromText('Capital of Peru? = Lima | Cusco', had).cards).toEqual([{ q: 'Capital of Peru?', a: 'Lima', wrong: ['Cusco'] }])
  })
})
