// The words of one language that the reader knows a text by, and how they are made into what it looks for.
//
// The reader's rules are about shapes: a bullet, a heading, a line in two parts. A few of them need words as well:
// "Week 3" is a label and "Total: 45 hours" is not something to learn. Those words are kept apart from the rules, as
// plain lists, so that a language can be added by writing its lists and nothing else. english.ts is the one there is.
//
// In a list, a word is written as it is found, in small letters. Capitals in the text are found too, a space stands
// for any run of spaces, and either kind of apostrophe stands for both. Nothing in a word is a pattern: "c++" is the
// three characters.

export interface Words {
  /** "Chapter 3", "Week 2", "Unit IV": with a number after it, a label, which belongs with what follows it. */
  labels: readonly string[]
  /** "Mon: scales" is scales, on Monday. */
  weekdays: readonly string[]
  /** How the second part of a line shows itself to be a note on what to read or do, and not something to be asked. */
  reading: {
    /** It begins with one of these and goes on: "read chapter 4". */
    verbs: readonly string[]
    /** It begins with one of these and a number: "pages 12-40". */
    refs: readonly string[]
  }
  /** Lines that are about the course and not in it. */
  course: {
    /** Before a colon: "Note: bring a calculator". After a dash it is a word to learn: "note - nota". */
    labels: readonly string[]
    /** Before a colon, or as a line of its own: "Recommended reading". Not words a subject may well have a part named after. */
    headings: readonly string[]
    /** Only when set off by a colon ("Assessment: 40 marks"): as a heading, any of these may be a part of the subject. */
    afterColon: readonly string[]
    /** A line that ends in a colon and stands over a list: "References:". */
    over: readonly string[]
    /** With a number, and nothing else on the line: "Page 45". */
    pages: readonly string[]
    /** "Total: 45 hours", "Subtotal 12". */
    totals: readonly string[]
    /** What stands before a number that is not exact: "Total: about 40". */
    roughly: readonly string[]
  }
  /** What is counted in brackets at the end of a heading: "(8 hrs)", "[3 credits]". */
  units: readonly string[]
  /** A page said at the end of a line: "Keys, see page 212", "Keys (pp. 12-14)". */
  page: {
    see: readonly string[]
    refs: readonly string[]
  }
  /** The kind of thing a name is, from the words in it, asked in this order. A name with none of them is an idea. */
  kinds: {
    /** At the start of a name, something to do: "Practise the serve". */
    doing: readonly string[]
    /** Anywhere in a name, a rule: "Ohm's law". */
    rule: readonly string[]
    /** At the start of a name, a rule: "When to use a mutex". */
    ruleStarts: readonly string[]
    /** Between two things, and only in the letters written here: "Stack vs heap" is a rule, "VS Code" is not. */
    versus: readonly string[]
    /** Anywhere in a name, the whole of something: "Overview of the cell". */
    whole: readonly string[]
    /** Anywhere in a name, things to know by heart: "Irregular verbs". */
    facts: readonly string[]
    /** Anywhere in a name, something to do, when none of the above is there: "Lab 3". */
    drill: readonly string[]
  }
  /** What is said before and after a list: by an AI chat that was asked for one, or by the person typing it. */
  chatter: {
    /** A line that begins with one of these: "Here is your plan". */
    starts: readonly string[]
    /** A line that begins with one of these and a comma, a stop or a space: "Sure, ...". */
    openers: readonly string[]
    /** A line that is one of these and nothing more: "Thanks!". */
    whole: readonly string[]
    /** What may follow one of those: "Thanks for reading". */
    tails: readonly string[]
  }
  /** "ok so i want to learn about ...": the asking, which is not part of what is asked for. */
  asking: {
    /** "ok so", "also". */
    leads: readonly string[]
    /** "i want to", and after it one of `verbs`. */
    wants: readonly string[]
    verbs: readonly string[]
    /** The whole of an asking: "teach me". */
    whole: readonly string[]
    /** "more", and "about", which may follow. */
    more: readonly string[]
    about: readonly string[]
  }
  /** "Card 3", "Question 4": a counter over a card, which names nothing. */
  counters: readonly string[]
  /** The first row of a table of cards, when it names the columns: "Word", "Meaning". */
  columns: readonly string[]
  /** "Q: ..." on one line and "A: ..." on the next. */
  questions: readonly string[]
  answers: readonly string[]
  /** "algebra and geometry and trigonometry". */
  ands: readonly string[]
  /** The few words the reader writes into a draft itself. What stands in curly brackets is filled in. */
  writes: {
    /** A page taken off the end of a line, for the line on what to read: "Page {n}." */
    page: string
    /** The headings a topic stood under, below its group: "Part of {path}." */
    partOf: string
    /** The line on what a set of cards holds, for one card and for more: "{n} cards: {list}". */
    card: string
    cards: string
    /** The name of a set of cards whose questions are all signs and that stands under no heading. */
    cardsName: string
  }
}

/** What the reader looks for, made from a language's words. */
export interface Patterns {
  label: RegExp
  weekday: RegExp
  note: RegExp
  courseLabel: RegExp
  courseHeading: RegExp
  courseColon: RegExp
  courseOver: RegExp
  coursePage: RegExp
  total: RegExp
  rough: RegExp
  totalLine: RegExp
  hours: RegExp
  /** Finds the page said at the end of a line. Its first group is the number. */
  pageRef: RegExp
  doing: RegExp
  rule: RegExp
  versus: RegExp
  whole: RegExp
  facts: RegExp
  drill: RegExp
  chatter: RegExp
  /** Finds the asking at the start of a line, to be taken off it. */
  asking: RegExp
  counter: RegExp
  column: RegExp
  /** Their first group is what was asked, and what was answered. */
  question: RegExp
  answer: RegExp
  /** What parts the things in a list said on one line. */
  ands: RegExp
  writes: Words['writes']
}

/**
 * What a word is joined by, in any script: a letter, a mark written on one, a digit, or the underscore of a name out
 * of a program. A sign that only counts, such as a circled number, joins nothing.
 */
const JOINS = '\\p{L}\\p{M}\\p{Nd}_'
/** After a word: nothing follows that it could be joined to. */
const BOUND = '(?![' + JOINS + '])'
/** Before a word: the start of the text, or something it could not be joined to. */
const EDGE = '(?:^|[^' + JOINS + '])'

/** The words in a list. Whatever else it holds, and whatever is no list at all, counts for nothing. */
const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : [])
/** A part of the words, or nothing if it is not there. */
const part = (words: unknown, name: string): Record<string, unknown> => {
  const v: unknown = typeof words === 'object' && words !== null ? (words as Record<string, unknown>)[name] : undefined
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/** A word to be found as it is written. */
const literal = (word: string): string =>
  word.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+').replace(/['’]/g, "['’]")

/** Any one of the words in a list, the longest tried first. A list with nothing in it finds nothing. */
function any(list: unknown): string {
  const words = [...new Set(strings(list).map((w) => w.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  return words.length ? '(?:' + words.map(literal).join('|') + ')' : '(?!)'
}

const made = new WeakMap<Words, Patterns>()

/**
 * What the reader looks for in a text, for one language's words. It is made once for each `Words` and kept, so a
 * `Words` that has been read with is not to be changed afterwards: make another. A list that is missing or is no
 * list finds nothing, and a line the reader writes that is missing is not written. It throws only for words that
 * cannot be looked for at all, such as a single word of tens of thousands of characters; the reader then reads by
 * English.
 */
export function compile(words: Words): Patterns {
  const kept = made.get(words)
  if (kept) return kept
  const all = words as unknown as Record<string, unknown>
  const reading = part(words, 'reading'), course = part(words, 'course'), page = part(words, 'page'), kinds = part(words, 'kinds')
  const chatter = part(words, 'chatter'), asking = part(words, 'asking'), writes = part(words, 'writes')
  const re = (source: string, flags = 'iu'): RegExp => new RegExp(source, flags)
  const whole = (list: unknown): RegExp => re('^' + any(list) + '$')
  const within = (list: unknown): string => EDGE + any(list) + BOUND
  const written = (name: string): string => (typeof writes[name] === 'string' ? (writes[name] as string) : '')
  const totals = any(course.totals)
  const patterns: Patterns = {
    label: re('^' + any(all.labels) + '\\s+(?:\\d+(?:\\s*[-–]\\s*\\d+)?|[ivxlc]+|[a-z])' + BOUND),
    weekday: whole(all.weekdays),
    note: re('^(?:' + any(reading.verbs) + '\\s+\\S|' + any(reading.refs) + '\\s*\\d)|https?://'),
    courseLabel: whole(course.labels),
    courseHeading: whole(course.headings),
    courseColon: whole(course.afterColon),
    courseOver: whole(course.over),
    coursePage: re('^' + any(course.pages) + '\\s*\\d+$'),
    total: re('^' + totals + BOUND),
    rough: re('^(?:\\d|~|≈|' + any(course.roughly) + BOUND + ')'),
    totalLine: re('^' + totals + BOUND + '.*\\d'),
    hours: re('\\s*[[(]\\s*\\d+(?:\\.\\d+)?\\s*' + any(all.units) + '\\s*[\\])]\\s*$'),
    pageRef: re('[\\s,(]+(?:' + any(page.see) + '\\s+)?' + any(page.refs) + '\\s*(\\d+(?:\\s*[-–]\\s*\\d+)?)\\)?\\s*$'),
    doing: re('^' + any(kinds.doing) + '(?=\\s|$)'),
    rule: re(within(kinds.rule) + '|^' + any(kinds.ruleStarts) + BOUND),
    versus: re('\\s' + any(kinds.versus) + '\\s', 'u'),
    whole: re(within(kinds.whole)),
    facts: re(within(kinds.facts)),
    // "3 x 10": so many of so many is a drill in any language.
    drill: re(within(kinds.drill) + '|\\b\\d+\\s*x\\s*\\d+'),
    chatter: re('^(?:' + any(chatter.starts) + BOUND + '|' + any(chatter.openers) + '[,!. ]|' + any(chatter.whole) + BOUND + '[\\s!.,:)]*(?:' + any(chatter.tails) + BOUND + '.*)?$)'),
    asking: re('^(?:' + any(asking.leads) + '\\s+)?(?:(?:' + any(asking.wants) + '\\s+' + any(asking.verbs) + '|' + any(asking.whole) + ')(?:\\s+' + any(asking.more) + ')?(?:\\s+' + any(asking.about) + ')?\\s+)?'),
    counter: re('^' + any(all.counters) + '\\s*#?\\d+\\s*[:.)]?$'),
    column: whole(all.columns),
    question: re('^' + any(all.questions) + '\\s*\\d*\\s*[:.)]\\s*(.+)$'),
    answer: re('^' + any(all.answers) + '\\s*\\d*\\s*[:.)]\\s*(.+)$'),
    ands: re('\\s*[,;]\\s*|\\s+' + any(all.ands) + '\\s+'),
    writes: { page: written('page'), partOf: written('partOf'), card: written('card'), cards: written('cards'), cardsName: written('cardsName') },
  }
  // Each is tried once, on plain and on other letters, so that words too many or too long to look for fail here,
  // where the reader can fall back on its own, and not in the middle of a text.
  for (const pattern of Object.values(patterns)) if (pattern instanceof RegExp) { pattern.test('a'); pattern.test('\u0101') }
  if (typeof words === 'object' && words !== null) made.set(words, patterns)
  return patterns
}

/** A line the reader writes, with what stands in curly brackets filled in. */
export const fill = (line: string, values: Readonly<Record<string, string | number>>): string =>
  line.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole))
