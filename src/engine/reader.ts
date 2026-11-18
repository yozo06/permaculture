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
// Pure, with nothing imported: text in, a draft out. It never throws, it says what it leaves out and which names it
// shortens (`notes`), and it reads only so far along a line and so many lines, so that no paste can hold the page up.
// Every rule here came from a paste somebody might really make; reader.test.ts has one of each.

/** What kind of thing a topic is. The game draws it, asks about it and harvests it by this. */
export type Kind = 'facts' | 'skill' | 'idea' | 'rule' | 'whole'

/** A question card: something to be asked, and what goes with it. */
export interface Card { q: string; a: string }

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
  /** What was shortened or left out, in words a person can read. */
  notes: string[]
  /** How many lines came in two parts. Where there are some, they can be read two ways. */
  pairs: number
  /** How they were read, or how most of them were: as question cards, or each as a topic with a line on what to read. */
  pairsAs: 'cards' | 'topics'
}

export interface ReadOptions {
  /** Read lines in two parts this way, whatever they look like. */
  pairs?: 'cards' | 'topics'
}

/** The most each piece of text may hold, the most cards in a topic, and the most lines read. */
export const TEXT = { title: 60, name: 48, summary: 300, group: 60, q: 160, a: 120, cards: 10, bundle: 8, lines: 2000, line: 400, notes: 12 } as const

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
const PICTURE = '(?:(?![\\u00A9\\u00AE\\u2122])[\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\uFE0F\\u200D\\s])+'
const PICTURES = new RegExp('^' + PICTURE + '|' + PICTURE + '$', 'gu')
/** Every way a text file ends a line. */
const LINE_END = new RegExp('\\r\\n?|[\\u2028\\u2029]', 'g')

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
  let s = raw.replace(/!?\[([^\][]*)\]\(\s*([^)\s]+)(?:\s[^)]*)?\)/g, (_, label: string, url: string) => {
    if (/^https?:\/\//i.test(url)) links.push(url)
    return label
  })
  s = s.replace(/https?:\/\/\S+/gi, (url) => { links.push(url.replace(/[).,;!?]+$/, '')); return ' ' })
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  s = s.replace(/\*\*|__|`/g, '')
  s = s.replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=$|[\s).,;:!?])/g, '$1$2')
  s = s.replace(/\s+/g, ' ').trim().replace(PICTURES, '')
  // An address taken out of a line can leave the mark that led up to it hanging.
  if (links.length) s = s.replace(/\s*[-–—:]$/, '')
  return { text: s, links }
}
const plain = (raw: string): string => undress(raw).text

/** Commas that separate, not the ones inside brackets. */
const outside = (s: string): string => s.replace(/\([^)]*\)|\[[^\]]*\]/g, '')

/* ---------- a line in two parts ---------- */

/** "Chapter 3", "Week 2", "Unit IV": a label, which belongs with what follows it. */
const LABEL = /^(chapter|unit|week|weeks|module|part|lesson|section|day|days|lecture|topic|phase|stage|level|step|session|class|book|volume|semester|sem|year|term|trimester|quarter|domain|kapitel|lektion|woche|teil)\s+(\d+(?:\s*[-–]\s*\d+)?|[ivxlc]+|[a-z])(?![\p{L}\p{N}])/iu
const isLabelled = (text: string): boolean => LABEL.test(text)

const WEEKDAY = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i

/** The second part is a note on what to read or do, not something to be asked. */
const NOTE = /^(?:(?:read|see|watch|do|practi[cs]e|review|revise|listen to)\s+\S|(?:chapters?|pages?|sections?|lectures?|videos?|ch\.|pp?\.)\s*\d)|https?:\/\//i

const MARKS = [' = ', ' → ', ' -> ', ' => ', ' :: ', ' - ', ' – ', ' — ', ': '] as const

function splitPair(s: string): Pair | null {
  // A side that is nothing but a picture or a sign ("dog - 🐶") is kept as it is; an address is not a side.
  const side = (raw: string): string => plain(raw) || (/https?:\/\//i.test(raw) ? '' : raw.trim())
  const make = (left: string, right: string, more: Partial<Pair> = {}): Pair | null => {
    const l = side(left), r = side(right)
    return l && r && !LABEL.test(l) ? { left: l, right: r, strong: false, ...more } : null
  }
  // A bold start is the name, when a mark sets it apart from the rest. Without one the line simply goes on.
  const inside = /^(\*\*|__)(.+?):\1\s*(\S.*)$/.exec(s)
  if (inside) return make(inside[2] ?? '', inside[3] ?? '', { named: true, colon: true })
  const bold = /^(\*\*|__)(.+?)\1\s*(:|[-–—=]|->|→)\s*(\S.*)$/.exec(s)
  if (bold) return make(bold[2] ?? '', bold[4] ?? '', { named: true, ...(bold[3] === ':' ? { colon: true } : {}) })
  if (/^(\*\*|__)/.test(s)) return null
  // A question, and its answer after it on the same line.
  const asked = /^(.{3,}?\?)\s+(\S.*)$/.exec(s)
  if (asked && !/\?\s*$/.test(s)) return make(asked[1] ?? '', asked[2] ?? '', { strong: true })
  // The first mark in the line is the one that parts it.
  let at = -1
  let mark = ''
  for (const m of MARKS) {
    const i = s.indexOf(m)
    if (i > 0 && (at < 0 || i < at)) { at = i; mark = m }
  }
  if (at < 0) return null
  const left = s.slice(0, at)
  // A long run of words before the mark is a sentence with a colon in it, not a name.
  if (words(left) > 8) return null
  return make(left, s.slice(at + mark.length), MARKS.indexOf(mark as (typeof MARKS)[number]) < 5 ? { eq: true } : mark === ': ' ? { colon: true } : {})
}

/** Short enough to be asked as a card. */
const fitsCard = (p: Pair): boolean => p.left.length <= TEXT.q && p.right.length <= TEXT.a
/** Looks like something to be asked, and not like a topic with a sentence about it. */
const cardLike = (p: Pair): boolean =>
  p.strong || (!p.named && p.left.length <= 60 && !NOTE.test(p.right) && (p.eq ? p.right.length <= 80 : p.right.length <= 40 && words(p.right) <= 6))

/* ---------- lines that are about the course, not in it ---------- */

/** Before a colon or a dash: a tip, a note, the credits. */
const ADMIN_LABEL = /^(tips?|pro tip|notes?|n\.?b\.?|remember|reminder|exam details|duration|credits?|marks|l-t-p|instructor|course code|prerequisites?|pre-requisites?)$/i
/**
 * As a label or as a heading: the lists of books and the scheme of marks. Words a subject may well have a part named
 * after ("Evaluation", "References", "Assessment") are not here: leaving out a part of the subject is worse than
 * keeping a list of books.
 */
const ADMIN_ANY = /^(recommended (?:resources|reading|books|text ?books?)|suggested (?:reading|books)|further reading|text ?books?|reference ?books?|bibliography|office hours|evaluation scheme|grading policy)$/i
const PAGE_MARK = /^(page|pg\.?|p\.)\s*\d+$/i
const isAdmin = (text: string, pair: Pair | null): boolean => {
  // "Note: bring a calculator" is about the course. "note - nota" is a word to learn: a label is set off by a colon.
  if (pair) return (pair.colon === true && (ADMIN_LABEL.test(pair.left) || ADMIN_ANY.test(pair.left))) || (/^(sub)?total\b/i.test(pair.left) && /^(\d|~|≈|about|around|approx)/i.test(pair.right))
  return ADMIN_ANY.test(text) || PAGE_MARK.test(text) || /^(sub)?total\b.*\d/i.test(text)
}

/** "(8 hrs)", "[3 credits]", "(24%)" at the end of a heading. */
const HOURS = /\s*[[(]\s*\d+(?:\.\d+)?\s*(?:hrs?|hours?|credits?|marks?|periods?|lectures?|mins?|minutes?|weeks?|%)\s*[\])]\s*$/i
const headingText = (n: Node): string => n.tok.text.replace(HOURS, '') || n.tok.text

/* ---------- the kind of thing ---------- */

const DOING = /^(how to|practi[cs]e|practi[cs]ing|write|build|make|draw|solve|implement|set up|configure|play|sing|cook|bake|run|perform|create|design|deploy|debug|speak|pronounce|conjugate|translate|train|rehearse|memori[sz]e|present|record|sketch|paint|code)(?=\s|$)/i
const RULE = /\b(rules?|laws?|theorems?|principles?|patterns?|formula|equations?|versus|lemma|axioms?|difference between|trade-?offs?)(?![\p{L}\p{N}])|^(when|why) (not )?to\b/iu
/** "Stack vs heap", but not "VS Code". */
const VERSUS = /\svs\.?\s/
const WHOLE = /\b(overview|introduction|intro|big picture|recap|summary|history of|landscape|map of|architecture of|foundations of|fundamentals of|basics of|the whole)\b/i
const FACTS = /\b(vocabulary|vocab|words|verbs|nouns|adjectives|key terms|terminology|glossary|dates|capitals|names of|symbols|abbreviations|acronyms|alphabet|definitions|formulas|formulae|phrases|idioms|kanji|hiragana|katakana)\b/i
const DRILL = /\b(exercises?|drills?|practice|practise|lab|project|workout|kata|rehearsal)\b|\b\d+\s*x\s*\d+/i

function kindOf(name: string): Kind {
  if (DOING.test(name)) return 'skill'
  if (RULE.test(name) || VERSUS.test(name)) return 'rule'
  if (WHOLE.test(name)) return 'whole'
  if (FACTS.test(name)) return 'facts'
  return DRILL.test(name) ? 'skill' : 'idea'
}

/* ---------- lines ---------- */

/** What is said before and after a list: by an AI chat that was asked for one, or by the person typing it. */
const CHATTER = /^(here('s| is| are)\b|sure[,!. ]|certainly[,!. ]|of course[,!. ]|absolutely[,!. ]|let me know\b|i hope\b|hope (this|that|it) helps|feel free\b|would you like\b|happy to\b|good luck\b|great question|if you('d| would) like\b|do you want me\b|enjoy[!. ]*$|(thanks|thank you|thx|ty|cheers|ok|okay|hi|hello|hey)\b[\s!.,:)]*(for reading\b.*)?$)/i
/** "ok so i want to learn about ...": the asking, which is not part of what is asked for. */
const ASKING = /^(?:(?:ok(?:ay)? so|also|and also)\s+)?(?:(?:i\s+(?:want|wanna|would like|need|'d like)\s+to\s+(?:learn|know|study|understand)|teach me|help me (?:with|learn))(?:\s+more)?(?:\s+about)?\s+)?/i
/** "Card 3", "Question 4": a counter over a card, which names nothing. */
const COUNTER = /^(?:card|flashcard|question|item|no\.?)\s*#?\d+\s*[:.)]?$/i
/** The first row of a table of cards, when it names the columns. */
const COLUMN = /^(word|words|term|terms|front|question|q|phrase|expression|vocab|vocabulary|kanji|meaning|definition|back|answer|a|translation|english)$/i

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
function oneLine(lines: string[]): string[] {
  const full = lines.filter((l) => l.trim() !== '')
  if (full.length < 1 || full.length > 2) return lines
  const SEP = /\s*[,;]\s*|\s+(?:and|&)\s+/i
  const parts = (l: string): string[] => l.trim().replace(ASKING, '').split(SEP).map((p) => p.trim()).filter(Boolean)
  const listed = (l: string): boolean => {
    const ps = parts(l)
    return ps.length >= 3 && !/\t|\||\s[-–—=]\s|:\s|\?|^\s*[#>]|[([]/.test(l) && ps.every((p) => p.length <= 60)
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
 * The lines that are code: from a fence to the next line that is nothing but a fence. A fence with nothing to close
 * it is no fence, so one stray mark cannot swallow the rest of a paste; only that line is dropped.
 */
function fenced(lines: string[]): { code: Set<number>; blocks: number } {
  const code = new Set<number>()
  let blocks = 0
  const ends: number[] = []
  lines.forEach((l, i) => { if (/^\s*(?:`{3,}|~{3,})\s*$/.test(l)) ends.push(i) })
  let e = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? ''
    if (!/^\s*(?:```|~~~)/.test(l)) continue
    // A long row of tildes right under a line of text underlines it, and "~~~ Week 1 ~~~" is a banner. Three are a fence.
    const underline = /^\s*~{4,}\s*$/.test(l) && i > 0 && /^\s*[^\s#>~`-]/.test(lines[i - 1] ?? '') && !code.has(i - 1)
    if (underline || /^\s*~{3,}\s*[^~\s].*~{3,}\s*$/.test(l)) continue
    while (e < ends.length && (ends[e] ?? 0) <= i) e++
    const end = ends[e]
    if (end === undefined) { code.add(i); continue }
    for (let j = i; j <= end; j++) code.add(j)
    blocks++
    i = end
  }
  return { code, blocks }
}

function tokens(input: string[], note: (n: string, key?: string) => void): Tok[] {
  const lines = sheet(oneLine(input))
  const out: Tok[] = []
  let blank = true
  let asked: Tok | null = null
  const { code, blocks: codeBlocks } = fenced(lines)
  /** Lines with no letter or number in them: rows of dots, arrows, a lone picture. */
  let wordless = 0
  /** Columns an Anki file says hold something other than the card, counted from 0. */
  const skip = new Set<number>()
  let firstRow = true
  let count = 0, countRoman = 0, countLetter = 0
  for (const [at, line] of lines.entries()) {
    // A block of code is not notes.
    if (code.has(at)) continue
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
    // A line of =, - or ~ right under a line of text makes that line a heading. Otherwise it is a ruled line.
    if (/^(=+|-+|~+)$/.test(rest) && rest.length >= 3 && prev && !blankBefore && !prev.bulleted && prev.hash < 0 && !prev.table && !prev.pair) {
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
    const tok: Tok = { indent, bulleted: false, marker: '', num: 0, text: '', whole: '', pair: null, hash: -1, soft: false, guessed: false, colon: false, bold: false, table: false, asks: false, admin: false, blankBefore, body: [], aside: [], links: [], level: 0 }
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
      if (first && second) tok.pair = { left: first, right: second, strong: true }
      if (row.filter(Boolean).length > 2) note('Read the first two columns of each line as a card, and left the others out.')
      rest = first
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
    if (!tok.table && hash === null) {
      if (COUNTER.test(plain(rest))) continue
      // An answer belongs to the question on the line before it.
      const answer = asked && asked === prev ? /^(?:a|ans|answer)\s*\d*\s*[:.)]\s*(.+)$/i.exec(rest) : null
      if (answer && asked) {
        const a = plain(answer[1] ?? '')
        if (a) asked.pair = { left: asked.text, right: a, strong: true }
        asked.asks = false
        asked = null
        continue
      }
      const question = /^(?:q|question)\s*\d*\s*[:.)]\s*(.+)$/i.exec(rest)
      const quoted = /^"((?:[^"]|"")+)"\s*[,;]\s*"((?:[^"]|"")*)"\s*$/.exec(rest)
      if (question) {
        rest = question[1] ?? ''
        tok.asks = true
        asked = tok
      } else if (quoted) {
        const left = plain((quoted[1] ?? '').replace(/""/g, '"')), right = plain((quoted[2] ?? '').replace(/""/g, '"'))
        if (left && right) tok.pair = { left, right, strong: true }
        rest = left
      } else if (tabbed) {
        // Columns: a card's two sides, or a contents page's chapter, title and page.
        let cols = rest.split('\t').map((p) => plain(p)).filter((_, i) => !skip.has(i)).filter(Boolean)
        if (firstRow && cols.length >= 2 && (COLUMN.test(cols[0] ?? '') || COLUMN.test(cols[1] ?? ''))) { firstRow = false; continue }
        firstRow = false
        if (cols.length >= 3 && /^\d{1,4}$/.test(cols[cols.length - 1] ?? '')) cols = cols.slice(0, -1)
        if (cols.length >= 2 && isLabelled(cols[0] ?? '')) rest = cols.join(' ')
        else {
          if (cols.length >= 2) tok.pair = { left: cols[0] ?? '', right: cols[1] ?? '', strong: true }
          if (cols.length > 2) note('Read the first two columns of each line as a card, and left the others out.')
          rest = cols[0] ?? ''
        }
      } else {
        // Dots leading to a page number, a page number set far to the right, "pg 12", "(see page 212)".
        rest = rest.replace(/\s*(?:\.\s?){3,}\s*\d+(?:\s*[-–]\s*\d+)?\s*$/, '').replace(/\s{3,}\d{1,4}\s*$/, '')
        const page = /[\s,(]+(?:see\s+)?(?:pp?\.?|pg\.?|pages?)\s*(\d+(?:\s*[-–]\s*\d+)?)\)?\s*$/i.exec(rest)
        if (page && !/[-–—:=]\s*$/.test(rest.slice(0, page.index)) && page.index > 0) { rest = rest.slice(0, page.index); tok.aside.push('Page ' + (page[1] ?? '').replace(/\s+/g, '') + '.') }
        rest = rest.replace(ASKING, '')
        tok.bold = !tok.bulleted && /^(\*\*|__)[^*_].*\1:?$/.test(rest) && !/^(\*\*|__).+?\1.+(\*\*|__)/.test(rest.replace(/:$/, ''))
        if (!isLabelled(plain(rest))) tok.pair = splitPair(rest)
        // "Mon: scales" is scales, on Monday.
        if (tok.pair && WEEKDAY.test(tok.pair.left)) { tok.aside.push(tok.pair.left + '.'); rest = tok.pair.right; tok.pair = null }
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
    tok.admin = isAdmin(tok.text, tok.pair)
    const free = !tok.bulleted && tok.hash < 0 && !tok.table && !tok.asks
    if (free && CHATTER.test(tok.text)) continue
    // Four or more short things with commas between them are that many topics.
    const things = tok.text.split(/\s*[,;]\s*/)
    const listed = !tok.pair && tok.hash < 0 && !tok.table && !tok.asks && !tok.colon && outside(tok.text).split(/\s*[,;]\s*/).length === things.length
    if (listed && things.length >= 4 && things.every((p) => p.length >= 1 && p.length <= 40 && words(p) <= 5)) {
      things.map((part) => part.replace(/\.$/, '').trim()).filter(worded).forEach((part, i) => out.push({ ...tok, text: part, whole: part, body: [], aside: [], links: [], blankBefore: tok.blankBefore && i === 0 }))
      continue
    }
    // Running text belongs to the heading or the line it stands under.
    if (free && prev && !tok.pair && !tok.colon && !tok.bold && !isLabelled(tok.text) && prose(tok.text)) { prev.body.push(tok.text); continue }
    out.push(tok)
  }
  if (codeBlocks > 0) note('Left out ' + codeBlocks + (codeBlocks === 1 ? ' block of code.' : ' blocks of code.'))
  if (wordless > 0) note('Left out ' + wordless + (wordless === 1 ? ' line with no words in it.' : ' lines with no words in them.'))
  return out
}

/** Which lines are headings though nothing marks them as one, and how deep every line sits. */
function levels(toks: Tok[]): void {
  const capsShare = toks.filter((t) => isCaps(t.text)).length / Math.max(1, toks.length)
  toks.forEach((t, i) => {
    const next = toks[i + 1], after = toks[i + 2]
    if (t.hash >= 0 || t.bulleted || t.table || t.asks || t.pair?.strong || t.indent > 1) return
    // The first line, alone over a blank line, with a list under it: the title, even if it reads as two parts. But
    // only when it does not look like the lines under it: it is a few words long, or they are bulleted and it is not.
    if (i === 0 && next?.blankBefore && toks.length >= 4 && (words(t.whole) >= 3 || toks.slice(1).some((x) => x.bulleted))) {
      t.soft = true; t.guessed = true; t.pair = null; t.admin = false; t.text = t.whole.replace(/\s*:$/, '')
      return
    }
    const overList = !t.pair && next !== undefined && next.hash < 0 && (next.bulleted || next.indent > t.indent)
    const overPairs = !t.pair && next?.pair != null && after?.pair != null && !next.admin && !after.admin
    const marked = t.colon || t.bold || isLabelled(t.text) || (isCaps(t.text) && capsShare < 0.5 && !t.pair)
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
function fronts(cards: Card[]): string {
  let s = ''
  for (const c of cards) {
    const next = s ? s + ', ' + c.q : c.q
    if (next.length > TEXT.name - 1) return s ? s + '…' : fit(c.q, TEXT.name)
    s = next
  }
  return s
}

/** Read a learner's own text into topics. Never throws. */
export function read(input: string, opts: ReadOptions = {}): Draft {
  const notes: string[] = []
  const said = new Set<string>()
  const note = (n: string, key = n): void => { if (!said.has(key)) { said.add(key); notes.push(n) } }

  let lines = String(input).normalize('NFC').replace(LINE_END, '\n').replace(SPACES, ' ').replace(WIDE_COLON, ': ').replace(WIDE_EQUALS, ' = ').replace(UNSEEN, '').split('\n')
  if (lines.length > TEXT.lines) {
    note('Read the first ' + TEXT.lines + ' lines only; the text has ' + lines.length + '.')
    lines = lines.slice(0, TEXT.lines)
  }
  // No name or note is as long as this, and a line read only so far cannot keep a pattern busy for long.
  const long = lines.filter((l) => l.length > TEXT.line).length
  if (long > 0) {
    note('Read only the first ' + TEXT.line + ' characters of ' + long + (long === 1 ? ' very long line.' : ' very long lines.'))
    lines = lines.map((l) => (l.length > TEXT.line ? l.slice(0, TEXT.line) : l))
  }
  const toks = tokens(lines, note)
  levels(toks)

  // What is about the course and not in it is left out, with everything under it.
  const dropped: string[] = []
  const size = (n: Node): number => n.children.reduce((sum, c) => sum + 1 + size(c), 0)
  const prune = (ns: Node[]): Node[] => ns.filter((n) => {
    if (!n.tok.admin) { n.children = prune(n.children); return true }
    const under = size(n)
    dropped.push((n.tok.pair ? n.tok.pair.left : n.tok.text) + (under ? ' (and the ' + under + (under === 1 ? ' line' : ' lines') + ' under it)' : ''))
    return false
  })
  let top = prune(tree(toks))
  if (dropped.length) note('Left out, as not something to learn: ' + dropped.slice(0, 6).join(', ') + (dropped.length > 6 ? ', and ' + (dropped.length - 6) + ' more' : ''))

  // One heading over everything is the title of the whole thing.
  let title = ''
  let over: Node | null = null
  const only = top[0]
  if (top.length === 1 && only && only.children.length > 0) {
    title = fit(headingText(only), TEXT.title)
    // A plain line taken for the title is not a topic any more, and a person should know that it was.
    if (only.tok.guessed) note('Read as the title of the whole list, not as a topic: ' + title)
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
    if (opts.pairs) return opts.pairs === 'cards'
    const mine = ns.filter((n) => n.children.length === 0)
    const paired = mine.filter((n) => n.tok.pair)
    const fitting = paired.filter((n) => n.tok.pair && fitsCard(n.tok.pair))
    const like = fitting.filter((n) => n.tok.pair && cardLike(n.tok.pair)).length
    return fitting.length >= 3 && like >= 0.8 * fitting.length && paired.length >= 0.6 * mine.length
  }
  let asCards = 0

  const topics: DraftTopic[] = []
  const taken = new Set<string>()
  const add = (t: DraftTopic, spare: boolean): void => {
    let name = t.name
    // A name has a letter or a number in it. A set of cards whose questions are all signs is still a set of cards.
    if (!worded(name) && !/^https?:/i.test(name)) {
      if (!spare) return note('Left out a line whose first part has no words in it.', 'wordless')
      name = 'Cards'
    }
    if (taken.has(name.toLowerCase())) {
      // A set of cards is kept under a name of its own; a topic that is there twice is left out.
      if (!spare) return note('Left out, because it is there twice: ' + name, 'twice:' + name.toLowerCase())
      const base = name
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = fit(base, TEXT.name - (' (' + i + ')').length) + ' (' + i + ')'
    }
    taken.add(name.toLowerCase())
    topics.push({ ...t, name })
  }

  let bodies = 0
  const within = (ns: Node[], parent: Node | null, group: string, middle: string[]): void => {
    if (parent && parent.tok.body.length) bodies++
    const here = cardsUnder(ns)
    // What can only be a card (a question and its answer, a table) is one, unless the reader was told otherwise.
    const isCard = (n: Node): boolean => n.tok.pair !== null && fitsCard(n.tok.pair) && (here || (opts.pairs === undefined && n.tok.pair.strong))
    const cards = ns.filter((n) => n.children.length === 0 && isCard(n))
    asCards += cards.length
    let cardsDone = false
    for (const n of ns) {
      if (n.children.length > 0) {
        const mine = headingText(n)
        // The first heading down is the group; the ones under it are said in the line on what to read.
        within(n.children, n, group || fit(mine, TEXT.group), group ? [...middle, mine] : middle)
        continue
      }
      if (isCard(n)) {
        if (cardsDone) continue
        cardsDone = true
        const all: Card[] = []
        const seen = new Set<string>()
        for (const c of cards) {
          const p = c.tok.pair
          if (!p) continue
          if (seen.has(p.left.toLowerCase())) { note('Left out, because it is there twice: ' + p.left, 'twice:' + p.left.toLowerCase()); continue }
          seen.add(p.left.toLowerCase())
          all.push({ q: p.left, a: p.right })
        }
        const sets = shares(all, TEXT.bundle)
        const under = parent ? headingText(parent) : ''
        sets.forEach((set, i) => {
          const tag = ' (' + (i + 1) + ')'
          const name = under ? (sets.length > 1 ? fit(under, TEXT.name - tag.length) + tag : fit(under, TEXT.name)) : fronts(set)
          const list = set.length + (set.length === 1 ? ' card: ' : ' cards: ') + set.map((c) => c.q).join(', ')
          // Sets under one heading are grouped by it; one set under a heading stands where the heading stood.
          const g = under && sets.length > 1 && !group ? fit(under, TEXT.group) : parent && group === fit(under, TEXT.group) && sets.length === 1 ? '' : group
          add({ name, summary: fit(list, TEXT.summary), kind: 'facts', group: g, cards: set }, true)
        })
        continue
      }
      const p = n.tok.pair
      const whole = p ? p.left : n.tok.text
      const name = fit(whole, TEXT.name)
      if (name !== whole) note('Shortened, with the whole line kept as what to read: ' + name, 'short:' + name)
      const parts = [name !== whole ? whole : '', p ? p.right : '', n.tok.body.join(' '), n.tok.aside.join(' '), n.tok.links.join(' '), middle.length ? 'Part of ' + middle.join(' › ') + '.' : ''].filter(Boolean)
      const summary = parts.join(name !== whole && p ? ': ' : ' ')
      if (summary.length > TEXT.summary) note('Cut short, the line on what to read for: ' + name, 'cut:' + name)
      add({ name, summary: fit(summary, TEXT.summary), kind: kindOf(whole), group, cards: [] }, false)
    }
  }
  within(top, over, '', [])
  if (bodies > 0) note('Left out the text under ' + bodies + (bodies === 1 ? ' heading.' : ' headings.'))

  const shown = notes.length > TEXT.notes + 1 ? [...notes.slice(0, TEXT.notes), 'And ' + (notes.length - TEXT.notes) + ' more like these.'] : notes
  return { title, topics, notes: shown, pairs, pairsAs: opts.pairs ?? (pairs > 0 && 2 * asCards >= pairs ? 'cards' : 'topics') }
}
