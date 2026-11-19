import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ENGLISH, read, type Draft, type Words } from './index.ts'

const text = (...lines: string[]): string => lines.join('\n')
const names = (d: Draft): string[] => d.topics.map((t) => t.name)

/** A language the reader knows no words of: it reads by shape alone. */
const NONE: Words = {
  labels: [], weekdays: [], reading: { verbs: [], refs: [] }, course: { labels: [], headings: [], afterColon: [], over: [], pages: [], totals: [], roughly: [] }, units: [],
  page: { see: [], refs: [] }, kinds: { doing: [], rule: [], ruleStarts: [], versus: [], whole: [], facts: [], drill: [] }, chatter: { starts: [], openers: [], whole: [], tails: [] },
  asking: { leads: [], wants: [], verbs: [], whole: [], more: [], about: [] }, outline: { parts: [], topics: [], notes: [] }, counters: [], columns: [], questions: [], answers: [], ands: [],
  writes: { page: '', partOf: '', card: '', cards: '', cardsName: '' },
}

/** Enough Spanish to read a syllabus by. */
const SPANISH: Words = {
  ...NONE,
  labels: ['unidad', 'semana', 'capítulo'],
  weekdays: ['lunes', 'martes'],
  reading: { verbs: ['leer', 'ver'], refs: ['capítulo', 'páginas'] },
  course: { ...NONE.course, labels: ['nota'], headings: ['bibliografía'], totals: ['total'], roughly: ['unas'], pages: ['página'] },
  units: ['horas', 'h'],
  page: { see: ['ver'], refs: ['pág.', 'página'] },
  kinds: { ...NONE.kinds, doing: ['practicar'], rule: ['regla', 'teoría'], facts: ['vocabulario'], whole: ['introducción'] },
  chatter: { ...NONE.chatter, starts: ['aquí tienes'], whole: ['gracias'] },
  asking: { ...NONE.asking, wants: ['quiero'], verbs: ['aprender'] },
  questions: ['p', 'pregunta'], answers: ['r', 'respuesta'], ands: ['y'],
  writes: { page: 'Página {n}.', partOf: 'Parte de {path}.', card: '{n} tarjeta: {list}', cards: '{n} tarjetas: {list}', cardsName: 'Tarjetas' },
}

describe('the words it reads by', () => {
  it('reads by English when it is given none, and the same when it is handed English', () => {
    for (const paste of [text('Week 1: Limits', '- Epsilon delta', 'Total: 45 hours'), text('Hund - dog', 'Katze - cat', 'Maus - mouse'), "Here's your plan:\n1. Practise scales\n2. Ohm's law"]) {
      expect(read(paste, { words: ENGLISH })).toEqual(read(paste))
    }
  })

  it('reads a syllabus in another language once it has that language\'s words', () => {
    const paste = text('Programa del curso', '', 'Unidad 1: Los verbos (12 horas)', '- ser y estar', '- pretérito', 'Unidad 2: Los nombres', '- género', 'Bibliografía: Gramática básica', 'Total: unas 45 horas')
    const d = read(paste, { words: SPANISH })
    expect(d.title).toBe('Programa del curso')
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Unidad 1: Los verbos', 'ser y estar'], ['Unidad 1: Los verbos', 'pretérito'], ['Unidad 2: Los nombres', 'género']])
    expect(d.notes).toContainEqual({ code: 'course-left-out', items: [{ text: 'Bibliografía', under: 0 }, { text: 'Total', under: 0 }], more: 0 })
    // By English words the same text has a heading read as a topic, and the list of books kept as one.
    expect(names(read(paste))).toContain('Bibliografía')
  })

  it('knows the kind of a thing by that language\'s words, whole words only, capitals and accents as they come', () => {
    const d = read(text('Practicar la erre', 'Regla de tres', 'TEORÍA de juegos', 'Reglamento del club', 'Vocabulario de cocina', 'Introducción', 'Practice the serve'), { words: SPANISH })
    expect(d.topics.map((t) => t.kind)).toEqual(['skill', 'rule', 'rule', 'idea', 'facts', 'whole', 'idea'])
  })

  it('takes a question and its answer, a list said on one line, and what is not part of the list, by those words', () => {
    expect(read(text('P: ¿Capital de Perú?', 'R: Lima'), { words: SPANISH }).topics[0]?.cards).toEqual([{ q: '¿Capital de Perú?', a: 'Lima' }])
    expect(names(read('quiero aprender álgebra y geometría y cálculo', { words: SPANISH }))).toEqual(['álgebra', 'geometría', 'cálculo'])
    expect(names(read(text('Aquí tienes tu plan', 'Álgebra', 'Geometría', 'Gracias!'), { words: SPANISH }))).toEqual(['Álgebra', 'Geometría'])
  })

  it('writes the few words of its own in that language', () => {
    const d = read(text('# Curso', '## Parte uno', '### Cocina', '- Sopas, pág. 12', '## Palabras', 'perro = dog', 'gato = cat', 'pan = bread'), { words: SPANISH })
    expect(d.topics.find((t) => t.name === 'Sopas')?.summary).toBe('Página 12. Parte de Cocina.')
    expect(d.topics.find((t) => t.name === 'Palabras')?.summary).toBe('3 tarjetas: perro, gato, pan')
    expect(names(read(text('→ = flecha', '← = atrás', '↑ = arriba'), { words: SPANISH }))).toEqual(['Tarjetas'])
  })

  it('still reads bullets, headings, tables and lines in two parts with no words at all', () => {
    const d = read(text('# Course', '## Week 1', '- Limits', '- Series', '## Words', '| Hund | dog |', '| Katze | cat |', 'Total: 45 hours'), { words: NONE })
    expect(d.title).toBe('Course')
    // "Week 1" is a heading because it is marked as one, and the total is one more line in two parts: a card.
    expect(d.topics.map((t) => [t.group, t.name, t.cards.map((c) => c.q)])).toEqual([['Week 1', 'Limits', []], ['Week 1', 'Series', []], ['', 'Words', ['Hund', 'Katze', 'Total']]])
    expect(d.topics.map((t) => [t.kind, t.summary])).toEqual([['idea', ''], ['idea', ''], ['facts', 'Hund, Katze, Total']])
    expect(d.notes).toEqual([])
    // Unmarked, "Week 1" is a line like any other, and a set of cards with no words for a name is given a number.
    expect(names(read(text('Week 1', 'Limits', 'Series'), { words: NONE }))).toEqual(['Week 1', 'Limits', 'Series'])
    expect(names(read(text('Week 1', 'Limits', 'Series')))).toEqual(['Limits', 'Series'])
    expect(names(read(text('→ = x', '← = y', '↑ = z'), { words: NONE }))).toEqual(['1'])
  })

  it('finds a word as it is written, and nothing in it is a pattern', () => {
    const odd: Words = { ...NONE, course: { ...NONE.course, headings: ['q&a (optional)', 'a.b', 'c++', 'what?', '[x]', 'a|b', '^top$', 'back\\slash'] } }
    const d = read(text('Q&A (optional)', 'A.B', 'axb', 'C++', 'c', 'ccc', 'What?', 'wha', 'a', 'top', 'Back\\slash', 'Kept'), { words: odd })
    expect(names(d)).toEqual(['axb', 'c', 'ccc', 'wha', 'a', 'top', 'Kept'])
  })

  it('reads a space in a word as any run of spaces, and either apostrophe as both', () => {
    expect(names(read('I   want  to   learn chess'))).toEqual(['chess'])
    expect(names(read(text('Here’s your study plan', 'Algebra', 'Geometry')))).toEqual(names(read(text("Here's your study plan", 'Algebra', 'Geometry'))))
    expect(names(read(text('Here’s your study plan', 'Algebra', 'Geometry')))).toEqual(['Algebra', 'Geometry'])
  })

  it('takes the asking off the front however it is said', () => {
    for (const asking of ['i want to learn', "I'd like to learn about", 'I’d like to know more about', 'i wanna learn', 'i wanna to learn', 'ok so i need to study', 'teach me', 'help me with']) {
      expect(names(read(asking + ' birds')), asking).toEqual(['birds'])
    }
  })

  it('takes a word joined to a letter, a digit, a mark or an underscore for another word', () => {
    const kinds = (d: Draft): string[] => d.topics.map((t) => t.kind)
    expect(kinds(read(text("Ohm's law", 'Outlaw tactics', 'Lawé of motion', 'Law2 of motion', 'Labし', 'design_patterns', 'lab_report', 'intro_to_python', 'vocab_list')))).toEqual(['rule', 'idea', 'idea', 'idea', 'idea', 'idea', 'idea', 'idea', 'idea'])
    // A name out of a program is a name, not a total.
    const code = read(text('Variables', '- total_budget - 500', '- subtotal_tax 12', '- total_hours 45'))
    expect(names(code)).toEqual(['total_budget', 'subtotal_tax 12', 'total_hours 45'])
    expect(code.notes.map((n) => n.code)).toEqual(['title-taken'])
    // A sign that counts is not a letter: the word after it is still that word.
    expect(kinds(read(text('①Overview', '②Rules of chess', '③Vocabulary')))).toEqual(['whole', 'rule', 'facts'])
    // In a script that writes its vowels as marks, the word with one more mark is another word.
    const hindi: Words = { ...NONE, kinds: { ...NONE.kinds, rule: ['नियम'] } }
    expect(kinds(read(text('नियम', 'नियमों की सूची'), { words: hindi }))).toEqual(['rule', 'idea'])
  })

  it('knows a rough number by a whole word', () => {
    const left = (line: string): boolean => read(text('# T', line, '- a', '- b')).notes.some((n) => n.code === 'course-left-out')
    for (const line of ['Total: about 40', 'Total: approx. 40 hours', 'Total: approximately 40', 'Total: roughly 12', 'Total: ~40', 'Total: 45 hours']) expect(left(line), line).toBe(true)
    for (const line of ['Total: Aboutface tactics', 'Total: Aroundabout routes', 'Total: Approximation methods']) expect(left(line), line).toBe(false)
  })

  it('keeps a line that only begins like chatter', () => {
    expect(names(read(text('Great questions about biology', 'Algebra', 'Hope this helpsheet works', 'Geometry')))).toEqual(['Great questions about biology', 'Algebra', 'Hope this helpsheet works', 'Geometry'])
    expect(names(read(text('Great question!', 'Algebra', 'Hope this helps.', 'Geometry', 'Enjoy!')))).toEqual(['Algebra', 'Geometry'])
  })

  it('tries the longest word first, trims a word, and finds nothing by an empty one', () => {
    const leads: Words = { ...ENGLISH, asking: { ...ENGLISH.asking, leads: ['ok', 'ok so'] } }
    expect(names(read(text('ok so i want to learn about guitar', 'algebra', 'geometry'), { words: leads }))).toEqual(['guitar', 'algebra', 'geometry'])
    const spaced: Words = { ...NONE, chatter: { ...NONE.chatter, whole: [' thanks '] }, kinds: { ...NONE.kinds, whole: ['', '  ', 'overview'] } }
    const d = read(text('Salt', 'Overview of salts', 'Thanks'), { words: spaced })
    expect(d.topics.map((t) => [t.name, t.kind])).toEqual([['Salt', 'idea'], ['Overview of salts', 'whole']])
  })

  it('writes nothing where it has no words to write, and tidies the ones it is given', () => {
    const with_ = (writes: Partial<Words['writes']>): Words => ({ ...ENGLISH, writes: { ...ENGLISH.writes, ...writes } })
    expect(read(text('Mon: scales, p. 5', 'Tue: arpeggios, p. 6'), { words: with_({ page: '' }) }).topics.map((t) => t.summary)).toEqual(['Mon.', 'Tue.'])
    expect(read(text('Mon: scales, p. 5', 'Tue: arpeggios, p. 6'), { words: with_({ page: '   ' }) }).topics.map((t) => t.summary)).toEqual(['Mon.', 'Tue.'])
    expect(read(text('Mon: scales, p. 5', 'Tue: arpeggios, p. 6'), { words: with_({ page: ' p.\n{n} ' }) }).topics.map((t) => t.summary)).toEqual(['p. 5 Mon.', 'p. 6 Tue.'])
    const signs = text('→ = forward', '← = back', '↑ = up', '↓ = down')
    expect(names(read(signs, { words: with_({ cardsName: 'x'.repeat(200) }) }))[0]?.length).toBeLessThanOrEqual(48)
    expect(names(read(signs, { words: with_({ cardsName: '   ' }) }))).toEqual(['1'])
    expect(names(read(signs, { words: with_({ cardsName: ' a\nb\u200B ' }) }))).toEqual(['a b'])
    expect(names(read(signs, { words: with_({ cardsName: 'Cards of the study' }), limits: { name: 12 } }))[0]?.length).toBeLessThanOrEqual(12)
  })

  it('reads by English when the words it is handed cannot be made ready', () => {
    const paste = text('Week 1: Limits', '- One', 'Total: 45 hours')
    const huge = { ...ENGLISH, labels: ['x'.repeat(60000)] }
    expect(read(paste, { words: huge })).toEqual(read(paste))
    const trap = { get labels(): string[] { throw new Error('no') } } as unknown as Words
    expect(read(paste, { words: trap })).toEqual(read(paste))
  })

  it('never throws, whatever it is handed for words', () => {
    const paste = text('# Course', 'Week 1: Limits', '- One, see page 3', 'Q: a?', 'A: b', 'Hund = dog', 'Katze = cat', 'Maus = mouse', '→ = x', 'Total: 4')
    const broken: unknown[] = [null, undefined, 5, 'english', [], {}, { labels: 'week', kinds: null, writes: 7 }, { labels: [null, 5, { a: 1 }, 'week'], course: { totals: 'total' } }, { writes: { page: null, cards: ['x'] } }]
    for (const words of broken) {
      const d = read(paste, { words: words as Words })
      expect(d.topics.length, JSON.stringify(words)).toBeGreaterThan(0)
      for (const t of d.topics) expect(t.name.trim().length).toBeGreaterThan(0)
    }
    expect(read(paste, { words: null as unknown as Words })).toEqual(read(paste))
    expect(names(read('Week 1: Limits\n- One', { words: { labels: [null, 'week'] } as unknown as Words }))).toEqual(['One'])
  })

  it('never throws and keeps to its limits, whatever words it is given and whatever it reads', () => {
    const word = fc.oneof(fc.string({ maxLength: 8 }), fc.constantFrom('week', 'total', 'a', '.', '(', '[', '\\', '*', '+', '?', ' ', "'", 'q', '-', ''))
    const list = fc.array(word, { maxLength: 4 })
    const words = fc.record({
      labels: list, weekdays: list, reading: fc.record({ verbs: list, refs: list }), course: fc.record({ labels: list, headings: list, afterColon: list, over: list, pages: list, totals: list, roughly: list }), units: list,
      page: fc.record({ see: list, refs: list }), kinds: fc.record({ doing: list, rule: list, ruleStarts: list, versus: list, whole: list, facts: list, drill: list }), chatter: fc.record({ starts: list, openers: list, whole: list, tails: list }),
      asking: fc.record({ leads: list, wants: list, verbs: list, whole: list, more: list, about: list }), outline: fc.record({ parts: list, topics: list, notes: list }), counters: list, columns: list, questions: list, answers: list, ands: list,
      writes: fc.record({ page: fc.string({ maxLength: 12 }), partOf: fc.string({ maxLength: 12 }), card: fc.string({ maxLength: 12 }), cards: fc.string({ maxLength: 12 }), cardsName: fc.string({ maxLength: 12 }) }),
    })
    const piece = fc.constantFrom('#', '-', '1.', ' ', '\n', ' - ', ': ', ' = ', '|', 'Q:', 'A:', '?', ',', 'week 1', 'total', 'a', 'q', ' and ', ' p. 3', '(', '.', '*', '→')
    const junk = fc.array(fc.oneof(piece, fc.string({ maxLength: 8 })), { maxLength: 40 }).map((a) => a.join(''))
    fc.assert(fc.property(words, junk, (w, s) => {
      const d = read(s, { words: w })
      const seen = new Set<string>()
      for (const t of d.topics) {
        expect(t.name.length).toBeGreaterThanOrEqual(1)
        expect(t.name.length).toBeLessThanOrEqual(48)
        expect(t.summary.length).toBeLessThanOrEqual(300)
        expect(seen.has(t.name.toLowerCase())).toBe(false)
        seen.add(t.name.toLowerCase())
      }
    }), { numRuns: 60 })
    // Each run makes a language ready, which is the slow part and happens once in a real program.
  }, 30000)
})

describe('the English words', () => {
  const lists = (o: object, at = ''): [string, readonly string[]][] =>
    Object.entries(o).flatMap(([k, v]): [string, readonly string[]][] => (Array.isArray(v) ? [[at + k, v as string[]]] : typeof v === 'object' && v !== null ? lists(v as object, at + k + '.') : []))

  it('are written in small letters, trimmed, each once, with every list filled', () => {
    const all = lists(ENGLISH)
    expect(all.length).toBeGreaterThan(30)
    for (const [name, list] of all) {
      expect(list.length, name).toBeGreaterThan(0)
      expect(new Set(list).size, name).toBe(list.length)
      for (const w of list) expect(w === w.trim() && w === w.toLowerCase() && w === w.normalize('NFC') && w.length > 0, name + ': ' + w).toBe(true)
    }
  })

  it('have a place for what is filled into each line the reader writes', () => {
    expect(ENGLISH.writes.page).toContain('{n}')
    expect(ENGLISH.writes.partOf).toContain('{path}')
    for (const line of [ENGLISH.writes.card, ENGLISH.writes.cards]) { expect(line).toContain('{n}'); expect(line).toContain('{list}') }
    expect(/[\p{L}\p{N}]/u.test(ENGLISH.writes.cardsName)).toBe(true)
  })

  it('cannot be changed by a program that reads with them', () => {
    expect(Object.isFrozen(ENGLISH)).toBe(true)
    expect(Object.isFrozen(ENGLISH.kinds)).toBe(true)
    expect(Object.isFrozen(ENGLISH.kinds.doing)).toBe(true)
    expect(Object.isFrozen(ENGLISH.writes)).toBe(true)
  })
})
