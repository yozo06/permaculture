// The reader's English: the words it knows an English text by, and what its notes say in English.
//
// Every word here came from a paste somebody might really make. A list is words and nothing else (words.ts says how
// they are found), so another language is this file again, in that language.
import type { Note } from './read.ts'
import type { Words } from './words.ts'

/** Frozen all the way down: the words are shared by everything that reads with them. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) for (const v of Object.values(value)) frozen(v)
  return Object.freeze(value)
}

export const ENGLISH: Words = frozen({
  // The last four are German, from before the words were kept by language. They go to a German list when there is one.
  labels: ['chapter', 'unit', 'week', 'weeks', 'module', 'part', 'lesson', 'section', 'day', 'days', 'lecture', 'topic', 'phase', 'stage', 'level', 'step', 'session', 'class', 'book', 'volume', 'semester', 'sem', 'year', 'term', 'trimester', 'quarter', 'domain', 'kapitel', 'lektion', 'woche', 'teil'],
  weekdays: ['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  reading: {
    verbs: ['read', 'see', 'watch', 'do', 'practice', 'practise', 'review', 'revise', 'listen to'],
    refs: ['chapter', 'chapters', 'page', 'pages', 'section', 'sections', 'lecture', 'lectures', 'video', 'videos', 'ch.', 'p.', 'pp.'],
  },
  course: {
    labels: ['tip', 'tips', 'pro tip', 'note', 'notes', 'nb', 'n.b', 'nb.', 'n.b.', 'remember', 'reminder', 'exam details', 'duration', 'credit', 'credits', 'marks', 'l-t-p', 'instructor', 'course code', 'prerequisite', 'prerequisites', 'pre-requisite', 'pre-requisites'],
    // Words a subject may well have a part named after ("Evaluation", "References", "Assessment") are not here:
    // leaving out a part of the subject is worse than keeping a list of books.
    headings: [
      'recommended resources', 'recommended reading', 'recommended books', 'recommended textbook', 'recommended textbooks', 'recommended text book', 'recommended text books', 'suggested reading', 'suggested books', 'further reading',
      'textbook', 'textbooks', 'text book', 'text books', 'reference book', 'reference books', 'referencebook', 'referencebooks', 'bibliography', 'office hours', 'evaluation scheme', 'grading policy',
    ],
    afterColon: ['assessment', 'evaluation', 'grading', 'reference', 'references', 'resources'],
    over: ['reference', 'references', 'resources'],
    pages: ['page', 'pg', 'pg.', 'p.'],
    totals: ['total', 'subtotal'],
    roughly: ['about', 'around', 'approx'],
  },
  units: ['hr', 'hrs', 'hour', 'hours', 'credit', 'credits', 'mark', 'marks', 'period', 'periods', 'lecture', 'lectures', 'min', 'mins', 'minute', 'minutes', 'week', 'weeks', '%'],
  page: {
    see: ['see'],
    refs: ['p', 'p.', 'pp', 'pp.', 'pg', 'pg.', 'page', 'pages'],
  },
  kinds: {
    doing: [
      'how to', 'practice', 'practise', 'practicing', 'practising', 'write', 'build', 'make', 'draw', 'solve', 'implement', 'set up', 'configure', 'play', 'sing', 'cook', 'bake', 'run', 'perform', 'create', 'design', 'deploy', 'debug',
      'speak', 'pronounce', 'conjugate', 'translate', 'train', 'rehearse', 'memorise', 'memorize', 'present', 'record', 'sketch', 'paint', 'code',
    ],
    rule: ['rule', 'rules', 'law', 'laws', 'theorem', 'theorems', 'principle', 'principles', 'pattern', 'patterns', 'formula', 'equation', 'equations', 'versus', 'lemma', 'axiom', 'axioms', 'difference between', 'tradeoff', 'tradeoffs', 'trade-off', 'trade-offs'],
    ruleStarts: ['when to', 'when not to', 'why to', 'why not to'],
    versus: ['vs', 'vs.'],
    whole: ['overview', 'introduction', 'intro', 'big picture', 'recap', 'summary', 'history of', 'landscape', 'map of', 'architecture of', 'foundations of', 'fundamentals of', 'basics of', 'the whole'],
    facts: [
      'vocabulary', 'vocab', 'words', 'verbs', 'nouns', 'adjectives', 'key terms', 'terminology', 'glossary', 'dates', 'capitals', 'names of', 'symbols', 'abbreviations', 'acronyms', 'alphabet', 'definitions', 'formulas', 'formulae', 'phrases', 'idioms',
      'kanji', 'hiragana', 'katakana',
    ],
    drill: ['exercise', 'exercises', 'drill', 'drills', 'practice', 'practise', 'lab', 'project', 'workout', 'kata', 'rehearsal'],
  },
  chatter: {
    starts: ["here's", 'here is', 'here are', 'let me know', 'i hope', 'hope this helps', 'hope that helps', 'hope it helps', 'feel free', 'would you like', 'happy to', 'good luck', 'great question', "if you'd like", 'if you would like', 'do you want me'],
    openers: ['sure', 'certainly', 'of course', 'absolutely'],
    whole: ['thanks', 'thank you', 'thx', 'ty', 'cheers', 'ok', 'okay', 'hi', 'hello', 'hey', 'enjoy'],
    tails: ['for reading'],
  },
  asking: {
    leads: ['ok so', 'okay so', 'also', 'and also'],
    wants: ['i want to', 'i wanna', 'i would like to', 'i need to', "i'd like to"],
    verbs: ['learn', 'know', 'study', 'understand'],
    whole: ['teach me', 'help me with', 'help me learn'],
    more: ['more'],
    about: ['about'],
  },
  counters: ['card', 'flashcard', 'question', 'item', 'no', 'no.'],
  columns: ['word', 'words', 'term', 'terms', 'front', 'question', 'q', 'phrase', 'expression', 'vocab', 'vocabulary', 'kanji', 'meaning', 'definition', 'back', 'answer', 'a', 'translation', 'english'],
  questions: ['q', 'question'],
  answers: ['a', 'ans', 'answer'],
  ands: ['and', '&'],
  writes: { page: 'Page {n}.', partOf: 'Part of {path}.', card: '{n} card: {list}', cards: '{n} cards: {list}', cardsName: 'Cards' },
})

const counted = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many)

const SENTENCES: { readonly [C in Note['code']]: (n: Extract<Note, { code: C }>) => string } = {
  'lines-cut': (n) => 'Read the first ' + (n.kept === 1 ? 'line' : n.kept + ' lines') + ' only; the text has ' + n.of + '.',
  'long-lines-cut': (n) => 'Read only the first ' + n.kept + ' characters of ' + counted(n.count, 'very long line.', 'very long lines.'),
  'columns-left-out': () => 'Read the first two columns of each line as a card, and left the others out.',
  'code-left-out': (n) => 'Left out ' + counted(n.count, 'block of code.', 'blocks of code.'),
  'wordless-left-out': (n) => 'Left out ' + counted(n.count, 'line with no words in it.', 'lines with no words in them.'),
  'course-left-out': (n) =>
    'Left out, as not something to learn: ' + n.items.map((i) => i.text + (i.under ? ' (and the ' + counted(i.under, 'line', 'lines') + ' under it)' : '')).join(', ') + (n.more ? ', and ' + n.more + ' more' : ''),
  'title-taken': (n) => 'Read as the title of the whole list, not as a topic: ' + n.text,
  'wordless-name-left-out': () => 'Left out a line whose first part has no words in it.',
  'twice-left-out': (n) => 'Left out, because it is there twice: ' + n.text,
  'name-shortened': (n) => 'Shortened, with the whole line kept as what to read: ' + n.text,
  'summary-cut': (n) => 'Cut short, the line on what to read for: ' + n.text,
  'text-left-out': (n) => 'Left out the text under ' + counted(n.count, 'heading.', 'headings.'),
  'more-notes': (n) => 'And ' + n.count + ' more like these.',
}

/** A note in English. A note this file has no sentence for, from a reader newer than it, is said as its code. */
export const say = (note: Note): string => (Object.hasOwn(SENTENCES, note.code) ? (SENTENCES[note.code] as (n: Note) => string)(note) : note.code)
