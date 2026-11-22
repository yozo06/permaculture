// The reader: whatever a learner already has (a list of topics, a syllabus, a contents page, notes with headings, a
// word list, a file of flashcards, what an AI chat wrote for them) read into topics the game can grow.
//
// It works out four things, by rule and never by chance:
// - the topics: the lines that have nothing under them. What stands over them becomes their group, and one heading over
//   everything becomes the title;
// - the line on what to read: the second part of "Recursion - a function that calls itself", or the text under a heading;
// - question cards: short pairs ("Hund - dog"), a table, or a question with its answer. Cards are kept a few to a topic,
//   the way a field of the game keeps them, so sixty words are eight topics and not sixty;
// - the kind of thing a topic is, from the words in its name.
//
// Pure: text in, a draft out. It never throws, it says what it leaves out and which names it shortens (`notes`), and
// it reads only so far along a line and so many lines, so that no paste can hold the page up. The rules here are
// about shapes; the words a rule needs are a language's own (words.ts), and English is the one there is (english.ts).
// Every rule came from a paste somebody might really make; read.test.ts has one of each.
import { ENGLISH } from './english.ts'
import { compile, fill, type Patterns, type Words } from './words.ts'

/** What kind of thing a topic is. The game draws it, asks about it and harvests it by this. */
export type Kind = 'facts' | 'skill' | 'idea' | 'rule' | 'whole'

/** A question card: something to be asked, and what goes with it. */
export interface Card {
  q: string
  a: string
  /** Wrong answers that came with it, three at most. A card with none is given them from the other cards by whoever asks it. */
  wrong?: string[]
}

export interface DraftTopic {
  name: string
  /** What to read or do, or what the topic holds. May be empty. */
  summary: string
  kind: Kind
  /** The heading it stood under, or '' for none. */
  group: string
  cards: Card[]
}

export interface Draft {
  /** The one heading that stood over everything, or ''. */
  title: string
  topics: DraftTopic[]
  /** What was shortened or left out, each as a code and what it counted or the name concerned. */
  notes: Note[]
  /** How many lines came in two parts. Where there are some, they can be read two ways. */
  pairs: number
  /** How they were read, or how most of them were: as question cards, or each as a topic with a line on what to read. */
  pairsAs: 'cards' | 'topics'
}

/** The most each piece of a draft may hold, and how much of a text is read. */
export interface Limits {
  title: number
  name: number
  /** The line on what to read. */
  summary: number
  group: number
  /** A card's question, and its answer. A pair with a longer side is not made into a card. */
  q: number
  a: number
  /** Cards put in one topic. */
  cards: number
  /** Lines read, and characters read of each. */
  lines: number
  line: number
  /** Notes handed back. The rest are counted in one more. */
  notes: number
}

/** Everything the reader can say it shortened or left out, and what each note carries besides its code. */
interface Notes {
  /** The text had `of` lines, and only the first `kept` were read. */
  'lines-cut': { kept: number; of: number }
  /** `count` lines were longer than `kept` characters, and were read only that far. */
  'long-lines-cut': { count: number; kept: number }
  /** Lines had more than two columns. The first two made a card. */
  'columns-left-out': object
  /** `count` blocks of code. */
  'code-left-out': { count: number }
  /** `count` lines with no letter or number in them. */
  'wordless-left-out': { count: number }
  /** Lines about the course and not in it, each with how many lines stood under it. `more` of them are not listed. */
  'course-left-out': { items: { text: string; under: number }[]; more: number }
  /** A plain first line was read as the title of the whole, so it is not a topic. */
  'title-taken': { text: string }
  /** A line in two parts whose first part has no letter or number in it. */
  'wordless-name-left-out': object
  /** A topic or a card that was there before under the same name. */
  'twice-left-out': { text: string }
  /** A name too long to keep: `text` is what it was cut to, and the whole line is in the line on what to read. */
  'name-shortened': { text: string }
  /** The line on what to read for the topic `text` was too long to keep whole. */
  'summary-cut': { text: string }
  /** `count` headings had running text under them, which is not kept. */
  'text-left-out': { count: number }
  /** `count` answers to choose from stood under questions with no line to say which is right. */
  'options-left-out': { count: number }
  /** `count` notes more than were asked for. */
  'more-notes': { count: number }
}

/** One thing the reader shortened or left out. It carries no sentence: `say` has the English, and a program may have its own. */
export type Note = { [C in keyof Notes]: { code: C } & Notes[C] }[keyof Notes]

const CODES: { readonly [C in Note['code']]: true } = {
  'lines-cut': true, 'long-lines-cut': true, 'columns-left-out': true, 'code-left-out': true, 'wordless-left-out': true, 'course-left-out': true, 'title-taken': true,
  'wordless-name-left-out': true, 'twice-left-out': true, 'name-shortened': true, 'summary-cut': true, 'text-left-out': true, 'options-left-out': true, 'more-notes': true,
}
/** Every code a note can have. */
export const NOTE_CODES: readonly Note['code'][] = Object.freeze(Object.keys(CODES) as Note['code'][])

export interface ReadOptions {
  /** Read lines in two parts this way, whatever they look like. */
  pairs?: 'cards' | 'topics'
  /** Limits to keep to in place of the reader's own. One left out, or not a number, is the reader's own. */
  limits?: Partial<Limits>
  /** The words of the language the text is in, in place of English. */
  words?: Words
}

/** The limits kept to when none are given. */
export const LIMITS: Readonly<Limits> = Object.freeze({ title: 60, name: 48, summary: 300, group: 60, q: 160, a: 120, cards: 8, lines: 2000, line: 400, notes: 12 })

/**
 * The least and the most each limit can be set to. A name needs room for an ellipsis and a number after it. No more
 * of a line is read than the reader's own limit: its rules were timed on lines up to that length, and a few of them
 * slow down on longer ones. The time a text takes grows in step with `lines`; read.test.ts times the shapes that
 * once did not.
 */
export const BOUNDS: Readonly<Record<keyof Limits, readonly [number, number]>> = {
  title: [12, 400], name: [12, 400], summary: [12, 10000], group: [12, 400], q: [1, 400], a: [1, 400], cards: [1, 1000], lines: [1, 20000], line: [20, 400], notes: [0, 1000],
}

/** The limits to read by: each one given, as a whole number within its bounds, and the reader's own for the rest. */
function limitsOf(given: unknown): Limits {
  const out: Limits = { ...LIMITS }
  if (typeof given !== 'object' || given === null) return out
  for (const key of Object.keys(BOUNDS) as (keyof Limits)[]) {
    const v: unknown = (given as Record<string, unknown>)[key]
    const [least, most] = BOUNDS[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(most, Math.max(least, Math.floor(v)))
  }
  return out
}

interface Pair {
  left: string
  right: string
  /** Written in a way only cards are: a tab, a table, a question and its answer. */
  strong: boolean
  /** Joined by an equals sign or an arrow: more likely a card than a dash or a colon is. */
  eq?: boolean
  /** The first part was set in bold: the name of a topic, and what follows is about it. */
  named?: boolean
  /** Parted by a colon, the way a label is from what it labels ("Note: bring a calculator"). */
  colon?: boolean
  /** Wrong answers that stood after the right one, between upright bars. */
  wrong?: string[]
  /** The whole of what stood after the mark, wrong answers and all, for when the line is read as a topic. */
  full?: string
}

interface Tok {
  indent: number
  /** The line began with a bullet or a number. */
  bulleted: boolean
  marker: 'num' | 'dash' | ''
  /** Depth said by the number itself: 0 for "2.", 1 for "2.1". */
  num: number
  text: string
  /** The whole line, for when its two parts turn out to be one heading. */
  whole: string
  pair: Pair | null
  /** Markdown heading depth from 0, or -1. */
  hash: number
  soft: boolean
  /** A heading by inference alone: a plain line that stands over a list. */
  guessed: boolean
  colon: boolean
  bold: boolean
  table: boolean
  /** A question waiting for its answer. */
  asks: boolean
  /** About the course, not in it: a total, a tip, a list of books. */
  admin: boolean
  blankBefore: boolean
  /** Running text that stood under the line. */
  body: string[]
  /** A page number or a day taken off the line. */
  aside: string[]
  links: string[]
  /** The note on it said it is something to do: "Practise: ...". */
  doing: boolean
  /** Said to be one topic ("Topic: ..."), so never the title of the whole. */
  topic: boolean
  level: number
}

interface Node { tok: Tok; children: Node[] }

/* ---------- text ---------- */

/**
 * Characters nobody can see, and the ones that turn the direction of the text round, as the inside of a character
 * class. The reader takes them out, and the farm refuses text that has them (with tabs and line ends besides). The
 * joiners that Indic scripts and emoji are written with are not among them. Written as escapes, in a string, so that
 * nobody has to trust what they cannot see in this file.
 */
export const HIDDEN = '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u00AD\\u061C\\u200B\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF'
const UNSEEN = new RegExp('[' + HIDDEN + ']', 'g')
/** Spaces of other widths, and the wide colon and equals sign: read as the plain ones. */
const SPACES = new RegExp('[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]', 'g')
const WIDE_COLON = new RegExp('\\uFF1A', 'g')
const WIDE_EQUALS = new RegExp('\\uFF1D', 'g')
/** Pictures at the ends of a line: an emoji is dress, not part of a name. The marks of ownership are not pictures. */
const PICTURE = '(?![\\u00A9\\u00AE\\u2122])[\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\uFE0F\\u200D\\s]'
const PICTURES_FIRST = new RegExp('^(?:' + PICTURE + ')+', 'u')
const ONE_PICTURE = new RegExp('^' + PICTURE + '$', 'u')
/** A line without the pictures at its ends. The end is walked back one character at a time, so a long run costs no more than its length. */
function unpictured(s: string): string {
  const out = s.replace(PICTURES_FIRST, '')
  let end = out.length
  while (end > 0) {
    const low = out.charCodeAt(end - 1)
    const size = low >= 0xdc00 && low <= 0xdfff && end > 1 ? 2 : 1
    if (!ONE_PICTURE.test(out.slice(end - size, end))) break
    end -= size
  }
  return out.slice(0, end)
}
/** Every way a text file ends a line. */
const LINE_END = new RegExp('\\r\\n?|[\\u2028\\u2029]', 'g')
/** Text as the reader reads it: lines ended one way, plain spaces, colons and equals signs, and nothing that cannot be seen. */
const normal = (s: string): string => s.normalize('NFC').replace(LINE_END, '\n').replace(SPACES, ' ').replace(WIDE_COLON, ': ').replace(WIDE_EQUALS, ' = ').replace(UNSEEN, '')
/** The first `max` characters of a line, and never half of one that takes two. */
function cut(s: string, max: number): string {
  const last = s.charCodeAt(max - 1)
  return s.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max)
}
/** What a thing gives, or `otherwise` if asking for it throws. */
function attempt<T>(ask: () => T, otherwise: T): T {
  try { return ask() } catch { return otherwise }
}

const words = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Cut to `max` characters at a word, with an ellipsis, never through the middle of a character. */
function fit(s: string, max: number): string {
  if (s.length <= max) return s
  let cut = s.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  if (space > max / 2) cut = cut.slice(0, space)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut.replace(/[\s,;:.\-–—(]+$/, '') + '…'
}

/** A line without its Markdown dress, its pictures and its addresses. The addresses are handed back beside it. */
function undress(raw: string): { text: string; links: string[] } {
  const links: string[] = []
  // A link's name may have brackets in it, and its address one pair of them, as an encyclopedia's addresses do.
  let s = raw.replace(/!?\[((?:[^\][]|\[[^\][]*\])*)\]\(\s*((?:[^()\s]|\([^()\s]*\))+)(?:\s[^)]*)?\)/g, (_, label: string, url: string) => {
    if (/^https?:\/\//i.test(url)) links.push(url)
    return label
  })
  s = s.replace(/https?:\/\/\S+/gi, (url) => { links.push(url.replace(/[).,;!?]+$/, '')); return ' ' })
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  s = s.replace(/\*\*|__|`/g, '')
  s = s.replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=$|[\s).,;:!?])/g, '$1$2')
  s = unpictured(s.replace(/\s+/g, ' ').trim())
  // An address taken out of a line can leave the mark that led up to it hanging.
  if (links.length) s = s.replace(/\s*[-–—:]$/, '')
  return { text: s, links }
}
const plain = (raw: string): string => undress(raw).text

/** A line without what is in its brackets: the commas left are the ones that separate. A bracket that never closes is left as it is. */
function outside(s: string): string {
  let out = ''
  const closes: Record<string, string> = { '(': ')', '[': ']' }
  const none = new Set<string>()
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? ''
    const close = closes[ch]
    const end = close && !none.has(ch) ? s.indexOf(close, i + 1) : -1
    if (close && end < 0) none.add(ch)
    if (end >= 0) i = end
    else out += ch
  }
  return out
}

/* ---------- a line in two parts ---------- */




const MARKS = [' = ', ' → ', ' -> ', ' => ', ' :: ', ' - ', ' – ', ' — ', ': '] as const

function splitPair(s: string, p: Patterns): Pair | null {
  // A side that is nothing but a picture or a sign ("dog - 🐶") is kept as it is; an address is not a side.
  const side = (raw: string): string => plain(raw) || (/https?:\/\//i.test(raw) ? '' : raw.trim())
  // After an equals sign or a question, "Robusta | Arabica | Liberica" is the answer and the wrong answers to show
  // beside it. Only a card is written so, however few of them there are.
  // A bar counts with a space on either side ("|x|" and "a || b" are answers), and two wrong answers at the least:
  // one bar is as likely "meaning | how it is said".
  const make = (left: string, right: string, more: Partial<Pair> = {}, barred = false): Pair | null => {
    let parts = barred ? right.split(/\s\|\s/) : [right]
    // After a question, a chat may part four answers with slashes or semicolons where it was asked for bars.
    if (barred && more.strong && parts.length === 1) {
      const other = [right.split(/\s\/\s/), right.split(/\s*;\s+/)].find((x) => x.length === 4)
      if (other) parts = other
    }
    const [first = '', ...others] = parts.length >= 3 ? parts : [right]
    const l = side(left), r = side(first)
    if (!l || !r || p.label.test(l)) return null
    const wrong: string[] = []
    for (const w of others.map(side)) if (w && w.toLowerCase() !== r.toLowerCase() && !wrong.some((x) => x.toLowerCase() === w.toLowerCase())) wrong.push(w)
    return { left: l, right: r, strong: false, ...more, ...(wrong.length ? { wrong, strong: true, full: side(right) } : {}) }
  }
  // A question set in bold, and its answer after it.
  const boldly = /^(\*\*|__)(.+?[?？])\1\s*(?:=>|->|::|=|→|:|[-–—])?\s*(\S.*)$/.exec(s)
  if (boldly) return make(boldly[2] ?? '', boldly[3] ?? '', { strong: true }, true)
  // A bold start is the name, when a mark sets it apart from the rest. Without one the line simply goes on.
  const inside = /^(\*\*|__)(.+?):\1\s*(\S.*)$/.exec(s)
  if (inside) return make(inside[2] ?? '', inside[3] ?? '', { named: true, colon: true })
  const bold = /^(\*\*|__)(.+?)\1\s*(:|[-–—=]|->|→)\s*(\S.*)$/.exec(s)
  if (bold) return make(bold[2] ?? '', bold[4] ?? '', { named: true, ...(bold[3] === ':' ? { colon: true } : {}) })
  if (/^(\*\*|__)/.test(s)) return null
  // A question, and its answer after it on the same line.
  // A question may end in a quotation of one: 'How do you ask "Where is it?" = ...'.
  const marked = /^(.{3,}\?["'”’»)\]]?)\s*(?:=>|->|::|=|→|:)\s+(\S.*)$/.exec(s)
  if (marked) return make(marked[1] ?? '', marked[2] ?? '', { strong: true }, true)
  const asked = /^(.{3,}?\?)\s+(\S.*)$/.exec(s)
  if (asked && !/\?\s*$/.test(s)) return make(asked[1] ?? '', (asked[2] ?? '').replace(/^[-–—:]\s+/, ''), { strong: true }, true)
  // The first mark in the line is the one that parts it.
  let at = -1
  let mark = ''
  for (const m of MARKS) {
    const i = s.indexOf(m)
    if (i > 0 && (at < 0 || i < at)) { at = i; mark = m }
  }
  if (at < 0) return null
  const left = s.slice(0, at), right = s.slice(at + mark.length)
  const eq = MARKS.indexOf(mark as (typeof MARKS)[number]) < 5
  // A line that ends by asking is a question with an equals sign in it ("What does E = mc^2 mean?"), not two parts.
  if (eq && /[?？]\s*$/.test(s)) return null
  // A long run of words before the mark is a sentence with a colon in it, not a name. Unless answers with bars
  // between them follow it: then it is a long question.
  if (words(left) > 8 && !(eq && right.split(' | ').length >= 3)) return null
  return make(left, right, eq ? { eq: true } : mark === ': ' ? { colon: true } : {}, eq)
}

/**
 * A line without the page number at its end, when dots lead up to it ("Keys ........ 12") or it is set far to the
 * right ("Keys      12"). The end is looked at once, so a line of dots that leads nowhere costs nothing.
 */
function unpaged(s: string): string {
  const page = /(\d+(?:\s*[-–]\s*\d+)?)\s*$/.exec(s)
  if (!page) return s
  const before = s.slice(0, page.index)
  let end = before.length
  let dots = 0
  while (end > 0 && (before[end - 1] === '.' || before[end - 1] === ' ')) { if (before[end - 1] === '.') dots++; end-- }
  if (dots >= 3) return before.slice(0, end)
  return /\s{3}$/.test(before) && /^\d{1,4}$/.test(page[1] ?? '') ? before.trimEnd() : s
}

/** Short enough to be asked as a card. */
const fitsCard = (pair: Pair, lim: Limits): boolean => pair.left.length <= lim.q && pair.right.length <= lim.a
/** Looks like something to be asked, and not like a topic with a sentence about it. */
const cardLike = (pair: Pair, p: Patterns): boolean =>
  pair.strong || (!pair.named && pair.left.length <= 60 && !p.note.test(pair.right) && (pair.eq ? pair.right.length <= 80 : pair.right.length <= 40 && words(pair.right) <= 6))

/* ---------- lines that are about the course, not in it ---------- */

const isAdmin = (text: string, pair: Pair | null, colon: boolean, p: Patterns): boolean => {
  // "Note: bring a calculator" is about the course. "note - nota" is a word to learn: a label is set off by a colon.
  if (pair) return (pair.colon === true && (p.courseLabel.test(pair.left) || p.courseHeading.test(pair.left) || p.courseColon.test(pair.left))) || (p.total.test(pair.left) && p.rough.test(pair.right))
  return p.courseHeading.test(text) || (colon && p.courseOver.test(text)) || p.coursePage.test(text) || p.totalLine.test(text)
}

/** A heading without the "(8 hrs)", "[3 credits]" or "(24%)" at its end. */
const headingText = (n: Node, p: Patterns): string => n.tok.text.replace(p.hours, '') || n.tok.text

/* ---------- the kind of thing ---------- */

/** The kind of thing a name is. Where the name does not say, the line on what to read may: "practise ..." is something to do. */
function kindOf(name: string, about: string, p: Patterns): Kind {
  if (p.doing.test(name)) return 'skill'
  if (p.rule.test(name) || p.versus.test(name)) return 'rule'
  if (p.whole.test(name)) return 'whole'
  if (p.facts.test(name)) return 'facts'
  return p.drill.test(name) || p.doing.test(about) ? 'skill' : 'idea'
}

/* ---------- lines ---------- */

/** Running text, not the name of a topic. A question is something to learn the answer to, however long it is. */
const prose = (s: string): boolean =>
  /[?？]["')\]]?$/.test(s) ? s.length > 200 : s.length > 90 || (words(s) >= 6 && (/[.!]["')\]]?$/.test(s) || /[.!?]\s+\S/.test(s)))
/** Has a letter or a number in it: something that could be a name. */
const worded = (s: string): boolean => /[\p{L}\p{N}]/u.test(s)

const CAPS = /^[^\p{Ll}]*\p{Lu}[^\p{Ll}]*$/u
/** A line in capitals that reads as a heading: it has a whole word in it, and is not a list of short forms. */
const isCaps = (s: string): boolean => CAPS.test(s) && /\p{Lu}{4,}/u.test(s) && !/[,;]/.test(s)

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 }
function roman(s: string): number {
  const up = s.toUpperCase()
  let n = 0
  for (let i = 0; i < up.length; i++) {
    const v = ROMAN[up[i] ?? ''] ?? 0, next = ROMAN[up[i + 1] ?? ''] ?? 0
    n += v < next ? -v : v
  }
  return n
}

/** One spoken line ("algebra and geometry and trigonometry") or one line of commas is a list of topics. */
function oneLine(lines: string[], p: Patterns): string[] {
  const full = lines.filter((l) => l.trim() !== '')
  if (full.length < 1 || full.length > 2) return lines
  const parts = (l: string): string[] => l.trim().replace(p.asking, '').split(p.ands).map((x) => x.trim()).filter(Boolean)
  const listed = (l: string): boolean => {
    const ps = parts(l)
    return ps.length >= 3 && !/\t|\||\s[-–—=]\s|:\s|\?|^\s*[#>]|[([]/.test(l) && ps.every((x) => x.length <= 60)
  }
  return full.every(listed) ? full.flatMap(parts) : lines
}

/** The cells of one line of a spreadsheet saved as text, or null if it is not one. */
function cells(line: string, sep: string): string[] | null {
  const out: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = '' }
    else if (ch === sep) {
      // In a file a program wrote, nothing follows a comma but the next cell. In a sentence, a space does.
      if (line[i + 1] === ' ') return null
      out.push(cell)
      cell = ''
    } else cell += ch
  }
  return quoted ? null : [...out, cell]
}

/** A spreadsheet saved with commas or semicolons becomes lines with tabs, which is how cards are read. */
function sheet(lines: string[]): string[] {
  const full = lines.filter((l) => l.trim() !== '')
  if (full.length < 3) return lines
  for (const sep of [',', ';']) {
    const rows = full.map((l) => cells(l.trim(), sep))
    const width = rows[0]?.length ?? 0
    if (width >= 2 && rows.every((r) => r !== null && r.length === width)) return rows.map((r) => (r ?? []).map((c) => c.replace(/\t/g, ' ').trim()).join('\t'))
  }
  return lines
}

/**
 * The lines that are code: from a line that begins with three backticks to the next line that is nothing but
 * backticks. A fence with nothing to close it is no fence, so one stray mark cannot swallow the rest of a paste; only
 * that line is dropped. Rows of tildes are not fences here: in plain notes they rule a line across the page far more
 * often than they hold code, and leaving out part of a subject is worse than reading a little code as topics.
 */
function fenced(lines: string[]): { code: Set<number>; blocks: number } {
  const code = new Set<number>()
  let blocks = 0
  const ends: number[] = []
  lines.forEach((l, i) => { if (/^\s*`{3,}\s*$/.test(l)) ends.push(i) })
  let e = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? ''
    if (!/^\s*```/.test(l)) continue
    while (e < ends.length && (ends[e] ?? 0) <= i) e++
    const end = ends[e]
    if (end === undefined) { code.add(i); continue }
    for (let j = i; j <= end; j++) code.add(j)
    blocks++
    i = end
  }
  return { code, blocks }
}

function tokens(input: string[], p: Patterns, note: (n: Note, key?: string) => void): Tok[] {
  const lines = sheet(oneLine(input, p))
  const out: Tok[] = []
  let blank = true
  let asked: Tok | null = null
  let { code, blocks: codeBlocks } = fenced(lines)
  /** A question or a name, a mark, and answers with bars between them: a line of a quiz. */
  const quizLine = (l: string): boolean => {
    const bar = l.indexOf(' | ')
    return bar > 0 && l.indexOf(' | ', bar + 3) > 0 && !/^\s*\|/.test(l) && /[=?？:→]|->/.test(l.slice(0, bar))
  }
  /** A line without the marks and numbers a chat may set before "Topic:" or "Read:". */
  const bare = (l: string): string => l.replace(/[*_`#>]/g, '').replace(/^[^\p{L}]+/u, '').replace(/\)\s*$/, '')
  const labelish = (l: string): boolean => l.includes(':') || /\s[-–—]\s/.test(l)
  /** The text is a quiz, and it is a list said in words ("Topic: ..."): what a chat writes when asked for either. */
  const quizzed = lines.some(quizLine)
  const topics = lines.filter((l) => labelish(l) && p.topic.test(bare(l))).length
  const outlined = topics >= 2 || (topics === 1 && (quizzed || lines.some((l) => labelish(l) && p.noteLine.test(bare(l)))))
  // A list handed over in a block of code, as a chat does so that it copies cleanly, is the list and not code: when
  // far more stands inside the blocks than outside them, and what stands inside is such a list, only the rows of
  // backticks are left out.
  // A list may also come in a block marked as plain text, when hardly any line in it is code. A block not marked at all
  // may be any program, so it is a list only when its lines say so.
  const beside = lines.filter((l, i) => !code.has(i) && l.trim() !== '').length
  const listInCode = lines.some((l, i) => code.has(i) && (quizLine(l) || (labelish(l) && p.topic.test(bare(l)))))
  const marks = lines.filter((l, i) => code.has(i) && /^\s*```/.test(l)).map((l) => l.replace(/^\s*`+/, '').trim())
  const inside = lines.filter((l, i) => code.has(i) && !/^\s*```/.test(l) && l.trim() !== '')
  const codey = (l: string): boolean => /[;{}]\s*$|=>|[\w.]\(.*\)\s*$|^\s*(?:def|function|import|from|const|let|var|class|return|public|private|#include)\b/.test(l)
  const plainInCode = marks.some((m) => m !== '') && marks.every((m) => m === '' || p.plainCode.test(m)) && inside.filter(codey).length * 4 < inside.length
  /** When the list came in blocks, a whole sentence outside them is the chat talking: "I kept it short, as you asked." */
  const talk = new Set<number>()
  if (codeBlocks > 0 && (listInCode || plainInCode) && code.size - 2 * codeBlocks > 3 * beside) {
    lines.forEach((l, i) => { if (!code.has(i) && /\p{L}.*[.!?:]\s*$/u.test(l) && !quizLine(l)) talk.add(i) })
    code = new Set([...code].filter((i) => /^\s*```/.test(lines[i] ?? '')))
    codeBlocks = 0
  }
  /** The heading last read, which a "Read: ..." line is about, and whether it was said in words ("Topic: ..."). */
  let head: Tok | null = null
  let headSaid = false
  /** A question whose options are being read, and the card last made of a question and its answer on lines of their own. */
  let quiz: { tok: Tok; options: { text: string; right: boolean }[] } | null = null
  let lastCard: Tok | null = null
  /** Options left out because nothing said which was right. */
  let unsaid = 0
  /** A question and its options become a card, when a line said which option is right or one of them was marked. */
  const settle = (q: { tok: Tok; options: { text: string; right: boolean }[] }, said: string | null): void => {
    const opts = q.options.filter((o) => o.text !== '')
    let right = said === null ? -1 : opts.findIndex((o) => o.text.toLowerCase() === said.trim().toLowerCase())
    if (said !== null && right < 0) {
      // "B", "b)", "(B) WHERE": the letter of an option.
      const letter = /^\(?([A-Ha-h])\)?[.):]?(?:\s|$)/.exec(said.trim())
      const at = letter ? (letter[1] ?? '').toLowerCase().charCodeAt(0) - 97 : -1
      if (at >= 0 && at < q.options.length) right = opts.indexOf(q.options[at] ?? { text: '', right: false })
    }
    const marked = opts.filter((o) => o.right)
    if (said === null && marked.length === 1 && marked[0]) right = opts.indexOf(marked[0])
    // An answer that is none of the options is the answer all the same, and the options are the wrong ones.
    const answer = right >= 0 ? opts[right]?.text ?? '' : said !== null ? said.trim() : ''
    if (!answer) { unsaid += q.options.length; return }
    const wrong = opts.filter((o, i) => i !== right && o.text.toLowerCase() !== answer.toLowerCase()).map((o) => o.text)
    q.tok.pair = { left: q.tok.text, right: answer, strong: true, ...(wrong.length ? { wrong } : {}) }
    q.tok.asks = false
    if (asked === q.tok) asked = null
    lastCard = q.tok
  }
  /** Lines with no letter or number in them: rows of dots, arrows, a lone picture. */
  let wordless = 0
  /** Columns an Anki file says hold something other than the card, counted from 0. */
  const skip = new Set<number>()
  let firstRow = true
  let count = 0, countRoman = 0, countLetter = 0
  // Selecting a chat's whole page copies a code block's button and, on the line before it, the block's language. Where
  // the button is a picture, the language stands alone; in a list said in words ("Topic: ...") no topic is that bare.
  const dress = new Set<number>()
  // A one-word button ("Copy") goes only after such a language: "Cut, Copy, Paste" is a list of topics.
  lines.forEach((l, i) => {
    if (outlined && p.plainCode.test(l.trim())) dress.add(i)
    if (!p.codeButton.test(l.trim())) return
    const named = p.plainCode.test((lines[i - 1] ?? '').trim())
    if (named) dress.add(i - 1)
    if (named || /\s/.test(l.trim())) dress.add(i)
  })
  for (const [at, line] of lines.entries()) {
    // A block of code is not notes.
    if (code.has(at) || dress.has(at) || talk.has(at)) continue
    const lead = /^[ \t]*/.exec(line)?.[0] ?? ''
    const indent = [...lead].reduce((n, ch) => n + (ch === '\t' ? 4 : 1), 0)
    let rest = line.slice(lead.length).trimEnd()
    // A quoted block is its lines; a callout's marker is not one of them; a banner is what it says.
    rest = rest.replace(/^(?:>\s*)+/, '').replace(/^\[![\w-]+\][+-]?\s*/, '').replace(/^~{3,}\s*([^~\s].*?)\s*~{3,}$/, '$1')
    if (rest === '') { blank = true; continue }
    const prev = out[out.length - 1]
    const blankBefore = blank
    blank = false
    // What Anki writes at the top of a file of cards.
    const anki = /^#(separator|html|tags|columns|notetype|deck|guid)(?: column)?:\s*(.*)$/i.exec(rest)
    if (anki) {
      if (/ column:/i.test(rest) && /^\d+$/.test(anki[2] ?? '')) skip.add(Number(anki[2]) - 1)
      continue
    }
    // A line of = or - (or a long one of ~) right under a line of text makes that line a heading. Otherwise it is a ruled line.
    if (/^(=+|-+|~{4,})$/.test(rest) && rest.length >= 3 && prev && !blankBefore && !prev.bulleted && prev.hash < 0 && !prev.table && !prev.pair) {
      prev.hash = rest.startsWith('=') ? 0 : 1
      continue
    }
    if (/^([-*_=~])(\s*\1){2,}$/.test(rest)) continue
    // The ruled row of a Markdown table: the row over it was the table's headings.
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(rest) && rest.includes('|')) {
      if (prev?.table) out.pop()
      continue
    }
    // A line of nothing but tags.
    if (/^(#[\p{L}\p{N}_/-]+\s*)+$/u.test(rest) && !/^#{2,}/.test(rest)) continue
    const tok: Tok = { indent, bulleted: false, marker: '', num: 0, text: '', whole: '', pair: null, hash: -1, soft: false, guessed: false, colon: false, bold: false, table: false, asks: false, admin: false, blankBefore, body: [], aside: [], links: [], doing: false, topic: false, level: 0 }
    // The options of a question, on lines of their own ("A) ...", "B) ..."), and the line that says which is right.
    const option = /^(?:[-*•]\s+)?\(?([A-Ha-h])[.)]\s+(\S.*)$/.exec(rest)
    if (option && prev) {
      const letter = (option[1] ?? '').toLowerCase()
      let next = at + 1
      while (next < lines.length && (lines[next] ?? '').trim() === '') next++
      const follows = /^\s*(?:[-*•]\s+)?\(?[Bb][.)]\s+\S/.test(lines[next] ?? '')
      if (!quiz && letter === 'a' && follows && prev.hash < 0 && !prev.pair && /[?？]$/.test(prev.text)) quiz = { tok: prev, options: [] }
      if (quiz && quiz.tok === prev && letter === String.fromCharCode(97 + quiz.options.length)) {
        const raw = (option[2] ?? '').trim()
        quiz.options.push({ text: plain(raw.replace(/[✓✔]/g, '')), right: /[✓✔]/.test(raw) || /^(\*\*|__).+\1$/.test(raw) })
        continue
      }
    }
    if (quiz) {
      const said = quiz.tok === prev ? p.answer.exec(plain(rest)) : null
      settle(quiz, said ? said[1] ?? '' : null)
      quiz = null
      if (said) continue
    }
    const hash = /^(#{1,6})\s+(.+?)\s*#*$/.exec(rest) ?? /^(#{1,6})([^#\s].*?)\s*#*$/.exec(rest)
    const tabbed = rest.includes('\t')
    if (hash) {
      tok.hash = (hash[1] ?? '#').length - 1
      // "## 2. Themes" and "## 2.1 Language" are numbered; "## 10 tips" and "# 1984" begin with a number.
      rest = (hash[2] ?? '').replace(/^(?:\(?\d+[.)]|\d+(?:\.\d+)+\.?)\s+(?=\S)/, '')
      // Counting starts again under each heading.
      count = 0; countRoman = 0; countLetter = 0
    } else if (rest.startsWith('|')) {
      const row = rest.split('|').map((c) => plain(c)).filter((c, i, all) => !(c === '' && (i === 0 || i === all.length - 1)))
      const [first = '', second = ''] = row
      tok.table = true
      if (p.label.test(first)) {
        // A contents page: "Chapter 1 | Soil | 3" is a chapter, its name and its page.
        const cols = row.filter(Boolean)
        rest = (cols.length >= 3 && /^\d{1,4}$/.test(cols[cols.length - 1] ?? '') ? cols.slice(0, -1) : cols).join(' ')
      } else {
        if (first && second) tok.pair = { left: first, right: second, strong: true }
        if (row.filter(Boolean).length > 2) note({ code: 'columns-left-out' })
        rest = first
      }
    } else if (!tabbed) {
      const dash = /^(?:[-*+•‣▪◦●○·–—]\s+)(?:\[[ xX]?\]\s+)?(.*)$/.exec(rest) ?? /^\[[ xX]?\]\s+(.*)$/.exec(rest)
      const deep = /^(\d+(?:\.\d+)+)\.?\s+(.*)$/.exec(rest)
      const numbered = /^\(?(\d+)[.)]\s+(.*)$/.exec(rest) ?? /^\(?([a-zA-Z]|[ivxIVX]{1,4})\)\s+(.*)$/.exec(rest)
      // "1 - topic", "IV. Topic", "B. Topic": a marker only when it counts up from the one before, so that
      // "1984 - a novel" and "C. elegans" keep their fronts.
      const counted = /^(\d{1,3})\s*[-–—:]\s+(\S.*)$/.exec(rest)
      const romaned = /^([IVXLC]+)\.\s+(\S.*)$/.exec(rest)
      const lettered = /^([A-Za-z])\.\s+(\S.*)$/.exec(rest)
      const letterAt = lettered ? (lettered[1] ?? '').toUpperCase().charCodeAt(0) - 64 : 0
      if (dash) { tok.bulleted = true; tok.marker = 'dash'; rest = dash[1] ?? '' }
      else if (deep) { tok.bulleted = true; tok.marker = 'num'; tok.num = (deep[1] ?? '').split('.').length - 1; rest = deep[2] ?? '' }
      else if (numbered) { tok.bulleted = true; tok.marker = 'num'; rest = numbered[2] ?? '' }
      else if (counted && (Number(counted[1]) === 1 || Number(counted[1]) === count + 1)) { count = Number(counted[1]); tok.bulleted = true; tok.marker = 'num'; rest = counted[2] ?? '' }
      else if (lettered && !(asked && asked === prev) && (letterAt === 1 || (countLetter > 0 && letterAt === countLetter + 1))) { countLetter = letterAt; tok.bulleted = true; tok.marker = 'num'; rest = lettered[2] ?? '' }
      else if (romaned && (roman(romaned[1] ?? '') === 1 || roman(romaned[1] ?? '') === countRoman + 1)) { countRoman = roman(romaned[1] ?? ''); tok.bulleted = true; tok.marker = 'num'; rest = romaned[2] ?? '' }
    }
    // "Part: ...", "Topic: ..." and "Read: ..." say in words what "#", "##" and the line under a heading say in marks.
    // They are read so only in a list of topics said that way, or of questions: "Part: Teil" is a word to learn.
    let headed = hash !== null
    if (!tok.table && !tabbed && labelish(rest) && (outlined || (head !== null && quizzed))) {
      const said = undress(rest)
      // "(Read: ...)" is "Read: ...".
      const text = /^\(.*\)$/.test(said.text) ? said.text.slice(1, -1).trim() : said.text
      const part = outlined ? p.part.exec(text) : null
      const named = part ?? (outlined ? p.topic.exec(text) : null)
      const about = named ? null : p.noteLine.exec(text)
      if (named) {
        tok.hash = part ? 1 : 2; tok.bulleted = false; tok.marker = ''; tok.num = 0; tok.topic = !part
        // A name in quotation marks is the name.
        rest = (named[2] ?? '').replace(/^(["“‘'])(.+)(["”’'])$/, '$2')
        headed = true
        count = 0; countRoman = 0; countLetter = 0
      } else if (about && head && (headSaid || !tok.bulleted)) {
        // Among the bullets under a "## heading", "- Practice: FizzBuzz" is one more thing to learn.
        // "Practise: ..." is something to do, and says so better with its first word left on.
        const whole = text.replace(/\s*(?::|\s[-–—]\s)\s*/, ' ')
        const doing = p.doing.test(whole)
        head.body.push(doing ? whole : about[2] ?? '')
        head.links.push(...said.links)
        if (doing) head.doing = true
        continue
      }
    }
    if (!tok.table && !headed) {
      if (p.counter.test(plain(rest))) continue
      // An answer belongs to the question on the line before it.
      const answer = asked && asked === prev ? p.answer.exec(rest) : null
      if (answer && asked) {
        const a = plain(answer[1] ?? '')
        if (a) { asked.pair = { left: asked.text, right: a, strong: true }; lastCard = asked }
        asked.asks = false
        asked = null
        continue
      }
      // "Wrong: ..." under a question and its answer: the wrong answers to show beside it.
      const wrongs: RegExpExecArray | null = lastCard && lastCard === prev && lastCard.pair ? p.wrongLine.exec(plain(rest)) : null
      if (wrongs && lastCard?.pair) {
        const pair: Pair = lastCard.pair
        const list = pair.wrong ?? []
        for (const w of (wrongs[1] ?? '').split(/\s\|\s|\s*[;,]\s*/).map((x) => x.trim())) {
          if (w && w.toLowerCase() !== pair.right.toLowerCase() && !list.some((x) => x.toLowerCase() === w.toLowerCase())) list.push(w)
        }
        if (list.length) pair.wrong = list
        continue
      }
      const question = p.question.exec(rest)
      const quoted = /^"((?:[^"]|"")+)"\s*[,;]\s*"((?:[^"]|"")*)"\s*$/.exec(rest)
      // "Q1. What is a fork? = One piece attacking two | ...": the question and its answers on one line.
      const whole = question ? splitPair(question[1] ?? '', p) : null
      if (question && whole?.strong) {
        tok.pair = whole
        rest = whole.left
      } else if (question) {
        rest = question[1] ?? ''
        tok.asks = true
        asked = tok
      } else if (quoted) {
        const left = plain((quoted[1] ?? '').replace(/""/g, '"')), right = plain((quoted[2] ?? '').replace(/""/g, '"'))
        if (left && right) tok.pair = { left, right, strong: true }
        rest = left
      } else if (tabbed) {
        // Columns: a card's two sides, or a contents page's chapter, title and page.
        let cols = rest.split('\t').map((c) => plain(c)).filter((_, i) => !skip.has(i)).filter(Boolean)
        if (firstRow && cols.length >= 2 && (p.column.test(cols[0] ?? '') || p.column.test(cols[1] ?? ''))) { firstRow = false; continue }
        firstRow = false
        if (cols.length >= 3 && /^\d{1,4}$/.test(cols[cols.length - 1] ?? '')) cols = cols.slice(0, -1)
        if (cols.length >= 2 && p.label.test(cols[0] ?? '')) rest = cols.join(' ')
        else {
          if (cols.length >= 2) tok.pair = { left: cols[0] ?? '', right: cols[1] ?? '', strong: true }
          if (cols.length > 2) note({ code: 'columns-left-out' })
          rest = cols[0] ?? ''
        }
      } else {
        // Dots leading to a page number, a page number set far to the right, "pg 12", "(see page 212)".
        rest = unpaged(rest)
        const page = p.pageRef.exec(rest)
        if (page && !/[-–—:=]\s*$/.test(rest.slice(0, page.index)) && page.index > 0) {
          rest = rest.slice(0, page.index)
          const said = fill(p.writes.page, { n: (page[1] ?? '').replace(/\s+/g, '') })
          if (said) tok.aside.push(said)
        }
        rest = rest.replace(p.asking, '')
        tok.bold = !tok.bulleted && /^(\*\*|__)[^*_].*\1:?$/.test(rest) && !/^(\*\*|__).+?\1.+(\*\*|__)/.test(rest.replace(/:$/, ''))
        if (!p.label.test(plain(rest))) tok.pair = splitPair(rest, p)
        // "Mon: scales" is scales, on Monday. "sun - Sonne" is a word to learn.
        if (tok.pair?.colon && p.weekday.test(tok.pair.left)) { tok.aside.push(tok.pair.left + '.'); rest = tok.pair.right; tok.pair = null }
      }
    }
    const { text, links } = undress(rest)
    tok.links = links
    tok.text = text
    tok.whole = text
    if (!tok.pair && tok.hash < 0 && !tok.table && /:$/.test(text) && text.length > 1) { tok.colon = true; tok.text = text.replace(/\s*:$/, '') }
    if (tok.hash >= 0) tok.text = tok.text.replace(/\s*:$/, '')
    // An address on a line of its own belongs to the line above.
    if (!tok.text && links.length && prev) { prev.links.push(...links); continue }
    if (!tok.text && links.length) tok.text = links[0] ?? ''
    if (!worded(tok.text) && !links.length) { wordless++; continue }
    // One full stop, at the end, is the end of a line and not part of a name.
    if (/[^.]\.$/.test(tok.text) && tok.text.indexOf('.') === tok.text.length - 1 && !prose(tok.text)) tok.text = tok.text.slice(0, -1).trimEnd()
    tok.admin = isAdmin(tok.text, tok.pair, tok.colon, p)
    const free = !tok.bulleted && tok.hash < 0 && !tok.table && !tok.asks
    if (free && p.chatter.test(tok.text)) continue
    // Four or more short things with commas between them are that many topics.
    const things = tok.text.split(/\s*[,;]\s*/)
    const listed = !tok.pair && tok.hash < 0 && !tok.table && !tok.asks && !tok.colon && outside(tok.text).split(/\s*[,;]\s*/).length === things.length
    if (listed && things.length >= 4 && things.every((x) => x.length >= 1 && x.length <= 40 && words(x) <= 5)) {
      things.map((part) => part.replace(/\.$/, '').trim()).filter(worded).forEach((part, i) => out.push({ ...tok, text: part, whole: part, body: [], aside: [], links: [], blankBefore: tok.blankBefore && i === 0 }))
      continue
    }
    // Running text belongs to the heading or the line it stands under.
    if (free && prev && !tok.pair && !tok.colon && !tok.bold && !p.label.test(tok.text) && prose(tok.text)) { prev.body.push(tok.text); continue }
    out.push(tok)
    if (tok.hash >= 0) { head = tok; headSaid = headed && hash === null }
  }
  if (quiz) settle(quiz, null)
  if (unsaid > 0) note({ code: 'options-left-out', count: unsaid })
  if (codeBlocks > 0) note({ code: 'code-left-out', count: codeBlocks })
  if (wordless > 0) note({ code: 'wordless-left-out', count: wordless })
  return out
}

/** Which lines are headings though nothing marks them as one, and how deep every line sits. */
function levels(toks: Tok[], p: Patterns): void {
  const capsShare = toks.filter((t) => isCaps(t.text)).length / Math.max(1, toks.length)
  /** A plain line further down stands over bullets as the first line does: the first is one heading of several. */
  const sections = toks.some((t, i) => i >= 2 && t.hash < 0 && !t.bulleted && !t.table && !t.pair && !t.asks && t.indent <= 1 && toks[i + 1]?.bulleted === true)
  toks.forEach((t, i) => {
    const next = toks[i + 1], after = toks[i + 2]
    if (t.hash >= 0 || t.bulleted || t.table || t.asks || t.pair?.strong || t.indent > 1) return
    // The first line, alone over a blank line, with a list under it: the title, even if it reads as two parts. But
    // only when it does not look like the lines under it: it is a few words long, or they are bulleted and it is not.
    if (i === 0 && next?.blankBefore && toks.length >= 4 && (words(t.whole) >= 3 || toks.slice(1).some((x) => x.bulleted)) && !(next.bulleted && sections)) {
      // It stands over everything, the weeks and chapters under it included, as a "# Title" would.
      t.hash = 0; t.guessed = true; t.pair = null; t.admin = false; t.text = t.whole.replace(/\s*:$/, '')
      return
    }
    const overList = !t.pair && next !== undefined && next.hash < 0 && (next.bulleted || next.indent > t.indent)
    const overPairs = !t.pair && next?.pair != null && after?.pair != null && !next.admin && !after.admin
    const marked = t.colon || t.bold || p.label.test(t.text) || (isCaps(t.text) && capsShare < 0.5 && !t.pair)
    t.soft = marked || overList || overPairs
    t.guessed = t.soft && !marked
  })
  let base = 0
  let open = false
  /** Whether the lines under the open heading are bulleted: a heading over bullets ends where the bullets do. */
  let kids: boolean | null = null
  let stack: number[] = []
  /** The indent of the numbered line that dash bullets at the same indent sit under. */
  let numbered = -1
  for (const t of toks) {
    if (t.hash >= 0) { t.level = t.hash; base = t.hash + 1; open = false; stack = []; numbered = -1; continue }
    if (t.soft) { t.level = base; open = true; kids = null; stack = []; numbered = -1; continue }
    if (open && kids === true && !t.bulleted && t.indent === 0) { open = false; stack = [] }
    if (open && kids === null) kids = t.bulleted
    while (stack.length > 1 && t.indent < (stack[stack.length - 1] ?? 0)) stack.pop()
    const top = stack[stack.length - 1]
    if (top === undefined || t.indent > top) stack.push(t.indent)
    else if (t.indent < top) stack[0] = t.indent
    let depth = Math.max(stack.length - 1, t.num)
    if (t.marker === 'num' && t.num === 0) numbered = t.indent
    else if (t.marker === 'dash' && numbered === t.indent) depth += 1
    else if (t.marker !== 'dash') numbered = -1
    t.level = base + (open ? 1 : 0) + depth
  }
}

function tree(toks: Tok[]): Node[] {
  const top: Node[] = []
  const path: Node[] = []
  for (const tok of toks) {
    const node: Node = { tok, children: [] }
    while (path.length > 0 && (path[path.length - 1]?.tok.level ?? 0) >= tok.level) path.pop()
    // A heading stands under a heading or under nothing: never under a plain line that happened to come before it.
    if (tok.hash >= 0) while (path.length > 0 && (path[path.length - 1]?.tok.hash ?? -1) < 0 && !path[path.length - 1]?.tok.soft) path.pop()
    const parent = path[path.length - 1]
    if (parent) parent.children.push(node)
    else top.push(node)
    path.push(node)
  }
  return top
}

/* ---------- topics ---------- */

/** Shares of at most `size`, as even as they can be. */
function shares<T>(items: T[], size: number): T[][] {
  const n = Math.ceil(items.length / size)
  const out: T[][] = []
  let at = 0
  for (let i = 0; i < n; i++) {
    const take = Math.ceil((items.length - at) / (n - i))
    out.push(items.slice(at, at + take))
    at += take
  }
  return out
}

/** A name for a set of cards that stands under no heading: its first few questions. */
function fronts(cards: Card[], lim: Limits): string {
  let s = ''
  for (const c of cards) {
    const next = s ? s + ', ' + c.q : c.q
    if (next.length > lim.name - 1) return s ? s + '…' : fit(c.q, lim.name)
    s = next
  }
  return s
}

/** Read a learner's own text into topics. Never throws. */
export function read(input: string, opts: ReadOptions = {}): Draft {
  // Settings that cannot be read are the reader's own, one by one: it reads whatever it is handed.
  const lim = attempt(() => limitsOf(opts.limits), { ...LIMITS })
  const told = attempt(() => opts.pairs, undefined)
  const pairsAs = told === 'cards' || told === 'topics' ? told : undefined
  const given = attempt(() => (typeof opts.words === 'object' && opts.words !== null ? compile(opts.words) : null), null)
  const text = normal(attempt(() => (input === null || input === undefined ? '' : String(input)), ''))
  // Words that are more than a pattern can hold show it only when a text is read by them. It is read by English then.
  if (given) {
    try { return reading(text, lim, pairsAs, given) } catch { /* by English, below */ }
  }
  return reading(text, lim, pairsAs, compile(ENGLISH))
}

/** A text, already made plain, read into a draft by these limits and these words. */
function reading(text: string, lim: Limits, pairsAs: 'cards' | 'topics' | undefined, made: Patterns): Draft {
  // The few words the reader writes are text like any other: one line each, with nothing in them that cannot be seen.
  const tidied = (line: string): string => normal(line).replace(/\s+/g, ' ').trim()
  const p: Patterns = { ...made, writes: { page: tidied(made.writes.page), partOf: tidied(made.writes.partOf), card: tidied(made.writes.card), cards: tidied(made.writes.cards), cardsName: tidied(made.writes.cardsName) } }
  const notes: Note[] = []
  const said = new Set<string>()
  /** No two notes alike: one of a kind, or one for each name where a note names one. */
  const note = (n: Note, key: string = n.code): void => { if (!said.has(key)) { said.add(key); notes.push(n) } }

  let lines = text.split('\n')
  // The end of the last line is not a line more.
  while (lines.length > 1 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  if (lines.length > lim.lines) {
    note({ code: 'lines-cut', kept: lim.lines, of: lines.length })
    lines = lines.slice(0, lim.lines)
  }
  // No name or note is as long as this, and a line read only so far cannot keep a pattern busy for long.
  const long = lines.filter((l) => l.length > lim.line).length
  if (long > 0) {
    note({ code: 'long-lines-cut', count: long, kept: lim.line })
    lines = lines.map((l) => (l.length > lim.line ? cut(l, lim.line) : l))
  }
  const toks = tokens(lines, p, note)
  levels(toks, p)

  // What is about the course and not in it is left out, with everything under it.
  const dropped: { text: string; under: number }[] = []
  const size = (n: Node): number => n.children.reduce((sum, c) => sum + 1 + size(c), 0)
  const prune = (ns: Node[]): Node[] => ns.filter((n) => {
    if (!n.tok.admin) { n.children = prune(n.children); return true }
    dropped.push({ text: n.tok.pair ? n.tok.pair.left : n.tok.text, under: size(n) })
    return false
  })
  let top = prune(tree(toks))
  if (dropped.length) note({ code: 'course-left-out', items: dropped.slice(0, 6), more: Math.max(0, dropped.length - 6) })

  // One heading over everything is the title of the whole thing.
  let title = ''
  let over: Node | null = null
  const only = top[0]
  if (top.length === 1 && only && only.children.length > 0 && !only.tok.topic) {
    title = fit(headingText(only, p), lim.title)
    // A plain line taken for the title is not a topic any more, and a person should know that it was.
    if (only.tok.guessed) note({ code: 'title-taken', text: title })
    over = only
    top = only.children
  }

  // Every line with nothing under it is a topic. Is a line in two parts a card, or a topic and a note on it?
  const leaves: Node[] = []
  const walk = (ns: Node[]): void => { for (const n of ns) { if (n.children.length) walk(n.children); else leaves.push(n) } }
  walk(top)
  const pairs = leaves.filter((n) => n.tok.pair).length
  /**
   * The lines under one heading are read one way: as cards when there are three or more that fit a card, nearly all of
   * them look like something to be asked, and they are most of what is there. So a syllabus with one list of words in
   * it keeps its topics and gets its cards. Told how to read them, the reader does as it is told everywhere.
   */
  const cardsUnder = (ns: Node[]): boolean => {
    if (pairsAs) return pairsAs === 'cards'
    const mine = ns.filter((n) => n.children.length === 0)
    const paired = mine.filter((n) => n.tok.pair)
    const fitting = paired.filter((n) => n.tok.pair && fitsCard(n.tok.pair, lim))
    const like = fitting.filter((n) => n.tok.pair && cardLike(n.tok.pair, p)).length
    return fitting.length >= 3 && like >= 0.8 * fitting.length && paired.length >= 0.6 * mine.length
  }
  let asCards = 0

  const topics: DraftTopic[] = []
  const taken = new Set<string>()
  const tried = new Map<string, number>()
  const add = (t: DraftTopic, spare: boolean): void => {
    let name = t.name
    // A name has a letter or a number in it. A set of cards whose questions are all signs is still a set of cards.
    if (!worded(name) && !/^https?:/i.test(name)) {
      if (!spare) return note({ code: 'wordless-name-left-out' })
      name = fit(p.writes.cardsName, lim.name) || '1'
    }
    if (taken.has(name.toLowerCase())) {
      // A set of cards is kept under a name of its own; a topic that is there twice is left out.
      if (!spare) return note({ code: 'twice-left-out', text: name }, 'twice:' + name.toLowerCase())
      // The first number not yet taken, from 2. A name is cut to make room for its number, so names that are cut
      // to the same letters share their numbers: where the last of those stopped looking, this one starts.
      const base = name
      for (let digits = 1; taken.has(name.toLowerCase()); digits++) {
        const stem = fit(base, lim.name - (3 + digits))
        const key = digits + ':' + stem.toLowerCase()
        const end = 10 ** digits
        let i = tried.get(key) ?? Math.max(2, end / 10)
        while (i < end && taken.has((stem + ' (' + i + ')').toLowerCase())) i++
        tried.set(key, i)
        if (i < end) name = stem + ' (' + i + ')'
      }
    }
    taken.add(name.toLowerCase())
    topics.push({ ...t, name })
  }

  let bodies = 0
  const within = (ns: Node[], parent: Node | null, group: string, middle: string[]): void => {
    // What was written under a heading that holds cards is what to read for them. Under any other it is left out.
    const about = parent ? parent.tok.body.join(' ') : ''
    let told = false
    const here = cardsUnder(ns)
    // What can only be a card (a question and its answer, a table) is one, unless the reader was told otherwise.
    const isCard = (n: Node): boolean => n.tok.pair !== null && fitsCard(n.tok.pair, lim) && (here || (pairsAs === undefined && n.tok.pair.strong))
    const cards = ns.filter((n) => n.children.length === 0 && isCard(n))
    asCards += cards.length
    let cardsDone = false
    for (const n of ns) {
      if (n.children.length > 0) {
        const mine = headingText(n, p)
        // The first heading down is the group; the ones under it are said in the line on what to read.
        within(n.children, n, group || fit(mine, lim.group), group ? [...middle, mine] : middle)
        continue
      }
      if (isCard(n)) {
        if (cardsDone) continue
        cardsDone = true
        const all: Card[] = []
        const seen = new Set<string>()
        for (const c of cards) {
          const pair = c.tok.pair
          if (!pair) continue
          if (seen.has(pair.left.toLowerCase())) { note({ code: 'twice-left-out', text: pair.left }, 'twice:' + pair.left.toLowerCase()); continue }
          seen.add(pair.left.toLowerCase())
          const wrong = (pair.wrong ?? []).filter((w) => w.length <= lim.a).slice(0, 3)
          all.push({ q: pair.left, a: pair.right, ...(wrong.length ? { wrong } : {}) })
        }
        const sets = shares(all, lim.cards)
        const under = parent ? headingText(parent, p) : ''
        sets.forEach((set, i) => {
          const tag = ' (' + (i + 1) + ')'
          const name = under ? (sets.length > 1 ? fit(under, lim.name - tag.length) + tag : fit(under, lim.name)) : fronts(set, lim)
          const list = fill(set.length === 1 ? p.writes.card : p.writes.cards, { n: set.length, list: set.map((c) => c.q).join(', ') }) || set.map((c) => c.q).join(', ')
          // Sets under one heading are grouped by it; one set under a heading stands where the heading stood.
          const g = under && sets.length > 1 && !group ? fit(under, lim.group) : parent && group === fit(under, lim.group) && sets.length === 1 ? '' : group
          // Cards with nothing said about them are facts to remember. With a line on what to read they are the questions of a topic.
          if (about.length > lim.summary) note({ code: 'summary-cut', text: name }, 'cut:' + name)
          add({ name, summary: fit(about || list, lim.summary), kind: about ? kindOf(under, parent?.tok.doing ? about : '', p) : 'facts', group: g, cards: set }, true)
          told = about !== ''
        })
        continue
      }
      const pair = n.tok.pair
      const whole = pair ? pair.left : n.tok.text
      const name = fit(whole, lim.name)
      if (name !== whole) note({ code: 'name-shortened', text: name }, 'short:' + name)
      const parts = [name !== whole ? whole : '', pair ? pair.full ?? pair.right : '', n.tok.body.join(' '), n.tok.aside.join(' '), n.tok.links.join(' '), middle.length ? fill(p.writes.partOf, { path: middle.join(' › ') }) : ''].filter(Boolean)
      const summary = parts.join(name !== whole && pair ? ': ' : ' ')
      if (summary.length > lim.summary) note({ code: 'summary-cut', text: name }, 'cut:' + name)
      add({ name, summary: fit(summary, lim.summary), kind: kindOf(whole, pair ? pair.right : n.tok.doing ? n.tok.body.join(' ') : '', p), group, cards: [] }, false)
    }
    if (about && !told) bodies++
  }
  within(top, over, '', [])
  if (bodies > 0) note({ code: 'text-left-out', count: bodies })

  const shown: Note[] = notes.length > lim.notes + 1 ? [...notes.slice(0, lim.notes), { code: 'more-notes', count: notes.length - lim.notes }] : notes
  return { title, topics, notes: shown, pairs, pairsAs: pairsAs ?? (pairs > 0 && 2 * asCards >= pairs ? 'cards' : 'topics') }
}
