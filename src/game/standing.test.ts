import { describe, expect, it } from 'vitest'
import { marketCatalog as cat, smallFarm } from '../engine/fixtures'
import { RULES } from '../engine/rules'
import type { Crop, FarmState } from '../engine/types'
import { marketSheetHtml, marketView, saleSheetHtml } from './standing'

const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
  ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
const farm = (patch: Partial<FarmState> = {}, ...crops: Crop[]): FarmState => ({ ...smallFarm(), crops, ...patch })
/** A tree in each of the garden's three layers: half its six seeds. The cook (30) buys; the grocer (60) does not. */
const half = (patch: Partial<FarmState> = {}): FarmState => farm(patch, tree('corn'), tree('beans'), tree('squash'))

describe('the market', () => {
  it('lists each buyer with the bars they name and how the farm stands against each', () => {
    const v = marketView(half(), cat)
    expect(v.buyers.map((b) => [b.name, b.buying])).toEqual([['The cook', true], ['The grocer', false]])
    expect(v.buying).toBe(1)
    expect(v.buyers[0]).toMatchObject({ id: 'cook', note: 'Takes what is fresh.', field: 'Garden', sales: 0 })
    expect(v.buyers[0]?.bars).toEqual([{ field: 'Garden', color: '#6DB24F', want: 30, have: 50, met: true, line: 'at 50 · bar 30' }])
    expect(v.buyers[1]?.bars[0]).toMatchObject({ met: false, line: 'at 50 · bar 60' })
  })

  it('says when a hollow layer, or a field the farm does not have, is what stands in the way', () => {
    const hollow = marketView(farm({}, tree('corn'), tree('oak'), tree('beans'), tree('ivy')), cat)
    expect(hollow.buyers[1]?.bars[0]).toMatchObject({ met: false, line: 'at 66 · bar 60 · hollow: Ground cover' })
    expect(marketView(farm({ fields: { shed: 0 } }), cat).buyers).toEqual([])
  })

  it('keeps the sales, newest first, under the name the buyer has today', () => {
    const s = half({ sales: [{ buyer: 'cook', day: 3, text: 'A first offer.' }, { buyer: 'a-buyer-who-left', day: 5, text: 'A second.' }, { buyer: 'cook', day: 9, text: 'A third.' }] })
    const v = marketView(s, cat)
    expect(v.sales).toEqual([
      { day: 9, buyer: 'The cook', text: 'A third.' },
      { day: 5, buyer: 'A buyer who has left the market', text: 'A second.' },
      { day: 3, buyer: 'The cook', text: 'A first offer.' },
    ])
    expect(v.buyers[0]?.sales).toBe(2)
  })

  it('draws a sheet with a way to record a sale only beside a buyer who is buying, and everything escaped', () => {
    const html = marketSheetHtml(marketView(half({ sales: [{ buyer: 'cook', day: 3, text: 'An <offer>.' }] }), cat))
    expect(html).toContain('data-act="sell" data-arg="cook"')
    expect(html).not.toContain('data-arg="grocer"')
    expect(html).toContain('<b>1</b> of 2 buyers')
    expect(html).toContain('An &lt;offer&gt;.')
    expect(html).not.toContain('<offer>')
    expect(marketSheetHtml(marketView(farm({ fields: { shed: 0 } }), cat))).toContain('No buyer stands in the fields you have')
  })

  it('asks for a few words on what really happened before a sale is kept', () => {
    const html = saleSheetHtml({ id: 'cook', name: 'The <cook>' }, RULES.proofMin, RULES.textMax)
    expect(html).toContain('The &lt;cook&gt;')
    expect(html).toContain('data-min="' + RULES.proofMin + '"')
    expect(html).toContain('data-act="sellGo" data-arg="cook" disabled')
  })
})
