import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { LIMITS, NOTE_CODES, read, say, type Draft, type DraftTopic, type Limits, type Note } from './index.ts'

const names = (d: Draft): string[] => d.topics.map((t) => t.name)
const topic = (d: Draft, name: string): DraftTopic => {
  const t = d.topics.find((x) => x.name === name)
  if (!t) throw new Error('no topic ' + name + ' in ' + JSON.stringify(names(d)))
  return t
}
const text = (...lines: string[]): string => lines.join('\n')
/** What a draft says it left out, in English. */
const said = (d: Draft): string[] => d.notes.map(say)

describe('a plain list', () => {
  it('makes a topic of each line', () => {
    const d = read(text('Photosynthesis', 'Cell division', '', 'Enzymes'))
    expect(names(d)).toEqual(['Photosynthesis', 'Cell division', 'Enzymes'])
    expect(d.topics.every((t) => t.kind === 'idea' && t.group === '' && t.cards.length === 0 && t.summary === '')).toBe(true)
    expect(d.title).toBe('')
    expect(d.notes).toEqual([])
  })

  it('takes the bullet or the number off the front of a line', () => {
    expect(names(read(text('1. One', '2) Two', '(3) Three', 'a) Four', '(b) Five', 'iv) Six')))).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
    expect(names(read(text('- Four', '* Five', '• Six', '- [ ] Seven', '- [x] Eight', '– Nine', '+ Ten')))).toEqual(['Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'])
  })

  it('reads bullets under a numbered line as sitting under it, indented or not', () => {
    const d = read(text('1. Basics', '- Variables', '- Loops', '2. Functions', '- Parameters'))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Basics', 'Variables'], ['Basics', 'Loops'], ['Functions', 'Parameters']])
  })

  it('keeps a number that is part of the name', () => {
    expect(names(read(text('1984 and its world', 'C. elegans', 'e. coli', '3 laws of motion')))).toEqual(['1984 and its world', 'C. elegans', 'e. coli', '3 laws of motion'])
  })

  it('splits one line of commas into topics', () => {
    expect(names(read('Photosynthesis, Respiration; Mitosis,Meiosis'))).toEqual(['Photosynthesis', 'Respiration', 'Mitosis', 'Meiosis'])
  })

  it('leaves the commas of a longer text alone', () => {
    expect(names(read(text('Integers, floats, strings', 'Lists, tuples', 'Loops')))).toEqual(['Integers, floats, strings', 'Lists, tuples', 'Loops'])
  })

  it('reads nothing from nothing', () => {
    expect(read('').topics).toEqual([])
    expect(read(' \n\t\n').topics).toEqual([])
  })

  it('takes Markdown dress off a name', () => {
    expect(names(read(text('- **Bold topic**', '- _Leaning_ topic', '- `code` topic', '- A [linked](https://example.org/a) topic')))).toEqual(['Bold topic', 'Leaning topic', 'code topic', 'A linked topic'])
  })

  it('keeps the address of a link as the line on what to read', () => {
    expect(topic(read('- A [linked](https://example.org/a) topic'), 'A linked topic').summary).toBe('https://example.org/a')
  })

  it('reads Windows line ends, and drops characters that cannot be seen', () => {
    expect(names(read('One\r\nTwo\u200B\r\n\uFEFFThree\u202E'))).toEqual(['One', 'Two', 'Three'])
  })
})

describe('a line in two parts', () => {
  it('reads a topic and a sentence about it as a topic with a line on what to read', () => {
    const d = read(text('Recursion - a function that calls itself until a base case stops it', 'Big-O: how the running time of an algorithm grows with its input', 'Hash maps – trading memory for a constant-time lookup by key'))
    expect(d.pairsAs).toBe('topics')
    expect(d.pairs).toBe(3)
    expect(names(d)).toEqual(['Recursion', 'Big-O', 'Hash maps'])
    expect(topic(d, 'Recursion').summary).toBe('a function that calls itself until a base case stops it')
    expect(topic(d, 'Recursion').cards).toEqual([])
  })

  it('reads the bold start of a line as its name', () => {
    const d = read(text('1. **Variables**: names that hold a value while the program runs', '2. **Loops** - doing one thing many times without writing it many times', '3. **Functions:** a named piece of work you can call again and again'))
    expect(names(d)).toEqual(['Variables', 'Loops', 'Functions'])
    expect(topic(d, 'Functions').summary).toBe('a named piece of work you can call again and again')
  })

  it('reads a bold word that the line simply goes on from as part of the name', () => {
    expect(names(read(text('- **Build** it step by step', '- **Installing Python** and setting up an editor', '- **Return values** vs. printing')))).toEqual(['Build it step by step', 'Installing Python and setting up an editor', 'Return values vs. printing'])
  })

  it('splits a line at the first mark in it, whichever mark that is', () => {
    const d = read(text("Ohm's law: V = IR", 'Metronome - 60 bpm -> 80 bpm', 'Momentum: mass times velocity'), { pairs: 'topics' })
    expect(names(d)).toEqual(["Ohm's law", 'Metronome', 'Momentum'])
    expect(topic(d, "Ohm's law").summary).toBe('V = IR')
  })

  it('reads short pairs as question cards, a few to a topic', () => {
    // "dog" and "sea" begin like "do" and "see", which begin a note on what to read.
    expect(read(text('Hund - dog', 'Meer - sea', 'Seite - page', 'sehen - see', 'tun - do')).pairsAs).toBe('cards')
    const d = read(text('Hund - dog', 'Katze - cat', 'Maus - mouse', 'Vogel - bird'))
    expect(d.pairsAs).toBe('cards')
    expect(d.pairs).toBe(4)
    expect(d.topics).toHaveLength(1)
    const t = d.topics[0] as DraftTopic
    expect(t.kind).toBe('facts')
    expect(t.name).toBe('Hund, Katze, Maus, Vogel')
    expect(t.cards).toEqual([{ q: 'Hund', a: 'dog' }, { q: 'Katze', a: 'cat' }, { q: 'Maus', a: 'mouse' }, { q: 'Vogel', a: 'bird' }])
    expect(t.summary).toBe('4 cards: Hund, Katze, Maus, Vogel')
  })

  it('reads them the other way when it is told to', () => {
    const cardsFirst = text('Hund - dog', 'Katze - cat', 'Maus - mouse')
    const d = read(cardsFirst, { pairs: 'topics' })
    expect(d.pairsAs).toBe('topics')
    expect(names(d)).toEqual(['Hund', 'Katze', 'Maus'])
    expect(topic(d, 'Hund').summary).toBe('dog')
    const longer = text('Recursion - a function that calls itself until a base case stops it', 'Big-O: how the running time of an algorithm grows with its input', 'Hash maps – trading memory for a constant-time lookup by key')
    const c = read(longer, { pairs: 'cards' })
    expect(c.pairsAs).toBe('cards')
    expect(c.topics).toHaveLength(1)
    expect(c.topics[0]?.cards).toHaveLength(3)
  })

  it('does not make cards of a note on what to read', () => {
    const d = read(text('Variables - read chapter 2', 'Loops - see page 40', 'Functions - watch lecture 3', 'Classes - ch. 7', 'Modules - pp. 90-95'))
    expect(d.pairsAs).toBe('topics')
    expect(topic(d, 'Loops').summary).toBe('see page 40')
  })

  it('does not split a label from what it labels', () => {
    expect(names(read(text('Chapter 3: Thermodynamics', 'Week 2 - Loops', 'Unit 4: Cells')))).toEqual(['Chapter 3: Thermodynamics', 'Week 2 - Loops', 'Unit 4: Cells'])
  })

  it('puts no more than eight cards in a topic, in even shares', () => {
    const d = read(Array.from({ length: 20 }, (_, i) => 'wort' + i + ' = word' + i).join('\n'))
    expect(d.topics.map((t) => t.cards.length)).toEqual([7, 7, 6])
    expect(d.topics.every((t) => t.cards.length <= LIMITS.cards)).toBe(true)
    expect(new Set(names(d)).size).toBe(3)
  })

  it('never reads a bold name and what follows it as a card', () => {
    const d = read(text('1. **Greetings** – Hola, buenos días', '2. **Thanks** – Gracias', '3. **Goodbyes** – Adiós, hasta luego'))
    expect(d.pairsAs).toBe('topics')
    expect(names(d)).toEqual(['Greetings', 'Thanks', 'Goodbyes'])
  })

  it('needs three pairs before it reads them as cards', () => {
    expect(read(text('Hund - dog', 'Katze - cat')).pairsAs).toBe('topics')
  })
})

describe('cards from a table or a file of cards', () => {
  it('reads a tab between two parts, as Quizlet and Anki save them', () => {
    const d = read(text('#separator:tab', '#html:false', 'la maison\tthe house', 'le chat\tthe cat\textra', 'le pain\tthe bread'))
    expect(d.pairsAs).toBe('cards')
    expect(d.topics).toHaveLength(1)
    expect(d.topics[0]?.cards).toEqual([{ q: 'la maison', a: 'the house' }, { q: 'le chat', a: 'the cat' }, { q: 'le pain', a: 'the bread' }])
    expect(said(d)).toEqual(['Read the first two columns of each line as a card, and left the others out.'])
  })

  it('leaves out the columns an Anki file says are not the card', () => {
    const d = read(text('#separator:tab', '#guid column:1', '#notetype column:2', '#deck column:3', '#tags column:6', 'Gk1\tBasic\tDeutsch::A1\tder Hund\tthe dog\tnouns', 'Gk2\tBasic\tDeutsch::A1\tdie Katze\tthe cat\t', 'Gk3\tBasic\tDeutsch::A1\tdas Brot\tthe bread\tfood'))
    expect(d.topics[0]?.cards).toEqual([{ q: 'der Hund', a: 'the dog' }, { q: 'die Katze', a: 'the cat' }, { q: 'das Brot', a: 'the bread' }])
    expect(d.notes).toEqual([])
  })

  it('reads a spreadsheet saved with commas, without its heading row', () => {
    const d = read(text('Word,Meaning,Example,Notes', 'bonjour,hello; good day,"Bonjour, madame.",greeting', 'le pain,bread,J\'achète du pain.,m', 'la boulangerie,bakery,,f', 'merci,thank you,Merci beaucoup !,'))
    expect(d.pairsAs).toBe('cards')
    expect(d.topics[0]?.cards).toEqual([{ q: 'bonjour', a: 'hello; good day' }, { q: 'le pain', a: 'bread' }, { q: 'la boulangerie', a: 'bakery' }, { q: 'merci', a: 'thank you' }])
  })

  it('does not take lines that merely have commas in them for a spreadsheet', () => {
    const d = read(text('Integers, floats, strings', 'Lists, tuples, sets', 'If, for, while'))
    expect(d.pairs).toBe(0)
    expect(names(d)).toEqual(['Integers, floats, strings', 'Lists, tuples, sets', 'If, for, while'])
  })

  it('reads a contents page with tabs as chapters, not cards, and drops the page numbers', () => {
    const d = read(text('Chapter 1\tIntroduction to Probability\t1', 'Chapter 2\tRandom Variables\t27', 'Chapter 3\tExpectation\t61'))
    expect(d.pairs).toBe(0)
    expect(names(d)).toEqual(['Chapter 1 Introduction to Probability', 'Chapter 2 Random Variables', 'Chapter 3 Expectation'])
  })

  it('makes cards of a question and its answer wherever they are, even among plain topics', () => {
    const d = read(text('## Cells', '- Membranes', '- Organelles', '- Division', '- Signalling', '## Check yourself', 'Q: What burns sugar?', 'A: Mitochondria', 'Q: What makes proteins?', 'A: Ribosomes'))
    expect(d.pairs).toBe(2)
    expect(d.pairsAs).toBe('cards')
    expect(topic(d, 'Check yourself').cards).toHaveLength(2)
    expect(names(d)).toEqual(['Membranes', 'Organelles', 'Division', 'Signalling', 'Check yourself'])
  })

  it('reads the lines under each heading their own way, so a list of words inside a syllabus is cards and the rest is topics', () => {
    const d = read(text(
      '## Grammar', '- The dative: when a verb or a preposition asks for it, and how the articles change', '- Word order: the verb comes second, and goes to the end after weil and dass',
      '## Food words', 'das Brot = bread', 'der Käse = cheese', 'die Milch = milk', 'das Wasser = water',
    ))
    expect(d.topics.map((t) => [t.group, t.name, t.cards.length])).toEqual([['Grammar', 'The dative', 0], ['Grammar', 'Word order', 0], ['', 'Food words', 4]])
    expect(d.pairs).toBe(6)
    expect(d.pairsAs).toBe('cards')
  })

  it('does not let a label over each card split the cards up', () => {
    const d = read(text('Flashcards for cell biology:', '', '**Card 1**', 'Q: What burns sugar?', 'A: Mitochondria', '', '**Card 2**', 'Q: What makes proteins?', 'A: Ribosomes', '', 'Question 3', 'Q: Where is DNA kept?', 'A: In the nucleus'))
    expect(d.title).toBe('Flashcards for cell biology')
    expect(names(d)).toEqual(['Flashcards for cell biology'])
    expect(d.topics[0]?.cards).toHaveLength(3)
  })

  it('reads a line with no second part over lines that have one as their heading, blank line or not', () => {
    const d = read(text('Русский', 'хлеб - bread', 'друг - friend', 'да - yes', 'Ελληνικά', 'ναι - yes', 'όχι - no', 'νερό - water'))
    expect(names(d)).toEqual(['Русский', 'Ελληνικά'])
    expect(topic(d, 'Ελληνικά').cards.map((c) => c.q)).toEqual(['ναι', 'όχι', 'νερό'])
  })

  it('reads a Markdown table, without its heading row', () => {
    const d = read(text('| German | English |', '|---|:---:|', '| Hund | dog |', '| Katze | cat |', '| Maus | mouse |'))
    expect(d.topics[0]?.cards).toEqual([{ q: 'Hund', a: 'dog' }, { q: 'Katze', a: 'cat' }, { q: 'Maus', a: 'mouse' }])
  })

  it('reads two quoted parts with a comma between', () => {
    const d = read(text('"Hund","dog"', '"Katze", "cat, the animal"', '"Maus";"mouse"'))
    expect(d.topics[0]?.cards).toEqual([{ q: 'Hund', a: 'dog' }, { q: 'Katze', a: 'cat, the animal' }, { q: 'Maus', a: 'mouse' }])
  })

  it('reads a question and the answer under it', () => {
    const d = read(text('Q: What is the powerhouse of the cell?', 'A: The mitochondrion', '', 'Question 2: Where is DNA kept?', 'Answer: In the nucleus', 'Q. What makes proteins?', 'A. Ribosomes'))
    expect(d.pairsAs).toBe('cards')
    expect(d.topics[0]?.cards).toEqual([
      { q: 'What is the powerhouse of the cell?', a: 'The mitochondrion' },
      { q: 'Where is DNA kept?', a: 'In the nucleus' },
      { q: 'What makes proteins?', a: 'Ribosomes' },
    ])
  })

  it('reads a question with its answer on the same line', () => {
    const d = read(text('What is the capital of France? Paris', 'What is the capital of Spain? Madrid', 'What is the capital of Italy? Rome'))
    expect(d.topics[0]?.cards[1]).toEqual({ q: 'What is the capital of Spain?', a: 'Madrid' })
  })

  it('names a set of cards after the heading they are under', () => {
    const d = read(text('Food', 'Brot - bread', 'Käse - cheese', 'Milch - milk', '', 'Animals', 'Hund - dog', 'Katze - cat', 'Maus - mouse'))
    expect(names(d)).toEqual(['Food', 'Animals'])
    expect(topic(d, 'Animals').cards.map((c) => c.q)).toEqual(['Hund', 'Katze', 'Maus'])
    expect(topic(d, 'Animals').group).toBe('')
  })

  it('numbers the sets under one heading, and groups them by it', () => {
    const d = read(text('## Verbs', ...Array.from({ length: 12 }, (_, i) => '- verb' + i + ' = to do ' + i)))
    expect(names(d)).toEqual(['Verbs (1)', 'Verbs (2)'])
    expect(d.topics.map((t) => t.cards.length)).toEqual([6, 6])
    expect(d.topics.every((t) => t.group === 'Verbs')).toBe(true)
  })

  it('makes a topic, not a card, of a pair too long for a card', () => {
    const long = 'x'.repeat(LIMITS.a + 1)
    const d = read(text('Hund = dog', 'Katze = cat', 'Maus = mouse', 'Essay = ' + long))
    expect(names(d)).toContain('Essay')
    expect(topic(d, 'Essay').cards).toEqual([])
    expect(d.topics.find((t) => t.cards.length > 0)?.cards).toHaveLength(3)
  })
})

describe('an outline', () => {
  it('reads the one heading over everything as the title, the next as groups, and the lines as topics', () => {
    const d = read(text('# Organic chemistry', '', '## Alkanes', '- Nomenclature', '- Conformations', '', '## Alkenes', '- E/Z isomerism'))
    expect(d.title).toBe('Organic chemistry')
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Alkanes', 'Nomenclature'], ['Alkanes', 'Conformations'], ['Alkenes', 'E/Z isomerism']])
  })

  it('reads indented lines as the topics, and what they sit under as their group', () => {
    const d = read(text('- Basics', '  - Variables', '  - Loops', '    - for', '    - while', '- Functions', '  - Parameters'))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Basics', 'Variables'], ['Basics', 'for'], ['Basics', 'while'], ['Functions', 'Parameters']])
    expect(topic(d, 'for').summary).toBe('Part of Loops.')
    expect(topic(d, 'Variables').summary).toBe('')
  })

  it('reads the depth of a numbered outline from its numbers', () => {
    const d = read(text('1. Introduction', '1.1 What is learning', '1.2 Kinds of learning', '2. Regression', '2.1 Linear', '2.1.1 Least squares'))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Introduction', 'What is learning'], ['Introduction', 'Kinds of learning'], ['Regression', 'Least squares']])
    expect(topic(d, 'Least squares').summary).toBe('Part of Linear.')
  })

  it('reads a line that ends in a colon, or stands over a list, as a heading', () => {
    const d = read(text('Basics:', 'Variables', 'Loops', '', 'Functions', '- Parameters', '- Recursion'))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Basics', 'Variables'], ['Basics', 'Loops'], ['Functions', 'Parameters'], ['Functions', 'Recursion']])
  })

  it('reads a bold line, a line in capitals and a labelled line over others as headings', () => {
    const d = read(text('**Basics**', 'Variables', 'ADVANCED TOPICS', 'Closures', 'Week 3: Testing', '- Unit tests'))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Basics', 'Variables'], ['ADVANCED TOPICS', 'Closures'], ['Week 3: Testing', 'Unit tests']])
  })

  it('does not take a line of short forms in capitals for a heading', () => {
    const d = read(text('UNIT III - NORMALIZATION', 'Functional dependencies', '1NF, 2NF, BCNF', 'DNA RNA', 'Decomposition'))
    expect(d.title).toBe('UNIT III - NORMALIZATION')
    expect(names(d)).toEqual(['Functional dependencies', '1NF, 2NF, BCNF', 'DNA RNA', 'Decomposition'])
  })

  it('reads a heading with nothing under it as a topic', () => {
    expect(names(read(text('Week 1: Variables', 'Week 2: Loops', 'Week 3: Functions')))).toEqual(['Week 1: Variables', 'Week 2: Loops', 'Week 3: Functions'])
    expect(names(read(text('## Variables', '## Loops')))).toEqual(['Variables', 'Loops'])
  })

  it('reads what an AI chat gives: numbered bold headings with points under them', () => {
    const d = read(text(
      "Here's a study plan for you:", '',
      '### 1. **Getting Started**', '- **Alphabet and sounds**: how each letter is said, and the sounds English does not have', '- **Greetings**: hello, goodbye, and how to say who you are', '',
      '### 2. **Everyday Life**', '- **Food and drink**: ordering in a café, and what things are called',
    ))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Getting Started', 'Alphabet and sounds'], ['Getting Started', 'Greetings'], ['Everyday Life', 'Food and drink']])
    expect(topic(d, 'Greetings').summary).toBe('hello, goodbye, and how to say who you are')
    expect(d.title).toBe('')
  })

  it('keeps the running text under a heading as the line on what to read', () => {
    const d = read(text('## Entropy', 'Entropy is a measure of how many ways a system can be arranged without anyone noticing the difference.', '', '## Enthalpy', 'The heat a system holds at constant pressure.'))
    expect(names(d)).toEqual(['Entropy', 'Enthalpy'])
    expect(topic(d, 'Entropy').summary).toBe('Entropy is a measure of how many ways a system can be arranged without anyone noticing the difference.')
    expect(topic(d, 'Enthalpy').summary).toBe('The heat a system holds at constant pressure.')
  })

  it('reads a title written with a line under it', () => {
    const d = read(text('Thermodynamics', '==============', 'First law', 'Second law'))
    expect(d.title).toBe('Thermodynamics')
    expect(names(d)).toEqual(['First law', 'Second law'])
  })

  it('skips a ruled line', () => {
    expect(names(read(text('One', '', '---', '', 'Two', '***')))).toEqual(['One', 'Two'])
  })
})

describe('what real pastes taught it', () => {
  it('reads the first line, alone over a blank line, as the title, even when it is in two parts', () => {
    const d = read(text('Driving theory - road signs and rules', '', 'Stop sign - come to a full stop', 'Yield sign - give way', 'Speed limit - the most you may do'))
    expect(d.title).toBe('Driving theory - road signs and rules')
    expect(d.topics).toHaveLength(1)
    expect(d.topics[0]?.cards.map((c) => c.q)).toEqual(['Stop sign', 'Yield sign', 'Speed limit'])
    const plain = read(text('Things to learn this summer', '', 'Pandas', 'Docker', 'Rust'))
    expect(plain.title).toBe('Things to learn this summer')
    expect(names(plain)).toEqual(['Pandas', 'Docker', 'Rust'])
  })

  it('takes the number off "1 - topic" and "1: topic" when the numbers count up', () => {
    expect(names(read(text('1 - python basics', '2 - loops', '3 - functions')))).toEqual(['python basics', 'loops', 'functions'])
    expect(names(read(text('1: python basics', '2: loops', '3: functions')))).toEqual(['python basics', 'loops', 'functions'])
    expect(names(read(text('1984 - a novel by George Orwell about a state that watches', '2001 - a film')))).toEqual(['1984', '2001'])
  })

  it('takes a roman numeral or a letter off the front when they count up', () => {
    expect(names(read(text('I. The French Revolution', 'II. Napoleon', 'III. The Congress of Vienna', 'IV. The revolutions of 1848', 'V. The Industrial Revolution', 'VI. Nationalism and the unification of Italy and Germany')))).toEqual(
      ['The French Revolution', 'Napoleon', 'The Congress of Vienna', 'The revolutions of 1848', 'The Industrial Revolution', 'Nationalism and the unification of Italy and…'])
    expect(names(read(text('A. Supply', 'B. Demand', 'C. Elasticity')))).toEqual(['Supply', 'Demand', 'Elasticity'])
    expect(names(read(text('C. elegans', 'D. melanogaster', 'E. coli')))).toEqual(['C. elegans', 'D. melanogaster', 'E. coli'])
  })

  it('takes dot leaders and page numbers off the end of a line', () => {
    const d = read(text('Seite - page', 'Loops - see page 40', 'Database system concepts ........ 3', 'Entity-Relationship model . . . . . 12', 'Relational algebra      45', 'kinematics  pg 12', 'Clean Code, pp. 1-120', 'Revision (see page 212)'), { pairs: 'topics' })
    expect(names(d)).toEqual(['Seite', 'Loops', 'Database system concepts', 'Entity-Relationship model', 'Relational algebra', 'kinematics', 'Clean Code', 'Revision'])
    expect(d.notes).toEqual([])
    expect(topic(d, 'kinematics').summary).toBe('Page 12.')
    expect(topic(d, 'Clean Code').summary).toBe('Page 1-120.')
    expect(topic(d, 'Loops').summary).toBe('see page 40')
  })

  it('leaves out lines that are about the course and not in it, and says so', () => {
    const d = read(text('UNIT I: INTRODUCTION (8 hrs)', 'Data models', 'Keys', 'Notes on normal forms', 'Total: 45 hours', 'Tip: practise every day', 'Text books:', '1. Silberschatz, Database System Concepts', '2. Elmasri, Fundamentals of Database Systems', 'Page 45'))
    expect(names(d)).toEqual(['Data models', 'Keys', 'Notes on normal forms'])
    expect(d.title).toBe('UNIT I: INTRODUCTION')
    expect(said(d)).toEqual(['Left out, as not something to learn: Total, Tip, Text books (and the 2 lines under it), Page 45'])
  })

  it('reads a day of the week before a colon as when, and what follows as the topic', () => {
    const d = read(text('Mon: scales 20 min', 'Tue: chord changes G - C - D', 'Wednesday: barre chords'))
    expect(names(d)).toEqual(['scales 20 min', 'chord changes G - C - D', 'barre chords'])
    expect(topic(d, 'barre chords').summary).toBe('Wednesday.')
  })

  it('reads a day that is one side of a card as a word to learn', () => {
    const d = read(text('sun - Sonne', 'moon - Mond', 'star - Stern', 'Sunday = Sonntag'))
    expect(d.topics[0]?.cards.map((c) => c.q)).toEqual(['sun', 'moon', 'star', 'Sunday'])
    expect(d.notes).toEqual([])
  })

  it('keeps a label and what it labels together, whatever follows', () => {
    expect(names(read(text('Week 4 Neural networks: representation', 'Domain 1: Cloud concepts', 'Semester 2 - Algorithms')))).toEqual(['Week 4 Neural networks: representation', 'Domain 1: Cloud concepts', 'Semester 2 - Algorithms'])
  })

  it('reads a heading with no space after its hashes, and skips a line of tags', () => {
    const d = read(text('##Kubernetes notes', '###Pods', '###Deployments', '#todo #k8s'))
    expect(d.title).toBe('Kubernetes notes')
    expect(names(d)).toEqual(['Pods', 'Deployments'])
  })

  it('skips code, and says so', () => {
    const d = read(text('## ConfigMaps', '```yaml', 'apiVersion: v1', 'kind: ConfigMap', '```', '## Secrets', '````', 'x = 1', '```'))
    expect(names(d)).toEqual(['ConfigMaps', 'Secrets'])
    expect(said(d)).toEqual(['Left out 2 blocks of code.'])
  })

  it('reads rows of tildes as lines ruled across the page, and keeps what is between them', () => {
    expect(names(read(text('A', '~~~', 'B', '~~~', 'C')))).toEqual(['A', 'B', 'C'])
    expect(names(read(text('A', '', '~~~~', 'B', '', '~~~~', 'C')))).toEqual(['A', 'B', 'C'])
    expect(read(text('A', '~~~', 'B', '~~~', 'C')).notes).toEqual([])
  })

  it('reads a quoted block as the lines in it', () => {
    expect(names(read(text('> [!note] Git commands', '> - git rebase', '> - git stash', '>> - git bisect')))).toEqual(['git rebase', 'git stash', 'git bisect'])
  })

  it('splits a line of four or more short things into topics, but not what is in brackets', () => {
    const d = read(text('UNIT II', 'Entropy, Carnot cycle, Clausius inequality, free energy, Maxwell relations', 'open chords (C, G, D, Em, Am)', 'Lists, tuples'))
    expect(names(d)).toEqual(['Entropy', 'Carnot cycle', 'Clausius inequality', 'free energy', 'Maxwell relations', 'open chords (C, G, D, Em, Am)', 'Lists, tuples'])
  })

  it('splits one spoken line at its ands, and drops the asking', () => {
    expect(names(read('algebra and geometry and trigonometry and probability'))).toEqual(['algebra', 'geometry', 'trigonometry', 'probability'])
    expect(names(read('i want to learn about the french revolution and the industrial revolution and how the printing press changed europe'))).toEqual(['the french revolution', 'the industrial revolution', 'how the printing press changed europe'])
    expect(names(read('Romeo and Juliet'))).toEqual(['Romeo and Juliet'])
  })

  it('drops the chat around a list', () => {
    expect(names(read(text('ok so i want to learn guitar 🎸', 'chords', 'strumming', 'thanks!', 'Hope this helps!')))).toEqual(['guitar', 'chords', 'strumming'])
  })

  it('keeps an address out of a name', () => {
    const d = read(text('Squat form', 'https://www.youtube.com/watch?v=abc123 bar path video', 'https://example.org/deadlift'))
    expect(names(d)).toEqual(['Squat form', 'bar path video'])
    expect(topic(d, 'bar path video').summary).toBe('https://www.youtube.com/watch?v=abc123 https://example.org/deadlift')
  })

  it('takes pictures off the ends of a name, a full stop off its end, and hours off a heading', () => {
    const d = read(text('## 🐍 Week 1: Getting started (6 hours)', '- Learn one-point perspective.', '- Budgeting 💰', '- The U.S.A.'))
    expect(d.title).toBe('Week 1: Getting started')
    expect(names(d)).toEqual(['Learn one-point perspective', 'Budgeting', 'The U.S.A.'])
  })

  it('starts a new group at a plain line with indented lines under it', () => {
    const d = read(text('Books:', '  Clean Code', 'Courses', '\tPandas', '\tDocker'))
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Books', 'Clean Code'], ['Courses', 'Pandas'], ['Courses', 'Docker']])
  })
})

describe('what a second look found', () => {
  it('reads a fence with no end to it as text, not as code to the end of the paste', () => {
    expect(names(read(text('Topics', '```', 'Algebra', 'Geometry', 'Calculus')))).toEqual(['Topics', 'Algebra', 'Geometry', 'Calculus'])
    const d = read(text('Study notes', '~~~~~~~~~~~', 'Algebra', 'Geometry', 'Calculus', 'Statistics'))
    expect(names(d)).toEqual(['Algebra', 'Geometry', 'Calculus', 'Statistics'])
    expect(d.notes).toEqual([])
    expect(names(read(text('~~~ Week 1 ~~~', 'Algebra', 'Geometry')))).toEqual(['Algebra', 'Geometry'])
  })

  it('keeps a number that begins a heading and is part of it', () => {
    const d = read(text('# 1984 and Brave New World', '## 10 tips for focus', '- Sleep', '## 2. Themes', '- Power', '## 2.1 Language', '- Newspeak'))
    expect(d.title).toBe('1984 and Brave New World')
    expect(d.topics.map((t) => t.group)).toEqual(['10 tips for focus', 'Themes', 'Language'])
  })

  it('takes a first line over a blank line for the title only when it does not look like the lines under it', () => {
    const plain = read(text('Algebra', '', 'Geometry', 'Trigonometry', 'Calculus', 'Statistics'))
    expect(plain.title).toBe('')
    expect(names(plain)).toEqual(['Algebra', 'Geometry', 'Trigonometry', 'Calculus', 'Statistics'])
    expect(names(read(text('Algebra', '', 'Geometry', '', 'Trigonometry', '', 'Calculus')))).toEqual(['Algebra', 'Geometry', 'Trigonometry', 'Calculus'])
    const listed = read(text('Maths', '', '- Geometry', '- Trigonometry', '- Calculus'))
    expect(listed.title).toBe('Maths')
    expect(said(listed)).toEqual(['Read as the title of the whole list, not as a topic: Maths'])
  })

  it('keeps a part of the subject that happens to share a name with the business of a course', () => {
    const d = read(text('# Machine learning', '## Training', '- Gradient descent', '## Evaluation', '- Precision and recall', '- ROC curves', '## References', '- Reference counting'))
    expect(names(d)).toEqual(['Gradient descent', 'Precision and recall', 'ROC curves', 'Reference counting'])
    expect(d.notes).toEqual([])
    const words = read(text('remember - recordar', 'note - nota', 'duration - duración', 'credit - crédito', 'instructor - instructor'))
    expect(words.topics[0]?.cards.map((c) => c.q)).toEqual(['remember', 'note', 'duration', 'credit', 'instructor'])
    expect(names(read(text('Loops', 'Note: bring a calculator', 'Duration: 6 weeks', 'Credits: 4')))).toEqual(['Loops'])
  })

  it('reads a list of questions as topics, not as text under the first of them', () => {
    const d = read(text('Interview prep:', 'Tell me about yourself', 'Why do you want this job?', 'What is your greatest weakness?', 'Where do you see yourself in 5 years?'))
    expect(names(d)).toEqual(['Tell me about yourself', 'Why do you want this job?', 'What is your greatest weakness?', 'Where do you see yourself in 5 years?'])
  })

  it('keeps an answer that is a picture or a sign', () => {
    const d = read(text('dog - 🐶', 'cat - 🐱', 'copyright - ©', 'registered - ®'))
    expect(d.topics[0]?.cards).toEqual([{ q: 'dog', a: '🐶' }, { q: 'cat', a: '🐱' }, { q: 'copyright', a: '©' }, { q: 'registered', a: '®' }])
    expect(names(read('Excel®'))).toEqual(['Excel®'])
  })

  it('leaves out a line with no letter or number in it, and says how many', () => {
    const d = read(text('Intro', '...', '???', '->', '--', '😀', 'Python'))
    expect(names(d)).toEqual(['Intro', 'Python'])
    expect(said(d)).toEqual(['Left out 5 lines with no words in them.'])
    expect(read('.'.repeat(100)).topics).toEqual([])
  })

  it('reads a space that does not break and a wide colon as the plain ones', () => {
    const d = read(text('Hund\u00A0-\u00A0dog', 'Katze\uFF1A cat', 'Maus\u3000=\u3000mouse'))
    expect(d.topics[0]?.cards).toEqual([{ q: 'Hund', a: 'dog' }, { q: 'Katze', a: 'cat' }, { q: 'Maus', a: 'mouse' }])
  })

  it('never hands back a name with a space at its end, or no name at all', () => {
    expect(names(read('Photosynthesis .'))).toEqual(['Photosynthesis'])
    expect(names(read('a;.;J:[;d'))).toEqual(['a', 'J:[', 'd'])
  })

  it('keeps the name of the hundredth set of cards under one heading within what a name may hold', () => {
    const d = read(text('# ' + 'Z'.repeat(50), ...Array.from({ length: 900 }, (_, i) => 'w' + i + ' = z' + i)))
    expect(d.topics.length).toBeGreaterThan(100)
    expect(Math.max(...d.topics.map((t) => t.name.length))).toBeLessThanOrEqual(LIMITS.name)
    expect(new Set(names(d)).size).toBe(d.topics.length)
  })

  it('says so when a card is there twice', () => {
    const d = read(text('Hund - dog', 'hund - dog', 'Katze - cat', 'Maus - mouse'))
    expect(d.topics[0]?.cards).toHaveLength(3)
    expect(said(d)).toEqual(['Left out, because it is there twice: hund'])
  })

  it('reads a link whose address or name has brackets of its own', () => {
    const d = read(text('# Computing', '- [Recursion](https://en.wikipedia.org/wiki/Recursion_(computer_science))', '- [Sorting [stable]](http://x.y/z)'))
    expect(names(d)).toEqual(['Recursion', 'Sorting [stable]'])
    expect(topic(d, 'Recursion').summary).toBe('https://en.wikipedia.org/wiki/Recursion_(computer_science)')
  })

  it('leaves out the marks and the books when they are set off by a colon, and keeps a part of the subject of the same name', () => {
    const d = read(text('# Syllabus', 'Unit 1: Limits', 'Unit 2: Derivatives', 'Assessment: 40 marks', 'Evaluation: internal 40, external 60', 'References: Spivak', 'Resources: Khan Academy'))
    expect(names(d)).toEqual(['Unit 1: Limits', 'Unit 2: Derivatives'])
    expect(said(d)).toEqual(['Left out, as not something to learn: Assessment, Evaluation, References, Resources'])
    const books = read(text('Limits', 'Derivatives', 'References:', '1. Spivak, Calculus', '2. Stewart, Calculus'))
    expect(names(books)).toEqual(['Limits', 'Derivatives'])
  })

  it('puts a title over the weeks and chapters under it', () => {
    const d = read(text('Introductory Calculus Course', '', 'Week 1: Limits', '- Epsilon delta', 'Week 2: Derivatives', '- Chain rule'))
    expect(d.title).toBe('Introductory Calculus Course')
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['Week 1: Limits', 'Epsilon delta'], ['Week 2: Derivatives', 'Chain rule']])
    const chapters = read(text('Introductory Calculus Course', '', 'Chapter 1 Limits', 'Chapter 2 Derivatives', 'Chapter 3 Integrals'))
    expect(chapters.title).toBe('Introductory Calculus Course')
    expect(names(chapters)).toEqual(['Chapter 1 Limits', 'Chapter 2 Derivatives', 'Chapter 3 Integrals'])
  })

  it('reads a table whose first column is a label as a contents page, like the same rows with tabs', () => {
    const d = read(text('| Chapter 1 | Soil | 3 |', '| Chapter 2 | Water | 9 |', '| Chapter 3 | Light | 15 |'))
    expect(d.pairs).toBe(0)
    expect(names(d)).toEqual(['Chapter 1 Soil', 'Chapter 2 Water', 'Chapter 3 Light'])
  })

  it('takes no more than twenty times as long over pictures, dots or brackets that go nowhere as over plain letters', () => {
    // Against a plain line of the same length, not the clock: a slow machine slows both. Before these shapes were
    // mended the first four took 30 to 110 times as long as the plain line; they take up to 10 now.
    const took = (line: string): number => Math.min(...[0, 1, 2].map(() => {
      const started = performance.now()
      read(Array.from({ length: 1000 }, () => line).join('\n'))
      return performance.now() - started
    }))
    const plain = took('x'.repeat(400))
    for (const line of ['a' + '☀'.repeat(398) + 'x', 'a ' + '🐶 '.repeat(130) + 'x', 'x' + '. '.repeat(199), '.'.repeat(400), '('.repeat(399) + 'x', '['.repeat(399) + 'x', '|'.repeat(400)]) {
      expect(took(line) / plain, line.slice(0, 8)).toBeLessThan(20)
    }
  })

  it('never puts a heading under a line that is not one', () => {
    const d = read(text('| 2 + 2 = ? | 4 |', '| 3 + 3 = ? | 6 |', '| 5 + 5 = ? | 10 |', '## Algebra', '- Linear equations', '- Quadratics'))
    expect(d.topics.map((t) => [t.group, t.name, t.cards.length])).toEqual([['', '2 + 2 = ?, 3 + 3 = ?, 5 + 5 = ?', 3], ['Algebra', 'Linear equations', 0], ['Algebra', 'Quadratics', 0]])
    const loose = read(text('Warm-up', 'Stretching', '### Week 1', '- Scales'))
    expect(loose.topics.map((t) => [t.group, t.name])).toEqual([['', 'Warm-up'], ['', 'Stretching'], ['Week 1', 'Scales']])
  })

  it('starts counting again under each heading', () => {
    const d = read(text('## One', 'A. Supply', 'B. Demand', '## Two', 'A. Costs', 'B. Prices'))
    expect(names(d)).toEqual(['Supply', 'Demand', 'Costs', 'Prices'])
  })

  it('reads only so far along a line, and says so, so that no line can hold the page up', () => {
    const long = 'x'.repeat(LIMITS.line + 50)
    const d = read(text('Short', long))
    expect(said(d)).toContain('Read only the first ' + LIMITS.line + ' characters of 1 very long line.')
    for (const hostile of ['[a](b'.repeat(4000), '['.repeat(40000), '('.repeat(40000), '<a'.repeat(20000), '*_'.repeat(20000), 'a ? '.repeat(10000), '. '.repeat(20000) + '1', 'a' + ' '.repeat(40000) + '1', '"a",'.repeat(10000), '**a** '.repeat(8000)]) {
      const started = Date.now()
      read(hostile)
      read(Array.from({ length: 300 }, () => hostile.slice(0, 1000)).join('\n'))
      expect(Date.now() - started, hostile.slice(0, 12)).toBeLessThan(1500)
    }
  })

  it('takes out every character the farm would refuse', () => {
    const d = read('So\u00ADft hy\u0085phen\u2061 and\u061C more')
    expect(names(d)).toEqual(['Soft hyphen and more'])
  })
})

describe('what kind of thing a topic is', () => {
  const kindOf = (name: string): string => topic(read(name), name).kind
  it('reads a skill from the doing in its name', () => {
    for (const n of ['Practise the serve', 'How to tie a bowline', 'Write a cover letter', 'Scales exercises', 'Build a to-do app']) expect(kindOf(n), n).toBe('skill')
  })
  it('reads a rule or a pattern', () => {
    for (const n of ["Newton's second law", 'The observer pattern', 'Stack vs heap', 'Pythagorean theorem', 'When to use a mutex']) expect(kindOf(n), n).toBe('rule')
  })
  it('reads the big picture', () => {
    for (const n of ['Overview of the cell', 'Introduction to probability', 'History of Rome', 'The big picture']) expect(kindOf(n), n).toBe('whole')
  })
  it('reads facts to remember', () => {
    for (const n of ['Kitchen vocabulary', 'Key dates', 'Glossary', 'Irregular verbs list', 'Capitals of Europe']) expect(kindOf(n), n).toBe('facts')
  })
  it('reads anything else as an idea to understand', () => {
    for (const n of ['Photosynthesis', 'Der Dativ', 'ಊಟ', 'Entropy', 'Train/test splits', 'Setting up VS Code']) expect(kindOf(n), n).toBe('idea')
  })
})

describe('what it tells the reader', () => {
  it('shortens a name that is too long, keeps the whole line, and says so', () => {
    const line = 'The causes and the long consequences of the French Revolution for the rest of Europe'
    const d = read(line)
    const t = d.topics[0] as DraftTopic
    expect(t.name.length).toBeLessThanOrEqual(LIMITS.name)
    expect(t.name.endsWith('…')).toBe(true)
    expect(t.name.startsWith('The causes and the long consequences')).toBe(true)
    expect(t.summary).toBe(line)
    expect(said(d).some((n) => n.startsWith('Shortened'))).toBe(true)
  })

  it('leaves out a line that repeats another, and says so', () => {
    const d = read(text('Loops', 'Recursion', 'loops', 'LOOPS '))
    expect(names(d)).toEqual(['Loops', 'Recursion'])
    expect(said(d)).toEqual(['Left out, because it is there twice: loops'])
  })

  it('says how many headings had text under them that it did not keep', () => {
    const d = read(text('# Plan', 'This plan is for the spring term and assumes four hours a week of study at home.', '## Part one', '- Topic one'))
    expect(said(d)).toContain('Left out the text under 1 heading.')
  })

  it('does not list more notes than a person would read', () => {
    const d = read(Array.from({ length: 60 }, (_, i) => i + ' is a very long line that goes on and on past what a name can hold').join('\n'))
    expect(d.topics).toHaveLength(60)
    expect(d.notes.length).toBeLessThanOrEqual(13)
    expect(said(d)[d.notes.length - 1]).toMatch(/^And \d+ more/)
  })
})

describe('whatever it is given', () => {
  const sane = (d: Draft, lim: Limits = LIMITS): void => {
    const seen = new Set<string>()
    for (const t of d.topics) {
      expect(t.name.length).toBeGreaterThanOrEqual(1)
      expect(t.name.length).toBeLessThanOrEqual(lim.name)
      expect(t.name).toBe(t.name.trim())
      expect(/[\p{L}\p{N}]/u.test(t.name) || /^https?:/.test(t.name)).toBe(true)
      expect(t.summary.length).toBeLessThanOrEqual(lim.summary)
      expect(t.group.length).toBeLessThanOrEqual(lim.group)
      expect(t.cards.length).toBeLessThanOrEqual(lim.cards)
      for (const c of t.cards) {
        expect(c.q.length).toBeGreaterThanOrEqual(1)
        expect(c.q.length).toBeLessThanOrEqual(lim.q)
        expect(c.a.length).toBeGreaterThanOrEqual(1)
        expect(c.a.length).toBeLessThanOrEqual(lim.a)
      }
      expect(['facts', 'skill', 'idea', 'rule', 'whole']).toContain(t.kind)
      // eslint-disable-next-line no-control-regex
      expect(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/.test(t.name + t.summary + t.group + t.cards.map((c) => c.q + c.a).join(''))).toBe(false)
      const key = t.name.toLowerCase()
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(d.title.length).toBeLessThanOrEqual(lim.title)
    expect(d.pairs).toBeGreaterThanOrEqual(0)
  }
  const piece = fc.constantFrom('#', '##', '-', '*', '1.', '1.1', ' ', '  ', '\t', '\n', '\n\n', ' - ', ': ', ' = ', '|', '**', 'Q:', 'A:', '?', ',', '"', 'Week 1', '===', '---', '[x]', '(', ')', '\u202E', '\u0000', 'ಊಟ', 'long '.repeat(30))
  const junk = fc.array(fc.oneof(piece, fc.string({ maxLength: 12 }), fc.constantFrom('alpha', 'beta', 'gamma', 'delta')), { maxLength: 60 }).map((a) => a.join(''))

  it('never throws, and never hands back more than the game can hold', () => {
    fc.assert(fc.property(junk, fc.constantFrom(undefined, 'cards' as const, 'topics' as const), (s, pairs) => {
      sane(read(s, pairs ? { pairs } : {}))
    }), { numRuns: 400 })
  })

  it('keeps to whatever limits it is given, whatever it is given to read', () => {
    const limits = fc.record({ title: fc.integer({ min: 12, max: 80 }), name: fc.integer({ min: 12, max: 80 }), summary: fc.integer({ min: 12, max: 400 }), group: fc.integer({ min: 12, max: 80 }), q: fc.integer({ min: 1, max: 200 }), a: fc.integer({ min: 1, max: 200 }), cards: fc.integer({ min: 1, max: 12 }), lines: fc.integer({ min: 1, max: 60 }), line: fc.integer({ min: 20, max: 500 }), notes: fc.integer({ min: 0, max: 14 }) })
    fc.assert(fc.property(junk, limits, fc.constantFrom(undefined, 'cards' as const, 'topics' as const), (s, lim, pairs) => {
      const d = read(s, { limits: lim, ...(pairs ? { pairs } : {}) })
      sane(d, lim)
      expect(d.topics.length).toBeLessThanOrEqual(lim.lines * 40)
      expect(d.notes.length).toBeLessThanOrEqual(lim.notes + 1)
    }), { numRuns: 400 })
  })

  it('reads the same text the same way twice', () => {
    fc.assert(fc.property(junk, (s) => { expect(read(s)).toEqual(read(s)) }), { numRuns: 100 })
  })

  it('reads a very long text without reading for ever', () => {
    const d = read(Array.from({ length: 30000 }, (_, i) => 'topic ' + i).join('\n'))
    expect(d.topics.length).toBeLessThanOrEqual(LIMITS.lines)
    expect(said(d).some((n) => n.includes('lines'))).toBe(true)
  })
})

describe('the limits it is given', () => {
  const words = text('## Animals', ...Array.from({ length: 12 }, (_, i) => 'Tier' + i + ' = animal' + i))

  it('cuts a name, a group, a title and a line on what to read to them', () => {
    const paste = text('# A course with a long name that goes on', '## The first part, which has a long name too', '- A topic with a rather long name of its own: and a long line about what there is to read in it')
    const d = read(paste, { limits: { title: 16, group: 14, name: 20, summary: 30 } })
    expect(d.title).toBe('A course with…')
    expect(d.topics.map((t) => [t.group, t.name])).toEqual([['The first…', 'A topic with a…']])
    expect(d.topics[0]?.summary.length).toBeLessThanOrEqual(30)
    expect(read(paste).title).toBe('A course with a long name that goes on')
  })

  it('puts as many cards in a topic as it is told to', () => {
    expect(read(words).topics.map((t) => t.cards.length)).toEqual([6, 6])
    expect(read(words, { limits: { cards: 3 } }).topics.map((t) => t.cards.length)).toEqual([3, 3, 3, 3])
    expect(read(words, { limits: { cards: 12 } }).topics.map((t) => t.cards.length)).toEqual([12])
  })

  it('makes a card only of what fits one', () => {
    const d = read(text('Hund = dog', 'Katze = cat', 'Maus = mouse', 'Vogel = bird', 'Reh = deer'), { limits: { q: 4 } })
    expect(d.topics.map((t) => [t.name, t.cards.map((c) => c.q)])).toEqual([['Hund, Maus, Reh', ['Hund', 'Maus', 'Reh']], ['Katze', []], ['Vogel', []]])
  })

  it('reads as many lines, and as far along each, as it is told to', () => {
    const d = read(text('One', 'Two', 'Three', 'Four'), { limits: { lines: 2 } })
    expect(names(d)).toEqual(['One', 'Two'])
    const far = read('abcdefghij '.repeat(10), { limits: { line: 22, name: 40 } })
    expect(names(far)).toEqual(['abcdefghij abcdefghij'])
  })

  it('hands back as many notes as it is told to, and counts the rest', () => {
    const twice = text(...['a', 'b', 'c', 'd', 'e'].flatMap((x) => ['Topic ' + x, 'topic ' + x]))
    expect(read(twice).notes).toHaveLength(5)
    const d = read(twice, { limits: { notes: 2 } })
    expect(d.notes).toHaveLength(3)
    expect(d.notes[2]).toEqual({ code: 'more-notes', count: 3 })
  })

  it('keeps its own where it is given none, or something that is not a number', () => {
    const odd = { name: Number.NaN, cards: 'three', lines: null, line: undefined, title: Number.POSITIVE_INFINITY } as unknown as Partial<Limits>
    expect(read(words, { limits: odd })).toEqual(read(words))
    expect(read(words, { limits: {} })).toEqual(read(words))
    expect(read(words, { limits: null as unknown as Partial<Limits> })).toEqual(read(words))
  })

  it('brings a limit that is too small or too large to the nearest it can work with', () => {
    const long = 'A topic whose name is certainly longer than twelve characters'
    expect(read(long, { limits: { name: 0 } }).topics[0]?.name).toBe(read(long, { limits: { name: 12 } }).topics[0]?.name)
    expect(read(long, { limits: { name: -5 } }).topics[0]?.name.length).toBeLessThanOrEqual(12)
    expect(read(words, { limits: { cards: 0 } }).topics.map((t) => t.cards.length)).toEqual(Array.from({ length: 12 }, () => 1))
    expect(read(words, { limits: { cards: 2.9 } }).topics.map((t) => t.cards.length)).toEqual([2, 2, 2, 2, 2, 2])
    expect(read(text('One', 'Two'), { limits: { lines: 0 } }).topics).toHaveLength(1)
    expect(read('x'.repeat(5000), { limits: { line: 1e9, name: 1e9 } }).topics[0]?.name).toBe('x'.repeat(400))
  })

  it('does not change the limits it was handed, nor its own', () => {
    const mine = { name: 5, cards: 2.5 }
    const before = { ...LIMITS }
    read(words, { limits: mine })
    expect(mine).toEqual({ name: 5, cards: 2.5 })
    expect(LIMITS).toEqual(before)
    expect(Object.isFrozen(LIMITS)).toBe(true)
  })
})

describe('what it left out, as codes', () => {
  it('says each thing as a code and what it counted, with no sentence in it', () => {
    expect(read(text('One', 'Two', 'Three'), { limits: { lines: 2 } }).notes).toEqual([{ code: 'lines-cut', kept: 2, of: 3 }])
    expect(read(text('Short', 'word '.repeat(90))).notes).toContainEqual({ code: 'long-lines-cut', count: 1, kept: 400 })
    expect(read(text('la maison\tthe house\tf', 'le chat\tthe cat\tm', 'le pain\tthe bread\tm')).notes).toEqual([{ code: 'columns-left-out' }])
    expect(read(text('## ConfigMaps', '```yaml', 'kind: ConfigMap', '```', '## Secrets')).notes).toEqual([{ code: 'code-left-out', count: 1 }])
    expect(read(text('Intro', '...', '???', 'Python')).notes).toEqual([{ code: 'wordless-left-out', count: 2 }])
    expect(read(text('Maths', '', '- Geometry', '- Trigonometry', '- Calculus')).notes).toEqual([{ code: 'title-taken', text: 'Maths' }])
    expect(read(text('Loops', 'Recursion', 'loops')).notes).toEqual([{ code: 'twice-left-out', text: 'loops' }])
    expect(read(text('# Plan', 'This plan is for the spring term and assumes four hours a week of study at home.', '## Part one', '- Topic one')).notes).toContainEqual({ code: 'text-left-out', count: 1 })
    expect(read(text('🐶 - the animal that barks at night and keeps the whole street awake', 'Cats')).notes).toEqual([{ code: 'wordless-name-left-out' }])
  })

  it('says what of the course it left out, and how much stood under each', () => {
    const d = read(text('# Syllabus', 'Unit 1: Limits', 'Unit 2: Derivatives', 'Assessment: 40 marks', 'Text books:', '- Spivak', '- Apostol'))
    expect(d.notes).toEqual([{ code: 'course-left-out', items: [{ text: 'Assessment', under: 0 }, { text: 'Text books', under: 2 }], more: 0 }])
    const many = read(text('Algebra', ...Array.from({ length: 9 }, (_, i) => 'Note: bring thing ' + i)))
    const note = many.notes.find((n) => n.code === 'course-left-out')
    expect(note && note.code === 'course-left-out' ? [note.items.length, note.more] : null).toEqual([6, 3])
  })

  it('names the topic whose name it shortened, and the one whose line on what to read it cut', () => {
    const line = 'The causes and the long consequences of the revolution of 1848 across the whole of central Europe'
    const d = read(text(line, 'Short'))
    expect(d.notes).toEqual([{ code: 'name-shortened', text: d.topics[0]?.name }])
    const cut = read(text('Topic: ' + 'a long line about it '.repeat(18)))
    expect(cut.notes).toContainEqual({ code: 'summary-cut', text: 'Topic' })
  })

  it('counts the notes it does not hand back in one more', () => {
    const d = read(text(...['a', 'b', 'c', 'd', 'e'].flatMap((x) => ['Topic ' + x, 'topic ' + x])), { limits: { notes: 2 } })
    expect(d.notes.map((n) => n.code)).toEqual(['twice-left-out', 'twice-left-out', 'more-notes'])
  })

  it('makes no two notes alike', () => {
    const d = read(text('a\tb\tc', 'd\te\tf', 'g\th\ti', 'Loops', 'loops', 'LOOPS'))
    expect(d.notes).toEqual([{ code: 'columns-left-out' }, { code: 'twice-left-out', text: 'loops' }])
  })
})

describe('the notes in English', () => {
  const each: [Note, string][] = [
    [{ code: 'lines-cut', kept: 2000, of: 2400 }, 'Read the first 2000 lines only; the text has 2400.'],
    [{ code: 'lines-cut', kept: 1, of: 3 }, 'Read the first line only; the text has 3.'],
    [{ code: 'long-lines-cut', count: 1, kept: 400 }, 'Read only the first 400 characters of 1 very long line.'],
    [{ code: 'long-lines-cut', count: 3, kept: 400 }, 'Read only the first 400 characters of 3 very long lines.'],
    [{ code: 'columns-left-out' }, 'Read the first two columns of each line as a card, and left the others out.'],
    [{ code: 'code-left-out', count: 1 }, 'Left out 1 block of code.'],
    [{ code: 'code-left-out', count: 2 }, 'Left out 2 blocks of code.'],
    [{ code: 'wordless-left-out', count: 1 }, 'Left out 1 line with no words in it.'],
    [{ code: 'wordless-left-out', count: 5 }, 'Left out 5 lines with no words in them.'],
    [{ code: 'course-left-out', items: [{ text: 'Total', under: 0 }, { text: 'Text books', under: 2 }, { text: 'Tip', under: 1 }], more: 0 }, 'Left out, as not something to learn: Total, Text books (and the 2 lines under it), Tip (and the 1 line under it)'],
    [{ code: 'course-left-out', items: [{ text: 'Note', under: 0 }], more: 3 }, 'Left out, as not something to learn: Note, and 3 more'],
    [{ code: 'title-taken', text: 'Maths' }, 'Read as the title of the whole list, not as a topic: Maths'],
    [{ code: 'wordless-name-left-out' }, 'Left out a line whose first part has no words in it.'],
    [{ code: 'twice-left-out', text: 'loops' }, 'Left out, because it is there twice: loops'],
    [{ code: 'name-shortened', text: 'A long…' }, 'Shortened, with the whole line kept as what to read: A long…'],
    [{ code: 'summary-cut', text: 'Topic' }, 'Cut short, the line on what to read for: Topic'],
    [{ code: 'text-left-out', count: 1 }, 'Left out the text under 1 heading.'],
    [{ code: 'text-left-out', count: 4 }, 'Left out the text under 4 headings.'],
    [{ code: 'more-notes', count: 7 }, 'And 7 more like these.'],
  ]

  it('has a sentence for every code, in the singular and in the plural', () => {
    for (const [note, sentence] of each) expect(say(note), note.code).toBe(sentence)
  })

  it('has a sentence for every note the reader can make', () => {
    const tried = new Set(each.map(([n]) => n.code))
    expect([...tried].sort()).toEqual([...NOTE_CODES].sort())
  })

  it('says the code itself of a note it has no sentence for', () => {
    expect(say({ code: 'something-new' } as unknown as Note)).toBe('something-new')
    expect(say({ code: 'toString' } as unknown as Note)).toBe('toString')
  })
})
