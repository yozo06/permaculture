// The market. A buyer is a named set of bars: the readiness they want of each field they care about. A buyer is
// buying while the farm meets every one. Nothing here is saved: it is worked out from the crops each time, like
// readiness, so a pack can add a buyer or move a bar and no saved farm changes.
import { LAYER_NAMES, type Buyer, type Catalog } from './catalog'
import { readiness } from './readiness'
import type { FarmState, Layer } from './types'

type Farm = Pick<FarmState, 'fields' | 'crops' | 'bars'>

export interface BuyerBar {
  pack: string
  /** The readiness the buyer wants of this field. */
  want: number
  /** The field's readiness today, or null if the farm does not have the field. */
  have: number | null
  /** Layers of the field nothing stands in. A bar is not met over a hollow layer, whatever the number. */
  hollow: Layer[]
  met: boolean
}

export interface Standing {
  bars: BuyerBar[]
  /** Every bar is met. */
  buying: boolean
}

/** How the farm stands against each bar a buyer names. A bar is met as a farmer's own is: the number reached, no layer hollow. */
export function standing(buyer: Buyer, s: Farm, catalog: Catalog): Standing {
  const bars = buyer.bars.map(({ pack, want }): BuyerBar => {
    const r = Object.hasOwn(s.fields, pack) ? readiness(pack, s, catalog) : null
    if (!r) return { pack, want, have: null, hollow: [], met: false }
    return { pack, want, have: r.percent, hollow: r.hollow, met: r.percent >= want && r.hollow.length === 0 }
  })
  return { bars, buying: bars.length > 0 && bars.every((b) => b.met) }
}

/** The buyers a farm can see: those who stand in a field it has. */
export const buyersFor = (s: Pick<FarmState, 'fields'>, catalog: Catalog): Buyer[] =>
  catalog.buyers.filter((b) => Object.hasOwn(s.fields, b.pack))

/** Why a buyer is not buying today, in a sentence that names the first bar that is short, or null if they are. */
export function notBuying(buyer: Buyer, s: Farm, catalog: Catalog): string | null {
  const short = standing(buyer, s, catalog).bars.find((b) => !b.met)
  if (!short) return null
  const field = 'the ' + (catalog.pack(short.pack)?.title ?? short.pack) + ' field'
  const why = short.have === null ? 'you do not have ' + field
    : short.have < short.want ? field + ' is at ' + short.have + ', and the bar is ' + short.want
      : 'the ' + LAYER_NAMES[short.hollow[0] ?? 'root'] + ' layer of ' + field + ' is hollow'
  return buyer.name + ' is not buying yet: ' + why + '.'
}
