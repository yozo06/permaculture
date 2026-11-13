// Where the farm stands at the market. What each sheet shows is worked
// out here from the farm and the packs, and drawn here as strings, so both can be tested without a browser.
import { LAYER_NAMES, type Catalog } from '../engine/catalog'
import { buyersFor, standing } from '../engine/market'
import { RULES } from '../engine/rules'
import type { FarmState } from '../engine/types'
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
