// A field of the farmer's own: topics they brought themselves, kept in the farm's log and played by the game's rules.
//
// The log holds only what the farmer gave: a field's name and colour, and for each topic its name, its kind, a line on
// what to read, its group and its cards. Everything a rule reads is worked out here from that, the same way every time:
// a kind becomes a layer, a rubric and a harvest; a group becomes a branch; cards become questions, with the wrong
// answers borrowed from the other cards of the field. So a saved farm cannot carry a rule of its own making.
import { buildCatalog, type Catalog } from './catalog'
import { HIDDEN, TEXT, type Card, type Kind } from '../reader'
import type { BranchDef, Layer, Mcq, PackDef, SeedDef } from './types'
import { isRecord } from './util'

export interface OwnSeed {
  id: string
  name: string
  kind: Kind
  /** What to read or do. May be empty. */
  summary: string
  /** The heading it stands under in its field, or ''. */
  group: string
  cards: Card[]
}

export interface OwnField {
  id: string
  title: string
  color: string
  /** In the order they were added. */
  seeds: OwnSeed[]
}

/** A farm's own fields, by id, in the order they were made. Never changed in place: a change makes a new one. */
export type Own = Readonly<Record<string, OwnField>>

/** The most a farm's log may ever hold. These never go down: a farm that fits today fits for good. */
export const OWN = { fields: 20, seeds: 300 } as const
/** What the game asks of something done today: fields on the farm (the game's and the farmer's), and topics in one field. */
export const OWN_TODAY = { fields: 9, seeds: 150 } as const

// The game's own ids are made of letters, digits and hyphens, so nothing of the game's can ever look like one of these.
const FIELD_ID = /^my_[0-9a-z]{8}$/
const SEED_ID = /^my_[0-9a-z]{8}_[0-9a-z]{6}$/
export const isOwnFieldId = (id: unknown): id is string => typeof id === 'string' && FIELD_ID.test(id)
export const isOwnSeedId = (id: unknown): id is string => typeof id === 'string' && SEED_ID.test(id)
/** An id of a field or a topic the farmer made, not one of the game's. */
export const isOwnId = (id: string): boolean => FIELD_ID.test(id) || SEED_ID.test(id)
/** The field a topic's id says it belongs to. */
export const fieldOfSeed = (seedId: string): string => seedId.slice(0, 11)

const HEX = /^#[0-9A-Fa-f]{6}$/
export const isColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v)

/* ---------- the kinds of thing a topic can be ---------- */

export interface KindDef {
  /** How it is drawn, and where it stands in a field. */
  layer: Layer
  /** What a person calls it. */
  label: string
  /** A few examples, to finish "such as". */
  such: string
  /** What an explanation of it is rated against. */
  rubric: readonly string[]
  /** What its harvest asks for. */
  prompt: string
}

export const KINDS: Record<Kind, KindDef> = {
  facts: {
    layer: 'ground-cover', label: 'Facts to remember', such: 'words, dates, names',
    rubric: ['I wrote it from memory, without looking', 'I got the main ones right', 'I used some of it: in a sentence, an example or a case'],
    prompt: 'Write down what you remember of this, then use some of it: in a sentence, an example or a case.',
  },
  skill: {
    layer: 'herb', label: 'A skill to practise', such: 'a piece to play, a move, a method',
    rubric: ['I did it today, and did not just read about it', 'I did it without following a guide step by step', 'I know what to work on next'],
    prompt: 'Do it for real, start to finish. Then say what you did, or give a link to it.',
  },
  idea: {
    layer: 'shrub', label: 'An idea to understand', such: 'a concept, a cause, how something works',
    rubric: ['I wrote it from memory, without looking', 'It matches my notes on the main points', 'It gives an example, or a case where it does not hold'],
    prompt: 'Teach this to a friend in a few sentences, with one example.',
  },
  rule: {
    layer: 'understory', label: 'A rule or a pattern', such: 'a law, a formula, when to use what',
    rubric: ['I stated it from memory, without looking', 'It says when it holds, and when it does not', 'It works one example through'],
    prompt: 'State it, say when it holds and when it does not, and work one example through.',
  },
  whole: {
    layer: 'canopy', label: 'The big picture', such: 'an overview, how the parts fit',
    rubric: ['I wrote it from memory, without looking', 'It names the main parts', 'It says how the parts fit together'],
    prompt: 'Say the whole of it in a few sentences: the main parts, how they fit, and what it is for.',
  },
}
/** The kinds, in the order a person is offered them. */
export const KIND_ORDER: readonly Kind[] = ['idea', 'facts', 'skill', 'rule', 'whole']
const isKind = (v: unknown): v is Kind => typeof v === 'string' && Object.hasOwn(KINDS, v)
/** The kind a layer stands for in a field of the farmer's own. */
export const kindOfLayer = (layer: Layer): Kind => KIND_ORDER.find((k) => KINDS[k].layer === layer) ?? 'idea'
/** What kind of thing a topic of the farmer's own is, in a person's words, or null for one of the game's seeds: those are told by their layer. */
export const kindLabel = (seed: { pack: string; layer: Layer }): string | null => (isOwnId(seed.pack) ? KINDS[kindOfLayer(seed.layer)].label : null)

/* ---------- reading what a log holds ---------- */

/** A topic if the value has the shape of one, else null. Only what a topic is made of is kept. */
export function parseOwnSeed(raw: unknown): OwnSeed | null {
  if (!isRecord(raw)) return null
  const { id, name, kind, summary, group, cards } = raw
  if (!isOwnSeedId(id) || typeof name !== 'string' || !isKind(kind) || typeof summary !== 'string' || typeof group !== 'string' || !Array.isArray(cards)) return null
  const read: Card[] = []
  for (const c of cards) {
    if (!isRecord(c) || typeof c.q !== 'string' || typeof c.a !== 'string') return null
    read.push({ q: c.q, a: c.a })
  }
  return { id, name, kind, summary, group, cards: read }
}

// Everything the reader takes out of a paste as unseen, and tabs and line ends besides: a name or a card is one line.
const UNSEEN = new RegExp('[' + HIDDEN + '\\t\\n\\r\\u2028\\u2029]')
const CANNOT_SHOW = 'That text has characters the game cannot show.'
const within = (s: string, min: number, max: number): boolean => s.trim().length >= min && s.trim().length <= max

/** Why this cannot be the name of a field, or null. */
export function whyTitle(title: string): string | null {
  if (UNSEEN.test(title)) return CANNOT_SHOW
  return within(title, 1, TEXT.title) ? null : "A field's name is 1 to " + TEXT.title + ' characters.'
}

/** Why this cannot be a topic, or null. */
export function whyOwnSeed(s: OwnSeed): string | null {
  if (UNSEEN.test(s.name + s.summary + s.group + s.cards.map((c) => c.q + c.a).join(''))) return CANNOT_SHOW
  if (!within(s.name, 1, TEXT.name)) return "A topic's name is 1 to " + TEXT.name + ' characters.'
  if (!within(s.summary, 0, TEXT.summary)) return 'The line on what to read is at most ' + TEXT.summary + ' characters.'
  if (!within(s.group, 0, TEXT.group)) return "A group's name is at most " + TEXT.group + ' characters.'
  if (s.cards.length > TEXT.cards) return 'A topic holds at most ' + TEXT.cards + ' cards.'
  return s.cards.every((c) => within(c.q, 1, TEXT.q) && within(c.a, 1, TEXT.a)) ? null : 'A card has a question of 1 to ' + TEXT.q + ' characters and an answer of 1 to ' + TEXT.a + '.'
}

/** A topic as the farm keeps it: trimmed. */
export const tidySeed = (s: OwnSeed): OwnSeed =>
  ({ id: s.id, name: s.name.trim(), kind: s.kind, summary: s.summary.trim(), group: s.group.trim(), cards: s.cards.map((c) => ({ q: c.q.trim(), a: c.a.trim() })) })

/* ---------- a field as a pack ---------- */

/** A short, steady id for a group, from its name: a group keeps its branch whatever comes and goes around it. */
function branchId(title: string): string {
  if (title === '') return 'main'
  let h = 0x811c9dc5
  for (let i = 0; i < title.length; i++) { h ^= title.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return 'g' + (h >>> 0).toString(36)
}

/** How an answer reads, for telling two of them apart: put together the same way, trimmed, in small letters. */
const read = (s: string): string => s.normalize('NFC').trim().toLowerCase()
const isQuestion = (q: string): boolean => /[?？]\s*$/.test(q)
const asks = (q: string): string => (isQuestion(q) ? q : 'Which of these goes with “' + q + '”?')
/** A question that can be turned round and asked from its answer: a name, not a sentence. */
const turns = (c: Card): boolean => !isQuestion(c.q) && c.q.length <= 60

/**
 * The questions a field's cards make: each card asked forwards to water, and backwards to harvest. The wrong answers
 * are borrowed: from the other cards of the topic first, then from the rest of the field. The field's answers are
 * listed once, each a single time, and a card takes the next few from where it stands in that list. So a list sorted
 * by its answers ("der" fifty times, then "die") still finds the others, and the work for one card does not grow
 * with the field.
 */
function quiz(f: OwnField): Map<string, { water: Mcq[]; harvest: Mcq[] }> {
  const out = new Map<string, { water: Mcq[]; harvest: Mcq[] }>()
  const answers: string[] = []
  const names: string[] = []
  const seenAnswers = new Set<string>()
  const seenNames = new Set<string>()
  for (const s of f.seeds) {
    for (const c of s.cards) {
      if (!seenAnswers.has(read(c.a))) { seenAnswers.add(read(c.a)); answers.push(c.a) }
      if (turns(c) && !seenNames.has(read(c.q))) { seenNames.add(read(c.q)); names.push(c.q) }
    }
  }
  let at = 0
  for (const s of f.seeds) {
    const water: Mcq[] = []
    const harvest: Mcq[] = []
    s.cards.forEach((c, i) => {
      const from = at++
      /** Up to three wrong ones for `right`: the topic's own first, none that reads the same as it or as another. */
      const wrong = (right: string, mine: (x: Card) => string | null, field: readonly string[]): string[] => {
        const found: string[] = []
        const taken = new Set([read(right)])
        const take = (w: string | null | undefined): void => {
          if (w === null || w === undefined || taken.has(read(w))) return
          taken.add(read(w))
          found.push(w)
        }
        for (let k = 1; k < s.cards.length && found.length < 3; k++) { const other = s.cards[(i + k) % s.cards.length]; take(other ? mine(other) : null) }
        for (let k = 0; k < field.length && found.length < 3; k++) take(field[(from + k) % field.length])
        return found
      }
      const why = c.q + (isQuestion(c.q) ? ' ' : ': ') + c.a
      const answersFor = wrong(c.a, (x) => x.a, answers)
      if (answersFor.length < 2) return
      water.push({ q: asks(c.q), answer: c.a, distractors: answersFor, why })
      // Asked the other way round only when the question is a name, and the answer short enough to be a question.
      if (!turns(c) || c.a.length > 80) return
      const fronts = wrong(c.q, (x) => (turns(x) ? x.q : null), names)
      if (fronts.length >= 2) harvest.push({ q: asks(c.a), answer: c.q, distractors: fronts, why })
    })
    out.set(s.id, { water, harvest })
  }
  return out
}

const packs = new WeakMap<OwnField, PackDef>()

/**
 * A field of the farmer's own as the pack the game plays it by. Made once for each state of a field: a field that has
 * not changed is the same object, so a change to one field of a farm does not remake the others.
 */
export function ownPack(f: OwnField): PackDef {
  const made = packs.get(f)
  if (made) return made
  const groups: string[] = []
  for (const s of f.seeds) if (!groups.includes(s.group)) groups.push(s.group)
  if (groups.length === 0) groups.push('')
  const branches: BranchDef[] = []
  for (const g of groups) {
    const id = branchId(g)
    if (!branches.some((b) => b.id === id)) branches.push({ id, title: g || (groups.length === 1 ? f.title : 'Other topics') })
  }
  const questions = quiz(f)
  const seeds = f.seeds.map((s): SeedDef => {
    const k = KINDS[s.kind]
    const q = questions.get(s.id)
    const asked = q !== undefined && q.water.length > 0
    return {
      id: s.id, name: s.name, layer: k.layer, branch: branchId(s.group), tier: 0,
      harvest: asked ? 'recall' : s.kind === 'skill' ? 'artifact' : 'judged',
      ...(s.summary ? { summary: s.summary } : {}),
      rubric: [...k.rubric], prompts: [k.prompt],
      ...(asked ? { questions: q } : {}),
    }
  })
  // No end, so no readiness, no bar and no layer that waits for another: the farmer decides how much is enough.
  const pack: PackDef = { pack: f.id, version: 0, title: f.title, color: f.color, description: 'A field of your own.', perennial: true, branches, seeds }
  packs.set(f, pack)
  return pack
}

/* ---------- the catalog a farm plays by ---------- */

/** The game's own catalog behind one made for a farm. */
const bases = new WeakMap<Catalog, Catalog>()
const built = new WeakMap<Catalog, WeakMap<Own, Catalog>>()

/**
 * The catalog a farm plays by: the game's packs, and after them the farm's own fields. For a farm with none it is the
 * game's catalog itself. It is built once for each state of a farm's own fields, and it may be asked of the game's
 * catalog or of one already made for a farm: the answer is the same.
 */
export function catalogFor(catalog: Catalog, own: Own): Catalog {
  const base = bases.get(catalog) ?? catalog
  const fields = Object.values(own)
  if (fields.length === 0) return base
  let mine = built.get(base)
  if (!mine) { mine = new WeakMap(); built.set(base, mine) }
  let made = mine.get(own)
  if (!made) {
    made = buildCatalog([...base.packs, ...fields.map(ownPack)])
    mine.set(own, made)
    bases.set(made, base)
  }
  return made
}

/** The game's own catalog, whichever of the two it is handed. */
export const baseOf = (catalog: Catalog): Catalog => bases.get(catalog) ?? catalog
