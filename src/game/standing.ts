// Where the farm stands: at the market, and against its own past. What each sheet shows is worked
// out here from the farm and the packs, and drawn here as strings, so both can be tested without a browser.
import { LAYER_NAMES, type Catalog } from '../engine/catalog'
import { buyersFor, standing } from '../engine/market'
import { readiness } from '../engine/readiness'
import { RULES } from '../engine/rules'
import type { Crop, FarmState } from '../engine/types'
import { guildWhole } from '../engine/yields'
import { footHtml, noteHtml, writingBox } from './sheets'
import { esc } from './util'
import { packColor } from './views'

/** A pack's colour if it is one, else the game's green: it goes into a style, so nothing else may. */
const hex = (color: string): string => (/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#6DB24F')
const fieldHead = (title: string, color: string, tag = ''): string => '<div class="fh"><i style="background:' + hex(color) + '"></i>' + esc(title) + tag + '</div>'

/* ---------- the market ---------- */

export interface MarketBar {
  /** The title of the field the bar is for. */
  field: string
  color: string
  want: number
  /** The field's readiness today, or null if the farm does not have it. */
  have: number | null
  met: boolean
  /** "at 50 · bar 60", with what else stands in the way. */
  line: string
}

export interface MarketBuyer {
  id: string
  name: string
  note: string
  /** The title of the field the buyer stands in. */
  field: string
  color: string
  bars: MarketBar[]
  buying: boolean
  /** Sales already made to this buyer. */
  sales: number
}

export interface MarketView {
  /** The buyers who stand in a field the farm has, in pack order. */
  buyers: MarketBuyer[]
  /** How many of them are buying today. */
  buying: number
  /** Every sale, newest first, under the name its buyer has today. */
  sales: { day: number; buyer: string; text: string }[]
}

export function marketView(state: FarmState, catalog: Catalog): MarketView {
  const title = (pack: string): string => catalog.pack(pack)?.title ?? pack
  const color = (pack: string): string => { const p = catalog.pack(pack); return p ? packColor(p) : '#6DB24F' }
  const buyers = buyersFor(state, catalog).map((b): MarketBuyer => {
    const s = standing(b, state, catalog)
    return {
      id: b.id, name: b.name, note: b.note, field: title(b.pack), color: color(b.pack), buying: s.buying,
      sales: state.sales.filter((x) => x.buyer === b.id).length,
      bars: s.bars.map((bar): MarketBar => ({
        field: title(bar.pack), color: color(bar.pack), want: bar.want, have: bar.have, met: bar.met,
        line: bar.have === null ? 'you do not have this field'
          : 'at ' + bar.have + ' · bar ' + bar.want + (bar.hollow.length ? ' · hollow: ' + bar.hollow.map((l) => LAYER_NAMES[l]).join(', ') : ''),
      })),
    }
  })
  return {
    buyers, buying: buyers.filter((b) => b.buying).length,
    sales: state.sales.map((x) => ({ day: x.day, buyer: catalog.buyer(x.buyer)?.name ?? 'A buyer who has left the market', text: x.text })).reverse(),
  }
}

export function marketSheetHtml(v: MarketView): string {
  const buyer = (b: MarketBuyer): string =>
    '<div class="ready">' + fieldHead(b.name, b.color, b.buying ? ' <span class="tag">buying</span>' : '') +
    '<div class="sub">' + esc(b.field) + ' field' + (b.note ? ' · ' + esc(b.note) : '') + (b.sales ? ' · sold to ' + b.sales + (b.sales === 1 ? ' time' : ' times') : '') + '</div>' +
    b.bars.map((bar) => '<div class="row slim"><div class="n">' + esc(bar.field) + '<small>' + esc(bar.line) + '</small></div><span class="sub">' + (bar.met ? 'met' : 'not yet') + '</span></div>').join('') +
    (b.buying ? '<div class="branches"><button type="button" data-act="sell" data-arg="' + esc(b.id) + '">Record a sale</button></div>' : '') +
    '</div>'
  return (
    '<h2>Market</h2><p class="sub">A buyer is a named set of bars: how ready they want each field to be. A buyer is buying while your farm meets every one, with no layer of those fields hollow. A sale is something real that came of it: an offer, a yes. Nobody is ranked, and nothing here has a date.</p>' +
    (v.buyers.length
      ? '<p><b>' + v.buying + '</b> of ' + v.buyers.length + (v.buyers.length === 1 ? ' buyer is' : ' buyers are') + ' buying today.</p>' + v.buyers.map(buyer).join('')
      : '<p>No buyer stands in the fields you have. A pack brings its own buyers; open another field from the learning tree.</p>') +
    (v.sales.length
      ? '<h3>Sales</h3>' + v.sales.map((x) => '<div class="entry"><p class="sub">Day ' + x.day + ' · ' + esc(x.buyer) + '</p>' + noteHtml(x.text) + '</div>').join('')
      : '') +
    footHtml()
  )
}

/** Recording a sale: a few words on what really happened. */
export function saleSheetHtml(buyer: { id: string; name: string }, min: number, max: number): string {
  return (
    '<h2>A sale · ' + esc(buyer.name) + '</h2>' +
    '<p>A sale is not a button to press. It is something real that happened because of what you grew: an offer, a contract, a yes. Say what it was. It is kept at the market, in your words, and shown to nobody.</p>' +
    writingBox({ id: 'sale', label: 'What happened', min, max, gate: 'saleGo', rows: 3 }) +
    '<div class="foot"><button type="button" data-act="market">Not yet</button><button type="button" class="pri" id="saleGo" data-act="sellGo" data-arg="' + esc(buyer.id) + '" disabled>Keep this sale</button></div>'
  )
}

/* ---------- two farms side by side ---------- */

export interface Measure {
  /** Trees standing: rooted, and not wilted. */
  trees: number
  /** Crops in the ground that are not trees yet. */
  growing: number
  wilted: number
  compost: number
  /** Guilds that are whole. */
  guilds: number
  /** Fields at the farmer's bar. */
  atBar: number
  /** The farm's fields in pack order. `percent` is null for a field with no end. */
  fields: { pack: string; title: string; color: string; percent: number | null }[]
}

export function measure(s: FarmState, catalog: Catalog): Measure {
  const packs = catalog.packs.filter((p) => Object.hasOwn(s.fields, p.pack))
  const ready = packs.map((p) => readiness(p.pack, s, catalog))
  return {
    trees: s.crops.filter((c) => c.perennial && !c.wilted).length,
    growing: s.crops.filter((c) => !c.perennial).length,
    wilted: s.crops.filter((c) => c.wilted).length,
    compost: s.compost.length,
    guilds: packs.reduce((n, p) => n + (p.guilds ?? []).filter((g) => guildWhole(g, s)).length, 0),
    atBar: ready.filter((r) => r?.atBar).length,
    fields: packs.map((p, i) => ({ pack: p.pack, title: p.title, color: packColor(p), percent: ready[i]?.percent ?? null })),
  }
}

export interface Compared {
  rows: { label: string; then: number; now: number; better: 'more' | 'less' }[]
  /** Readiness of each field that has one today. `then` is null for a field the farm did not have. */
  fields: { title: string; color: string; then: number | null; now: number }[]
}

/** An earlier farm beside today's. No line is a score: they are the same counts the farm shows elsewhere. */
export function compare(then: FarmState, now: FarmState, catalog: Catalog): Compared {
  const a = measure(then, catalog)
  const b = measure(now, catalog)
  const row = (label: string, key: 'trees' | 'growing' | 'guilds' | 'atBar' | 'wilted' | 'compost', better: 'more' | 'less') => ({ label, then: a[key], now: b[key], better })
  return {
    rows: [
      row('Trees standing', 'trees', 'more'), row('Crops growing', 'growing', 'more'), row('Whole guilds', 'guilds', 'more'),
      row('Fields at their bar', 'atBar', 'more'), row('Wilted', 'wilted', 'less'), row('In the compost heap', 'compost', 'less'),
    ],
    fields: b.fields.flatMap((f) => (f.percent === null ? [] : [{ title: f.title, color: f.color, then: a.fields.find((x) => x.pack === f.pack)?.percent ?? null, now: f.percent }])),
  }
}

/** Two farms as rows: "then → now" for each count, and each field's readiness. */
function comparedHtml(c: Compared): string {
  return (
    '<div>' + c.rows.map((r) => '<div class="row slim"><div class="n">' + esc(r.label) + '</div><span class="sub">' + r.then + ' → <b>' + r.now + '</b></span></div>').join('') + '</div>' +
    (c.fields.length
      ? '<h3>Readiness</h3><div>' + c.fields.map((f) => '<div class="row slim"><div class="n"><i class="dot" style="background:' + hex(f.color) + '"></i>' + esc(f.title) + '</div><span class="sub">' + (f.then === null ? 'no field' : f.then) + ' → <b>' + f.now + '</b></span></div>').join('') + '</div>'
      : '')
  )
}

/* ---------- the rival: your own farm, a month ago ---------- */

export interface RivalView {
  today: number
  /** The day the rival is the farm of. */
  day: number
  /** The two farms side by side, or null when there is no rival to show. */
  then: Compared | null
  /** Why there is no rival, in a sentence. */
  why: string | null
}

/** `then` is the farm of `RULES.rival.days` days ago (`farmOn`), or null if the log holds no such morning. */
export function rivalView(now: FarmState, then: FarmState | null, catalog: Catalog): RivalView {
  const day = now.day - RULES.rival.days
  if (then) return { today: now.day, day, then: compare(then, now, catalog), why: null }
  const why = day < 1
    ? 'Your farm is ' + now.day + (now.day === 1 ? ' day' : ' days') + ' old. Your rival is the farm you had ' + RULES.rival.days + ' days ago, so it first appears on day ' + (RULES.rival.days + 1) + '.'
    : 'This farm has no record of day ' + day + ': it was brought here later than that.'
  return { today: now.day, day, then: null, why }
}

export function rivalSheetHtml(v: RivalView): string {
  const head = '<h2>Last month\'s farm</h2><p class="sub">Your only rival is the farm you had ' + RULES.rival.days + ' days ago. There is nobody else to be compared with, and nothing here is a score.</p>'
  if (!v.then) return head + '<p>' + esc(v.why ?? '') + '</p>' + footHtml()
  return (
    head + '<p>Day ' + v.day + ' beside today, day ' + v.today + '.</p>' + comparedHtml(v.then) +
    '<div class="foot"><button type="button" data-act="visitPast">Walk round it</button><button type="button" class="pri" data-act="close">Close</button></div>'
  )
}

const STAGES = RULES.maxStage + 1
const stood = (c: Pick<Crop, 'perennial' | 'stage'>): string => (c.perennial ? 'a rooted tree' : 'at stage ' + (c.stage + 1) + ' of ' + STAGES)

/** A crop on the old farm: how it stood then and how the same seed stands today. Null for a seed no pack has. */
export function thenAndNow(then: Crop, now: Pick<FarmState, 'crops'>, catalog: Catalog): string | null {
  const seed = catalog.seed(then.seed)
  if (!seed) return null
  const was = seed.name + ' was ' + stood(then) + ' then'
  const today = now.crops.find((c) => c.seed === then.seed)
  if (!today) return was + '. It is not on your farm today.'
  if (stood(today) === stood(then) && !today.wilted) return was + ', and still is.'
  return was + '. Today it is ' + stood(today) + (today.wilted ? ', and wilted' : '') + '.'
}
