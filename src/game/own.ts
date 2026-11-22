// A field of your own, on screen: adding topics from whatever a learner pastes, the list of a field's topics, and the
// plain words a home-made topic is shown in. Pure strings and plain data, so all of it is tested without a browser.
// Everything a learner typed is escaped before it reaches the page.
import { HARVEST_NAMES, LAYER_NAMES, type Catalog, type Seed } from '../engine/catalog'
import { KINDS, KIND_ORDER, OWN_TODAY, TEXT, isOwnId, kindLabel, kindOfLayer, whyOwnSeed, type OwnField, type OwnSeed } from '../engine/own'
import { say, type Card, type Draft } from '../reader'
import { RULES, cropOf } from '../engine/rules'
import type { FarmState } from '../engine/types'
import { cropSprite, iconHtml } from './art/sprites'
import { chipHtml } from './sheets'
import { esc } from './util'
import { OWN_HARVEST } from './views'

/* ---------- ids and colours ---------- */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const letters = (n: number, rand: () => number): string => Array.from({ length: n }, () => DIGITS[Math.min(35, Math.floor(rand() * 36))] ?? '0').join('')

/** An id for a new field of the farmer's own. `taken` says whether the farm has it already. */
export function newFieldId(taken: (id: string) => boolean, rand: () => number = Math.random): string {
  for (;;) {
    const id = 'my_' + letters(8, rand)
    if (!taken(id)) return id
  }
}

/** An id for a new topic in a field. It is added to `taken`. */
export function newSeedId(field: string, taken: Set<string>, rand: () => number = Math.random): string {
  for (;;) {
    const id = field + '_' + letters(6, rand)
    if (!taken.has(id)) { taken.add(id); return id }
  }
}

/** Colours for fields of the farmer's own. None is the colour of one of the game's fields. */
export const OWN_COLORS: readonly string[] = ['#4DB6A4', '#E0706B', '#7E8CE0', '#B5C94A', '#C76BB0', '#B08D57', '#59C3D9', '#F2C84B', '#8FA3AD']

/** The first colour no field on the farm flies yet. */
export function pickColor(used: readonly string[]): string {
  const taken = used.map((c) => c.toUpperCase())
  return OWN_COLORS.find((c) => !taken.includes(c)) ?? OWN_COLORS[used.length % OWN_COLORS.length] ?? '#4DB6A4'
}

/* ---------- plain words for a topic of your own ---------- */

/** "Canopy layer" for one of the game's seeds; what kind of thing it is for one of the farmer's own. */
export const layerText = (seed: Pick<Seed, 'pack' | 'layer'>): string => kindLabel(seed) ?? LAYER_NAMES[seed.layer] + ' layer'

/** How a seed is harvested, as its tag says it. */
export const harvestTag = (seed: Pick<Seed, 'pack' | 'harvest'>): string => (isOwnId(seed.pack) ? OWN_HARVEST[seed.harvest] : HARVEST_NAMES[seed.harvest])

/** What a watering by writing asks for, as HTML. A skill is not explained: it is done, and then told. */
export function explainAsk(seed: Pick<Seed, 'pack' | 'layer' | 'name'>): string {
  const name = '<b>' + esc(seed.name) + '</b>'
  if (isOwnId(seed.pack) && kindOfLayer(seed.layer) === 'skill') return 'This one is for doing: ' + name + '. Say what you did today, and how it went. Write first; your notes are hidden until you submit.'
  return 'Explain ' + name + ' in your own words. Write first; your notes are hidden until you submit.'
}

/* ---------- adding topics ---------- */

export interface Adding {
  /** What would be added, with ids of their own. */
  seeds: OwnSeed[]
  /** Topics the field has that had nothing to ask, as they would be with the questions read for them. */
  filled: OwnSeed[]
  /** Topics left out because the field has one of that name, with questions of its own or with none read for it. */
  already: number
  /** Topics left out because the field has no room for them. */
  over: number
  /** Topics left out because the farm would not take them as they are. The reader should never make one. */
  unfit: number
}

const copied = (cards: readonly Card[]): Card[] => cards.map((c) => ({ q: c.q, a: c.a, ...(c.wrong && c.wrong.length ? { wrong: [...c.wrong] } : {}) }))

/** A name as a topic is known by it: capitals and marks make no difference. */
const known = (name: string): string => name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * What a reading would add to a field: the topics it has not got, as many as it has room for, and questions for the
 * topics it has that had none. A topic that is there keeps everything but its cards. A chat that is asked for
 * questions on a topic seldom writes its name back exactly, so a topic is known by its name without capitals and
 * marks, and failing that without the number a chat set before it or the "(2)" the reader set after it.
 */
export function toAdd(draft: Draft, field: Pick<OwnField, 'id' | 'seeds'>, rand: () => number = Math.random): Adding {
  const have = new Map<string, OwnSeed>()
  // Of two topics of one name, the one with nothing to ask is the one that questions are for.
  for (const s of field.seeds) {
    const was = have.get(known(s.name))
    if (!was || (was.cards.length > 0 && s.cards.length === 0)) have.set(known(s.name), s)
  }
  const ids = new Set(field.seeds.map((s) => s.id))
  const fresh: Draft['topics'] = []
  const filled: OwnSeed[] = []
  let already = 0
  for (const t of draft.topics) {
    const whole = t.name.replace(/\s*\(\d+\)\s*$/, '')
    const had = have.get(known(t.name)) ?? have.get(known(whole)) ?? have.get(known(whole).replace(/^\d+(?: \d+)* /, ''))
    if (!had) { fresh.push(t); continue }
    const filling = filled.find((s) => s.id === had.id)
    const room = TEXT.cards - (filling?.cards.length ?? 0)
    const given: OwnSeed = { ...had, cards: [...(filling?.cards ?? []), ...copied(t.cards).slice(0, room)] }
    if (had.cards.length > 0 || t.cards.length === 0 || room <= 0 || whyOwnSeed(given) !== null) { already++; continue }
    if (filling) filling.cards = given.cards
    else filled.push(given)
  }
  // One topic the farm would refuse must not take the whole batch down with it.
  const fit = fresh.filter((t) => whyOwnSeed({ id: field.id + '_000000', ...t }) === null)
  const room = Math.max(0, OWN_TODAY.seeds - field.seeds.length)
  const seeds = fit.slice(0, room).map((t): OwnSeed => ({ id: newSeedId(field.id, ids, rand), name: t.name, kind: t.kind, summary: t.summary, group: t.group, cards: copied(t.cards) }))
  return { seeds, filled, already, over: fit.length - seeds.length, unfit: fresh.length - fit.length }
}

const plural = (n: number, one: string, many = one + 's'): string => n + ' ' + (n === 1 ? one : many)
/** A small picture of what a topic of this kind grows into. */
const picture = (kind: OwnSeed['kind']): string => iconHtml(cropSprite(KINDS[kind].layer, RULES.maxStage, false), 1)

/** How many topics of a long list the sheet shows. */
const SHOWN = 30

function topicRow(s: Pick<OwnSeed, 'name' | 'kind' | 'summary' | 'cards'>, extra = ''): string {
  const about = s.cards.length ? plural(s.cards.length, 'card') : s.summary
  return '<div class="row slim"><div class="n own">' + picture(s.kind) + '<span>' + esc(s.name) + '</span><small>' + esc(KINDS[s.kind].label) + (about ? ' · ' + esc(about) : '') + '</small></div>' + extra + '</div>'
}

/** A list of topics under the headings of their groups, in the order the groups first come. */
function grouped<T extends Pick<OwnSeed, 'group'>>(seeds: readonly T[], row: (s: T) => string): string {
  const groups: string[] = []
  for (const s of seeds) if (!groups.includes(s.group)) groups.push(s.group)
  // Topics under no heading get one of their own when others have theirs, so they do not seem to belong to the group before them.
  const heading = (g: string): string => (g ? esc(g) : groups.length > 1 ? 'Other topics' : '')
  return groups.map((g) => (heading(g) ? '<div class="fh">' + heading(g) + '</div>' : '') + '<div>' + seeds.filter((s) => s.group === g).map(row).join('') + '</div>').join('')
}

/** The ways lines in two parts can be read: as the reader sees fit, heading by heading, or all one way. */
const WAYS: readonly (readonly [string, string])[] = [['', 'Let the game decide'], ['cards', 'All as question cards'], ['topics', 'All as topics with a note']]

/**
 * What the reader made of a paste, for the learner to look over before they add it. `told` is how they said lines in
 * two parts are to be read, or null while the reader decides.
 */
export function readingHtml(draft: Draft, adding: Adding, told: 'cards' | 'topics' | null = null): string {
  const notes = [
    ...draft.notes.map(say),
    ...(adding.already ? [(adding.already === 1 ? '1 is' : adding.already + ' are') + ' in the field already, and left out.'] : []),
    ...(adding.over ? ['A field holds ' + OWN_TODAY.seeds + ' topics. ' + (adding.over === 1 ? '1 does' : adding.over + ' do') + ' not fit, and ' + (adding.over === 1 ? 'is' : 'are') + ' left out.'] : []),
    ...(adding.unfit ? [(adding.unfit === 1 ? '1 line' : adding.unfit + ' lines') + ' could not be made into a topic, and ' + (adding.unfit === 1 ? 'is' : 'are') + ' left out.'] : []),
  ]
  const checks = notes.length ? '<h3>Check these</h3><ul>' + notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : ''
  const fills = adding.filled.length
  const filling = fills ? '<p>' + plural(fills, 'topic') + ' you already have ' + (fills === 1 ? 'gets its' : 'get their') + ' questions.</p>' : ''
  if (adding.seeds.length === 0) return (filling || '<p class="sub">' + (draft.topics.length ? 'Nothing new to add.' : 'Nothing to add yet. One topic to a line is enough.') + '</p>') + checks
  const cards = adding.seeds.reduce((n, s) => n + s.cards.length, 0)
  // A topic with nothing to ask is watered by writing. A learner should know that before they add forty of them.
  const bare = adding.seeds.filter((s) => s.cards.length === 0).length
  const unasked = bare
    ? '<p class="sub"><b>' + bare + ' of them ' + (bare === 1 ? 'has' : 'have') + ' no questions</b>, so ' + (bare === 1 ? 'it is' : 'they are') + ' watered by explaining ' + (bare === 1 ? 'it' : 'them') +
      ' in writing, not by multiple choice. The prompt for an AI chat asks for questions under every topic.</p>'
    : ''
  const pairs = draft.pairs > 0
    ? '<p class="sub">' + plural(draft.pairs, 'line') + ' came in two parts, like “Hund - dog”. A short pair makes a question card; a name and a sentence make a topic with a note.</p><div class="tabs">' +
      WAYS.map(([way, label]) => '<button type="button" data-act="ownPairs" data-arg="' + way + '"' + ((told ?? '') === way ? ' class="on"' : '') + '>' + label + '</button>').join('') + '</div>'
    : ''
  const shown = adding.seeds.slice(0, SHOWN)
  return (
    '<p>The game read this as <b>' + plural(adding.seeds.length, 'topic') + '</b>' + (cards ? ', with ' + plural(cards, 'question card') + ' in ' + (cards === 1 ? 'it' : 'them') : '') + '.</p>' + filling + unasked + pairs +
    '<div class="reading">' + grouped(shown, (s) => topicRow(s)) + (adding.seeds.length > SHOWN ? '<p class="sub">… and ' + (adding.seeds.length - SHOWN) + ' more.</p>' : '') + '</div>' + checks
  )
}

/**
 * The sheet where a learner pastes what they have. `first` is true straight after the field was made, and `bare` is
 * how many of the field's topics have nothing to ask.
 */
export function addSheetHtml(field: Pick<OwnField, 'id' | 'title' | 'color'>, first: boolean, bare = 0): string {
  return (
    chipHtml(field.title, field.color) + '<h2>What is in ' + esc(field.title) + '?</h2>' +
    '<p>Paste whatever you have: a syllabus, a contents page, your notes, a word list, flashcards, or what an AI chat wrote for you. Or just type, one topic to a line. The game works out the rest.</p>' +
    '<label for="ownText" class="sub">Your topics</label>' +
    '<textarea id="ownText" class="write" rows="7" data-min="1" data-gate="ownAdd" data-quiet autocomplete="off" spellcheck="false" placeholder="Photosynthesis&#10;Cell division - read chapter 4&#10;Hund = dog"></textarea>' +
    '<div class="branches"><label class="filebtn">Choose a file<input type="file" id="ownFile" accept=".txt,.md,.csv,.tsv,text/*"></label>' +
    '<button type="button" data-act="ownPrompt" data-arg="' + esc(field.id) + '">Copy a prompt for an AI chat</button>' +
    (bare > 0 && !first
      ? '<button type="button" data-act="ownPromptFill" data-arg="' + esc(field.id) + '">Copy a prompt for questions on ' + (bare > FILL_AT_ONCE ? FILL_AT_ONCE + ' of your ' : 'your ') + plural(bare, 'topic') + ' without any</button>'
      : '') + '</div>' +
    '<div id="ownReading" aria-live="polite"><p class="sub">Nothing to add yet. One topic to a line is enough.</p></div>' +
    '<p class="sub">A topic takes about ten days to grow from seed to tree, and you can plant ' + RULES.newSeedsPerDay + ' new ones a day. A topic with question cards is watered by multiple choice; one without is watered by explaining it in writing. Lines like “Hund = dog” become cards, and the prompt for an AI chat asks it for questions under every topic. If you write in the box what you want to learn first, the prompt takes that along.</p>' +
    '<div class="foot"><button type="button" data-act="' + (first ? 'close' : 'ownBack') + '" data-arg="' + esc(field.id) + '">' + (first ? 'Skip for now' : 'Back') + '</button>' +
    '<button type="button" class="pri" id="ownAdd" data-act="ownAdd" data-arg="' + esc(field.id) + '" disabled>Add topics</button></div>'
  )
}

/** How much of what a learner wrote goes into the prompt. */
export const WANTS = 6000

/** The five questions asked before a chat is asked for a list, each answer with the words it is shown in. */
export const ABOUT = {
  purpose: [['work', 'Work'], ['exam', 'An exam or course'], ['hobby', 'A hobby'], ['talk', 'Talking with people'], ['curious', 'Just curious']],
  level: [['new', 'Starting from nothing'], ['basics', 'I know the basics'], ['using', 'I use it already']],
  amount: [['taste', 'A taste'], ['working', 'Working knowledge'], ['thorough', 'Thorough']],
  mode: [['know', 'Mostly knowing'], ['do', 'Mostly doing'], ['both', 'Both']],
} as const
export type Question = keyof typeof ABOUT
/** What a learner answered. A question left unanswered is left out; `lean` is what to lean on or leave out. */
export type About = { [Q in Question]?: (typeof ABOUT)[Q][number][0] } & { lean?: string }
/** About how many topics each answer to "How much?" asks for. */
export const AMOUNT = { taste: 10, working: 25, thorough: 40 } as const
const PARTS = { taste: '2 or 3 parts', working: '4 or 5 parts', thorough: '5 to 8 parts' } as const

/** What the answers to "What is it for?", "Where are you now?" and "Knowing or doing?" tell the chat, a line each. */
export function aboutLines(about: About): string[] {
  const purpose = { work: 'my work', exam: 'an exam or a course', hobby: 'a hobby', talk: 'talking with people', curious: 'my own curiosity' } as const
  const level = {
    new: 'I am starting from nothing: begin with the very basics.',
    basics: 'I know the basics already: skip them and start one step beyond.',
    using: 'I use it already: leave out what anyone who uses it knows, and cover what experienced people still get wrong.',
  } as const
  const mode = {
    know: 'Most of my topics should be things to understand and remember.',
    do: 'Most of my topics should be things to do, each with a "Practise:" line.',
    both: 'I want a mix of things to understand and things to do.',
  } as const
  return [
    ...(about.purpose ? ['I want it for ' + purpose[about.purpose] + ': choose the topics and questions that matter for that.'] : []),
    ...(about.level ? [level[about.level]] : []),
    ...(about.mode ? [mode[about.mode]] : []),
  ]
}
/** How many topics one prompt asks for questions on. A chat writes only so much in one answer. */
export const FILL_AT_ONCE = 20

/**
 * What to ask an AI chat for, so that its answer pastes straight in: a list of topics, each with a line on what to
 * read and questions with their wrong answers. The game itself never talks to one. `wants` is what the learner wrote
 * about what they are after, or have so far. Given a field's topics, it asks instead for questions on the first of
 * them that have none. `about` holds the learner's answers to the five questions; asking about a field's own topics
 * does without them.
 *
 * The shape is said in words ("Part:", "Topic:", "Read:") and not in marks: a chat's page turns "## heading" into a
 * plain line before it is copied, and the words come through. The rules name the shapes weaker chats fall back on,
 * and one finished topic is shown, because an example is what they copy best.
 */
export function aiPrompt(subject: string, wants = '', have: readonly Pick<OwnSeed, 'name' | 'summary' | 'cards'>[] = [], about: About = {}): string {
  const bare = have.filter((s) => s.cards.length === 0).slice(0, FILL_AT_ONCE)
  // What is too long to go whole is cut at the end of a line.
  const all = [wants.trim(), about.lean?.trim() ?? ''].filter(Boolean).join('\n')
  const cut = all.length > WANTS ? all.slice(0, WANTS) : all
  const said = (all.length > WANTS && cut.includes('\n') ? cut.slice(0, cut.lastIndexOf('\n')) : cut).trim()
  const plainly = 'Give only the list, as plain text: no introduction, no closing remarks, no table, no bold, no numbering. End on the last question line.'
  const question = 'A question about that topic? = the right answer | a wrong answer | another wrong answer | a third wrong answer'
  const rules = [
    '- A question and all its answers are one line: the question, " = ", the right answer, then three wrong answers with " | " between them. No "A) B) C)" lines, no "Answer:" line, no "Q:".',
    '- Every answer is short: 8 words at most. The wrong answers must be believable: the same kind of thing as the right one, and about as long.',
    '- A question makes sense by itself, and tests understanding of the topic, not the wording of this list.',
    '- Do not use "=" or "|" anywhere else. Write an operator in words, such as "double bar" or "equals".',
  ]
  const example = [
    'Which planet is closest to the Sun? = Mercury | Venus | Earth | Mars',
    'Which planet is known as the red planet? = Mars | Venus | Jupiter | Mercury',
  ]
  if (bare.length > 0) {
    return [
      'I am learning: ' + subject.trim(),
      '',
      'Write quiz questions for my topics below, to paste into a learning game. ' + plainly,
      '',
      'Use exactly these line shapes:',
      '',
      'Topic: the name of the topic',
      question,
      '',
      'Rules:',
      '- Copy each of my "Topic:" lines exactly as I wrote it: no quotation marks, no bold, no number, no changed capitals or words. Leave no topic out, and add none.',
      '- Under every topic, 4 to 6 question lines.',
      ...rules,
      '',
      'An example of one topic, to show the shape. Do not copy it:',
      '',
      'Topic: The inner planets',
      ...example,
      '',
      'My topics:',
      ...bare.flatMap((s) => ['Topic: ' + s.name, ...(s.summary ? ['Read: ' + s.summary] : [])]),
    ].join('\n')
  }
  const me = aboutLines(about)
  const size = about.amount
    ? 'Otherwise make ' + PARTS[about.amount] + ', in the order I should learn them, with about ' + AMOUNT[about.amount] + ' topics in all.'
    : 'Otherwise make 3 to 6 parts, in the order I should learn them, with 3 to 6 topics in each.'
  return [
    'I am learning: ' + subject.trim(),
    ...(me.length ? ['', ...me] : []),
    ...(said ? ['', 'What I want from it, or what I have so far:', said] : []),
    '',
    'Write me a study list with quiz questions, to paste into a learning game. ' + plainly,
    '',
    'Use exactly these line shapes:',
    '',
    'Part: the name of a part of the subject',
    'Topic: the name of one topic in that part',
    'Read: one line on what to read for that topic',
    question,
    '',
    'Rules:',
    '- If what I wrote above is already a list of topics, keep its parts and topics as they are. ' + size,
    '- Write "Part:" and "Topic:" exactly so, with no number after them. A topic name is short: 6 words at most.',
    '- Under every topic, one "Read:" line and then 4 to 6 question lines. Where a topic is something to do and not something to understand, write "Practise:" in place of "Read:".',
    ...rules,
    '',
    'An example of one topic, to show the shape. Do not copy it:',
    '',
    'Part: The solar system',
    'Topic: The inner planets',
    'Read: the four rocky planets and what sets each apart',
    ...example,
  ].join('\n')
}

/* ---------- a field's topics ---------- */

/** The tree sheet for a field of the farmer's own: its topics as a list, and what can be done with them. */
export function fieldSheetHtml(field: OwnField, state: Pick<FarmState, 'crops' | 'focus'>, catalog: Catalog): string {
  const crop = (s: OwnSeed) => cropOf(state, s.id)
  const growing = field.seeds.filter((s) => { const c = crop(s); return c !== undefined && !c.perennial }).length
  const rooted = field.seeds.filter((s) => crop(s)?.perennial === true).length
  const planted = growing + rooted
  const bare = field.seeds.filter((s) => s.cards.length === 0).length
  const status = (s: OwnSeed): string => {
    const c = crop(s)
    return !c ? 'not planted' : c.perennial ? (c.wilted ? 'rooted, wilted' : 'rooted') : c.wilted ? 'wilted' : 'growing, stage ' + (c.stage + 1) + ' of ' + (RULES.maxStage + 1)
  }
  const row = (s: OwnSeed): string =>
    '<div class="row slim"><div class="n own">' + picture(s.kind) + '<span>' + esc(s.name) + '</span><small>' + esc(KINDS[s.kind].label) + (s.cards.length ? ' · ' + plural(s.cards.length, 'card') : '') + ' · ' + status(s) + '</small></div>' +
    '<button type="button" data-act="ownEdit" data-arg="' + esc(s.id) + '">Edit</button></div>'
  const branches = catalog.pack(field.id)?.branches ?? []
  const focus = branches.length > 1
    ? '<p class="sub">Pick a group to focus on; the seed bag puts it first.</p><div class="branches">' + branches.map((b) => {
      const on = state.focus[field.id] === b.id
      return '<button type="button" data-act="focus" data-arg="' + esc(field.id) + '|' + esc(b.id) + '"' + (on ? ' class="pri"' : '') + '>' + (on ? 'Focus: ' : 'Focus on ') + esc(b.title) + '</button>'
    }).join('') + '</div>'
    : ''
  return (
    '<p>A field of your own: <b>' + esc(field.title) + '</b>. ' + plural(field.seeds.length, 'topic') + (growing ? ' · ' + growing + ' growing' : '') + (rooted ? ' · ' + rooted + ' rooted' : '') + '.</p>' +
    '<div class="branches"><button type="button" class="pri" data-act="ownAddOpen" data-arg="' + esc(field.id) + '">Add topics</button>' +
    '<button type="button" data-act="ownRename" data-arg="' + esc(field.id) + '">Rename</button>' +
    (planted === 0 ? '<button type="button" data-act="ownDrop" data-arg="' + esc(field.id) + '">Remove this field</button>' : '') + '</div>' +
    (bare ? '<p class="sub">' + plural(bare, 'topic') + (bare === 1 ? ' has' : ' have') + ' no questions, so ' + (bare === 1 ? 'it is' : 'they are') + ' watered by explaining in writing. Under “Add topics” there is a prompt that gets questions for ' + (bare === 1 ? 'it' : 'them') + ' from an AI chat.</p>' : '') +
    (field.seeds.length
      ? grouped(field.seeds, row) + focus + '<p class="sub">Plant a topic from the seed bag. One that is in the ground can be changed but not removed.</p>'
      : '<p class="sub">No topics yet. Add some, then plant them from the seed bag.</p>')
  )
}

/** A card as a line of the box it is edited in: its question, its answer, and after that the wrong answers it has. */
const cardLine = (c: Card): string => c.q + ' = ' + c.a + (c.wrong && c.wrong.length ? ' | ' + c.wrong.join(' | ') : '')
export const cardsText = (cards: readonly Card[]): string => cards.map(cardLine).join('\n')

/**
 * Cards from the lines of that box: "question = answer", or the two with a tab between. `known` are the cards the
 * topic had. A line that still says one of them is that card, untouched, and a line that still begins with one's
 * question keeps that question, so that saving a topic never moves the place where a card is parted. A line that is
 * new is parted at its first " = ", as the reader parts it ("Force = F = ma"), unless what comes before its last one
 * is a question ("2 + 2 = ? = 4"). What follows the answer of a new or changed line, each after an upright bar, are
 * wrong answers to show with it.
 */
export function cardsFromText(text: string, known: readonly Card[] = []): { cards: Card[]; unread: number } {
  const cards: Card[] = []
  const left = known.slice()
  let unread = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const same = left.findIndex((c) => cardLine(c) === line)
    const was = left[same]
    if (was) { cards.push({ ...was }); left.splice(same, 1); continue }
    let q = '', a = ''
    const tab = line.indexOf('\t')
    const kept = left.findIndex((c) => line.startsWith(c.q + ' = '))
    const keeps = left[kept]
    if (tab >= 0) { q = line.slice(0, tab).trim(); a = line.slice(tab + 1).trim() }
    else if (keeps) { q = keeps.q; a = line.slice(keeps.q.length + 3).trim(); left.splice(kept, 1) }
    else {
      const first = line.indexOf(' = '), last = line.lastIndexOf(' = ')
      const at = last > first && /[?？]\s*$/.test(line.slice(0, last)) ? last : first
      if (at >= 0) { q = line.slice(0, at).trim(); a = line.slice(at + 3).trim() }
    }
    const [answer = '', ...others] = a.split('|').map((x) => x.trim())
    const wrong: string[] = []
    for (const w of others) if (w && w.toLowerCase() !== answer.toLowerCase() && !wrong.some((x) => x.toLowerCase() === w.toLowerCase()) && wrong.length < TEXT.wrong) wrong.push(w)
    if (q && answer) cards.push({ q, a: answer, ...(wrong.length ? { wrong } : {}) })
    else unread++
  }
  return { cards, unread }
}

/** The sheet where one topic is changed. A topic in the ground can be changed, but it stays. */
export function topicSheetHtml(field: OwnField, s: OwnSeed, planted: boolean): string {
  const groups = [...new Set(field.seeds.map((x) => x.group).filter(Boolean))]
  return (
    chipHtml(field.title, field.color) + '<h2>Change a topic</h2>' +
     '<label for="tName" class="sub">Name</label><input type="text" id="tName" class="write" data-quiet data-keep maxlength="' + TEXT.name + '" value="' + esc(s.name) + '" autocomplete="off">' +
    '<label for="tKind" class="sub">What kind of thing is it? This decides how it is drawn, asked about and harvested.</label>' +
    '<select id="tKind" class="write" data-keep>' + KIND_ORDER.map((k) => '<option value="' + k + '"' + (k === s.kind ? ' selected' : '') + '>' + esc(KINDS[k].label) + ' (' + esc(KINDS[k].such) + ')</option>').join('') + '</select>' +
    '<label for="tSummary" class="sub">What to read or do (optional)</label><textarea id="tSummary" class="write short" rows="2" data-keep maxlength="' + TEXT.summary + '">' + esc(s.summary) + '</textarea>' +
    '<label for="tGroup" class="sub">Group (optional)</label><input type="text" id="tGroup" class="write" data-quiet data-keep list="tGroups" maxlength="' + TEXT.group + '" value="' + esc(s.group) + '" autocomplete="off">' +
    '<datalist id="tGroups">' + groups.map((g) => '<option value="' + esc(g) + '">').join('') + '</datalist>' +
    '<label for="tCards" class="sub">Question cards (optional): one to a line, as question = answer. Wrong answers to show with it may follow, each after a “ | ”. At most ' + TEXT.cards + ' cards. A topic with cards is watered by answering them.</label>' +
    '<textarea id="tCards" class="write short" rows="4" data-keep spellcheck="false">' + esc(cardsText(s.cards)) + '</textarea>' +
    '<div class="foot"><button type="button" data-act="ownBack" data-arg="' + esc(field.id) + '">Back</button>' +
    (planted ? '' : '<button type="button" data-act="ownRemove" data-arg="' + esc(s.id) + '">Remove</button>') +
    '<button type="button" class="pri" data-act="ownSave" data-arg="' + esc(s.id) + '">Save</button></div>'
  )
}

/** The sheet that asks for a field's name: a new field, or a new name for one that is there. */
export function nameFieldSheetHtml(current: { id: string; title: string } | null): string {
  return (
    '<h2>' + (current ? 'Rename this field' : 'A field of your own') + '</h2>' +
    (current ? '' : '<p>What do you want to learn? Anything: a language, a course, an instrument, a job skill. It becomes a field on your farm, and you fill it with your own topics.</p>') +
    '<label for="ownName" class="sub">' + (current ? 'Its name' : 'Name it') + '</label>' +
    '<input type="text" id="ownName" class="write" data-keep maxlength="' + TEXT.title + '" value="' + esc(current?.title ?? '') + '" placeholder="German, Organic chemistry, Guitar…" autocomplete="off">' +
    '<div class="foot"><button type="button" data-act="' + (current ? 'ownBack' : 'close') + '" data-arg="' + esc(current?.id ?? '') + '">Not now</button>' +
    '<button type="button" class="pri" data-act="ownCreate" data-arg="' + esc(current?.id ?? '') + '">' + (current ? 'Save name' : 'Make the field') + '</button></div>'
  )
}
