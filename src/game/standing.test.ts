import { describe, expect, it } from 'vitest'
import { marketCatalog as cat, smallFarm } from '../engine/fixtures'
import { RULES } from '../engine/rules'
import type { Crop, FarmState } from '../engine/types'
import { WALK_QUESTIONS } from '../engine/walk'
import { compare, marketSheetHtml, marketView, measure, rivalSheetHtml, rivalView, saleSheetHtml, thenAndNow, walkSheetHtml, walkView } from './standing'

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
    expect(html).toContain('data-act="sell" data-arg="cook" aria-label="Record a sale to The cook"')
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

describe('measuring a farm', () => {
  it('counts trees standing, crops growing, what is wilted or in the compost, whole guilds and fields at their bar', () => {
    const s = farm({ compost: ['ivy'] }, tree('corn'), tree('beans'), tree('squash'), tree('oak', { wilted: true }), tree('ivy', { perennial: false, stage: 1, wilted: true }), tree('clover', { perennial: false, stage: 2 }))
    expect(measure(s, cat)).toMatchObject({ trees: 3, growing: 1, wilted: 2, compost: 1, guilds: 1, atBar: 0 })
    expect(measure(s, cat).fields).toEqual([{ pack: 'garden', title: 'Garden', color: '#6DB24F', percent: 50 }, { pack: 'shed', title: 'Shed', color: '#A9A692', percent: null }])
  })

  it('puts two farms side by side, and says for each line whether more is better or less', () => {
    const c = compare(farm({}, tree('corn')), half({ compost: ['oak'] }), cat)
    expect(c.rows).toEqual([
      { label: 'Trees standing', then: 1, now: 3, better: 'more' },
      { label: 'Crops growing', then: 0, now: 0, better: 'more' },
      { label: 'Whole guilds', then: 0, now: 1, better: 'more' },
      { label: 'Fields at their bar', then: 0, now: 0, better: 'more' },
      { label: 'Wilted', then: 0, now: 0, better: 'less' },
      { label: 'In the compost heap', then: 0, now: 1, better: 'less' },
    ])
    expect(c.fields).toEqual([{ title: 'Garden', color: '#6DB24F', then: 16, now: 50 }])
  })

  it('shows a field the farm did not have then with no number for then', () => {
    const then = farm({ fields: { shed: 0 } })
    const withEnd = compare(then, half(), cat)
    expect(withEnd.fields).toEqual([{ title: 'Garden', color: '#6DB24F', then: null, now: 50 }])
  })
})

describe('the rival', () => {
  it('is the farm of thirty days ago, beside today', () => {
    const v = rivalView(half({ day: 45 }), farm({ day: 15 }, tree('corn')), cat)
    expect(v).toMatchObject({ today: 45, day: 15, why: null })
    expect(v.then?.rows[0]).toEqual({ label: 'Trees standing', then: 1, now: 3, better: 'more' })
  })

  it('has not arrived on a young farm, and says when it will', () => {
    const v = rivalView(half({ day: 12 }), null, cat)
    expect(v.then).toBeNull()
    expect(v.why).toBe('Your farm is 12 days old. Your rival is the farm you had ' + RULES.rival.days + ' days ago, so it first appears on day ' + (RULES.rival.days + 1) + '.')
  })

  it('says so when the log does not go back that far', () => {
    expect(rivalView(half({ day: 45 }), null, cat).why).toBe('This farm has no record of day 15: it was brought here later than that.')
  })

  it('draws the two side by side with a way to walk round the old farm, or says why it cannot', () => {
    const html = rivalSheetHtml(rivalView(half({ day: 45 }), farm({ day: 15 }, tree('corn')), cat))
    expect(html).toContain('Day 15')
    expect(html).toContain('Trees standing')
    expect(html).toContain('1 → <b>3</b>')
    expect(html).toContain('data-act="visitPast"')
    const none = rivalSheetHtml(rivalView(half({ day: 12 }), null, cat))
    expect(none).toContain('it first appears on day 31')
    expect(none).not.toContain('data-act="visitPast"')
  })

  it('says of a crop on the old farm how it stood then and how it stands today', () => {
    const now = farm({}, tree('corn'), tree('beans', { perennial: false, stage: 3 }), tree('squash', { perennial: false, stage: 1, wilted: true }))
    expect(thenAndNow(tree('corn', { perennial: false, stage: 1 }), now, cat)).toBe('Corn was at stage 2 of 5 then. Today it is a rooted tree.')
    expect(thenAndNow(tree('corn'), now, cat)).toBe('Corn was a rooted tree then, and still is.')
    // The same tree, wilted since by a wrong check-in, is not "still" as it was. Nor is one that was wilted then and stands now.
    expect(thenAndNow(tree('corn'), farm({}, tree('corn', { wilted: true })), cat)).toBe('Corn was a rooted tree then. Today it is a rooted tree, and wilted.')
    expect(thenAndNow(tree('corn', { wilted: true }), now, cat)).toBe('Corn was a rooted tree, and wilted then. Today it is a rooted tree.')
    expect(thenAndNow(tree('corn', { wilted: true }), farm({}, tree('corn', { wilted: true })), cat)).toBe('Corn was a rooted tree, and wilted then, and still is.')
    expect(thenAndNow(tree('beans', { perennial: false, stage: 3 }), now, cat)).toBe('Beans was at stage 4 of 5 then, and still is.')
    expect(thenAndNow(tree('squash', { perennial: false, stage: 2 }), now, cat)).toBe('Squash was at stage 3 of 5 then. Today it is at stage 2 of 5, and wilted.')
    expect(thenAndNow(tree('oak'), now, cat)).toBe('Oak was a rooted tree then. It is not on your farm today.')
    expect(thenAndNow(tree('no-such-seed'), now, cat)).toBeNull()
  })
})

describe('the weekly walk', () => {
  const walked = { day: 7, asked: ['An older question?', 'Another?'], answers: ['The <corn> is tall.', ''] }

  it('offers the walk on a walk day, with the three questions and the week that was', () => {
    const v = walkView(half({ day: 14 }), farm({ day: 7 }, tree('corn')), cat)
    expect(v).toMatchObject({ day: 14, walkDay: true, taken: false, next: 21, since: 7, questions: [...WALK_QUESTIONS] })
    expect(v.week?.rows[0]).toMatchObject({ then: 1, now: 3 })
  })

  it('says when the next walk is on any other day, and that today\'s is done once it is', () => {
    expect(walkView(half({ day: 9 }), null, cat)).toMatchObject({ walkDay: false, taken: false, next: 14, week: null, since: null })
    expect(walkView(half({ day: 14, walks: [{ ...walked, day: 14 }] }), null, cat)).toMatchObject({ walkDay: true, taken: true })
  })

  it('keeps the walks already taken, newest first, each with the questions it was asked', () => {
    const v = walkView(half({ day: 20, walks: [walked, { day: 14, asked: [...WALK_QUESTIONS], answers: ['a', 'b', 'c'] }] }), null, cat)
    expect(v.past.map((w) => w.day)).toEqual([14, 7])
  })

  it('draws three boxes to write in on a walk day, and only the journal on other days, escaped', () => {
    const open = walkSheetHtml(walkView(half({ day: 14, walks: [walked] }), farm({ day: 7 }, tree('corn')), cat), RULES.textMax)
    for (const [i, q] of WALK_QUESTIONS.entries()) {
      expect(open).toContain('<label for="walk' + i + '"')
      expect(open).toContain(q)
    }
    expect(open).toContain('data-act="walkGo"')
    expect(open).toContain('Trees standing')
    expect(open).toContain('The end of day 7 beside today.')
    // The boxes count as writing in progress, so a tap outside does not throw the answers away.
    expect(open.match(/<textarea id="walk\d" class="write" rows="3" data-min="0"/g)).toHaveLength(3)
    expect(open).toContain('The &lt;corn&gt; is tall.')
    expect(open).not.toContain('<corn>')
    // An answer left empty is not printed as a question with nothing under it.
    expect(open).not.toContain('Another?')
    const shut = walkSheetHtml(walkView(half({ day: 9, walks: [walked] }), null, cat), RULES.textMax)
    expect(shut).not.toContain('data-act="walkGo"')
    expect(shut).toContain('The next walk is on day 14')
    expect(shut).toContain('An older question?')
    const done = walkSheetHtml(walkView(half({ day: 14, walks: [{ ...walked, day: 14 }] }), null, cat), RULES.textMax)
    expect(done).not.toContain('data-act="walkGo"')
    expect(done).toContain('You have taken today')
  })
})
