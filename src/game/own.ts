// A field of your own, on screen: adding topics from whatever a learner pastes, the list of a field's topics, and the
// plain words a home-made topic is shown in. Pure strings and plain data, so all of it is tested without a browser.
// Everything a learner typed is escaped before it reaches the page.
import { HARVEST_NAMES, LAYER_NAMES, type Catalog, type Seed } from '../engine/catalog'
import { KINDS, KIND_ORDER, OWN_TODAY, isOwnId, kindLabel, kindOfLayer, whyOwnSeed, type OwnField, type OwnSeed } from '../engine/own'
import { TEXT, type Card, type Draft } from '../engine/reader'
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
  /** Topics left out because the field has one of that name. */
  already: number
  /** Topics left out because the field has no room for them. */
  over: number
  /** Topics left out because the farm would not take them as they are. The reader should never make one. */
  unfit: number
}

/** What a reading would add to a field: the topics it has not got, as many as it has room for. */
export function toAdd(draft: Draft, field: Pick<OwnField, 'id' | 'seeds'>, rand: () => number = Math.random): Adding {
  const have = new Set(field.seeds.map((s) => s.name.trim().toLowerCase()))
  const ids = new Set(field.seeds.map((s) => s.id))
  const fresh = draft.topics.filter((t) => !have.has(t.name.trim().toLowerCase()))
  // One topic the farm would refuse must not take the whole batch down with it.
  const fit = fresh.filter((t) => whyOwnSeed({ id: field.id + '_000000', ...t }) === null)
  const room = Math.max(0, OWN_TODAY.seeds - field.seeds.length)
  const seeds = fit.slice(0, room).map((t): OwnSeed => ({ id: newSeedId(field.id, ids, rand), name: t.name, kind: t.kind, summary: t.summary, group: t.group, cards: t.cards.map((c) => ({ ...c })) }))
  return { seeds, already: draft.topics.length - fresh.length, over: fit.length - seeds.length, unfit: fresh.length - fit.length }
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
    ...draft.notes,
    ...(adding.already ? [(adding.already === 1 ? '1 is' : adding.already + ' are') + ' in the field already, and left out.'] : []),
    ...(adding.over ? ['A field holds ' + OWN_TODAY.seeds + ' topics. ' + (adding.over === 1 ? '1 does' : adding.over + ' do') + ' not fit, and ' + (adding.over === 1 ? 'is' : 'are') + ' left out.'] : []),
    ...(adding.unfit ? [(adding.unfit === 1 ? '1 line' : adding.unfit + ' lines') + ' could not be made into a topic, and ' + (adding.unfit === 1 ? 'is' : 'are') + ' left out.'] : []),
  ]
  const checks = notes.length ? '<h3>Check these</h3><ul>' + notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : ''
  if (adding.seeds.length === 0) return '<p class="sub">' + (draft.topics.length ? 'Nothing new to add.' : 'Nothing to add yet. One topic to a line is enough.') + '</p>' + checks
  const cards = adding.seeds.reduce((n, s) => n + s.cards.length, 0)
  const pairs = draft.pairs > 0
    ? '<p class="sub">' + plural(draft.pairs, 'line') + ' came in two parts, like “Hund - dog”. A short pair makes a question card; a name and a sentence make a topic with a note.</p><div class="tabs">' +
      WAYS.map(([way, label]) => '<button type="button" data-act="ownPairs" data-arg="' + way + '"' + ((told ?? '') === way ? ' class="on"' : '') + '>' + label + '</button>').join('') + '</div>'
    : ''
  const shown = adding.seeds.slice(0, SHOWN)
  return (
    '<p>The game read this as <b>' + plural(adding.seeds.length, 'topic') + '</b>' + (cards ? ', with ' + plural(cards, 'question card') + ' in ' + (cards === 1 ? 'it' : 'them') : '') + '.</p>' + pairs +
    '<div class="reading">' + grouped(shown, (s) => topicRow(s)) + (adding.seeds.length > SHOWN ? '<p class="sub">… and ' + (adding.seeds.length - SHOWN) + ' more.</p>' : '') + '</div>' + checks
  )
}

/** The sheet where a learner pastes what they have. `first` is true straight after the field was made. */
export function addSheetHtml(field: Pick<OwnField, 'id' | 'title' | 'color'>, first: boolean): string {
  return (
    chipHtml(field.title, field.color) + '<h2>What is in ' + esc(field.title) + '?</h2>' +
    '<p>Paste whatever you have: a syllabus, a contents page, your notes, a word list, flashcards, or what an AI chat wrote for you. Or just type, one topic to a line. The game works out the rest.</p>' +
    '<label for="ownText" class="sub">Your topics</label>' +
    '<textarea id="ownText" class="write" rows="7" data-min="1" data-gate="ownAdd" data-quiet autocomplete="off" spellcheck="false" placeholder="Photosynthesis&#10;Cell division - read chapter 4&#10;Hund = dog"></textarea>' +
    '<div class="branches"><label class="filebtn">Choose a file<input type="file" id="ownFile" accept=".txt,.md,.csv,.tsv,text/*"></label>' +
    '<button type="button" data-act="ownPrompt" data-arg="' + esc(field.id) + '">Copy a prompt for an AI chat</button></div>' +
    '<div id="ownReading" aria-live="polite"><p class="sub">Nothing to add yet. One topic to a line is enough.</p></div>' +
    '<p class="sub">A topic takes about ten days to grow from seed to tree, and you can plant ' + RULES.newSeedsPerDay + ' new ones a day. Lines like “Hund = dog” become question cards, which are quicker to water than a topic you explain in writing.</p>' +
    '<div class="foot"><button type="button" data-act="' + (first ? 'close' : 'ownBack') + '" data-arg="' + esc(field.id) + '">' + (first ? 'Skip for now' : 'Back') + '</button>' +
    '<button type="button" class="pri" id="ownAdd" data-act="ownAdd" data-arg="' + esc(field.id) + '" disabled>Add topics</button></div>'
  )
}

/** What to ask an AI chat for, so that its answer pastes straight in. The game itself never talks to one. */
export function aiPrompt(subject: string): string {
  return [
    'I am learning: ' + subject.trim(),
    '',
    'Make me a study list that I can paste into a learning game. Give only the list: no introduction, no closing remarks, no table.',
    '',
    'Use exactly this shape:',
    '',
    '## A heading for each part',
    '- Topic name: one line on what to read or practise',
    '',
    'Rules:',
    '- 3 to 8 parts, in the order I should learn them, and 4 to 8 topics under each.',
    '- A topic name is short: 6 words at most.',
    '- Where a part is facts to memorise (words, dates, formulas, names), do not write topics for it. Write 6 to 8 lines under its heading in the form',
    '  question = answer',
    '  with a short answer.',
  ].join('\n')
}

/* ---------- a field's topics ---------- */

/** The tree sheet for a field of the farmer's own: its topics as a list, and what can be done with them. */
export function fieldSheetHtml(field: OwnField, state: Pick<FarmState, 'crops' | 'focus'>, catalog: Catalog): string {
  const crop = (s: OwnSeed) => cropOf(state, s.id)
  const growing = field.seeds.filter((s) => { const c = crop(s); return c !== undefined && !c.perennial }).length
  const rooted = field.seeds.filter((s) => crop(s)?.perennial === true).length
  const planted = growing + rooted
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
    (field.seeds.length
      ? grouped(field.seeds, row) + focus + '<p class="sub">Plant a topic from the seed bag. One that is in the ground can be changed but not removed.</p>'
      : '<p class="sub">No topics yet. Add some, then plant them from the seed bag.</p>')
  )
}

/** A card as a line of the box it is edited in. */
export const cardsText = (cards: readonly Card[]): string => cards.map((c) => c.q + ' = ' + c.a).join('\n')

/**
 * Cards from the lines of that box: "question = answer", or the two with a tab between. A line that still reads as one
 * of the cards the topic had (`known`) is that card, untouched, so that saving a topic never rewrites a card whose
 * question has an equals sign in it. A new line is parted at its last " = ": "2 + 2 = ? = 4" asks "2 + 2 = ?".
 */
export function cardsFromText(text: string, known: readonly Card[] = []): { cards: Card[]; unread: number } {
  const cards: Card[] = []
  const was = new Map(known.map((c) => [c.q + ' = ' + c.a, c]))
  let unread = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const same = was.get(line.trim())
    if (same) { cards.push({ ...same }); continue }
    const tab = line.indexOf('\t'), eq = line.lastIndexOf(' = ')
    const at = tab >= 0 ? tab : eq
    const q = at >= 0 ? line.slice(0, at).trim() : '', a = at >= 0 ? line.slice(at + (tab >= 0 ? 1 : 3)).trim() : ''
    if (q && a) cards.push({ q, a })
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
    '<select id="tKind" class="write">' + KIND_ORDER.map((k) => '<option value="' + k + '"' + (k === s.kind ? ' selected' : '') + '>' + esc(KINDS[k].label) + ' (' + esc(KINDS[k].such) + ')</option>').join('') + '</select>' +
    '<label for="tSummary" class="sub">What to read or do (optional)</label><textarea id="tSummary" class="write short" rows="2" data-keep maxlength="' + TEXT.summary + '">' + esc(s.summary) + '</textarea>' +
    '<label for="tGroup" class="sub">Group (optional)</label><input type="text" id="tGroup" class="write" data-quiet data-keep list="tGroups" maxlength="' + TEXT.group + '" value="' + esc(s.group) + '" autocomplete="off">' +
    '<datalist id="tGroups">' + groups.map((g) => '<option value="' + esc(g) + '">').join('') + '</datalist>' +
    '<label for="tCards" class="sub">Question cards (optional): one to a line, as question = answer. At most ' + TEXT.cards + '. A topic with cards is watered by answering them.</label>' +
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
