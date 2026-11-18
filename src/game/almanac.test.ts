import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog, LAYER_NAMES } from '../engine/catalog'
import { OWN_TODAY } from '../engine/own'
import { TEXT } from '../engine/reader'
import { GROUND_UP } from '../engine/readiness'
import { RULES } from '../engine/rules'
import { almanacHtml } from './almanac'

const catalog = buildCatalog(collectPacks())

describe('almanacHtml', () => {
  it('states the wilt and barrel rules in the same words as the design doc', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    expect(html).toContain('Two days past thirsty without water, a crop wilts overnight')
    expect(html).toContain('The barrel fills before it is spent, so a crop never wilts overnight while the barrel holds a day')
  })

  it('says how to grow a subject of your own, with the numbers the game plays by', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const section = html.slice(html.indexOf('<h3>A field of your own</h3>'), html.indexOf('<h3>Reading the farm</h3>'))
    expect(section).toContain('+ Your own')
    expect(section).toContain('costs ' + RULES.fence.own + ' coins a tile')
    expect(section).toContain('It holds ' + OWN_TODAY.seeds + ' topics')
    expect(section).toContain('up to ' + TEXT.bundle + ' to a topic')
    expect(section).toContain('a skill to practise')
  })

  it('says what a farm link shows and never shows, with the numbers from RULES', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    expect(html).toContain('<h3>Neighbours</h3>')
    expect(html).toContain('1 to ' + RULES.farmName.max + ' characters')
    expect(html).toContain('at most ' + RULES.neighbours.max)
    expect(html).toContain('forgotten ' + RULES.neighbours.forgetDays + ' days after it was made')
    expect(html).toContain('It never shows your notes, a wrong answer, the compost heap, a wilted crop')
    expect(html).toContain('a sent link cannot be taken back')
    expect(html).toContain('Nobody is ranked')
  })

  it('shows the shape of each of the seven layers, and says what a flag is for', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const section = html.split('<h3>Reading the farm</h3>')[1]?.split('<h3>')[0] ?? ''
    for (const name of Object.values(LAYER_NAMES)) expect(section, name).toContain('<b>' + name + '</b>')
    expect(section.split('<i class="spr"').length - 1).toBe(Object.keys(LAYER_NAMES).length)
    expect(section).toContain('<b>Pinch</b> to zoom')
    expect(section).toContain('flag')
    expect(section).toContain('ripe')
  })

  it('says what readiness is, with the bar from RULES, and which fields have none', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const section = html.split('<h3>Readiness</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(section).toContain('rounded down')
    expect(section).toContain('<b>bar</b>: ' + RULES.readiness.bar + ' unless')
    expect(section).toContain('from ' + RULES.readiness.min + ' to ' + RULES.readiness.max)
    expect(section).toContain('hollow')
    expect(section).toContain('There are no dates')
    for (const p of catalog.packs) expect(section.includes('<b>' + p.title + '</b>'), p.title).toBe(p.perennial === true)
  })

  it('names every seed that has to be earned and what earns it, from the packs themselves', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const section = html.split('<h3>Readiness</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(section).toContain('<b>Sprite sheets</b>: a seed rooted in another field')
    expect(section).toContain('<b>Share a pack</b>: 4 seeds rooted in the Kannada field')
    expect(section).toContain('<b>Coorg weather</b>: the Infra field at readiness 60')
    expect(section).toContain('Jumping the fence does not clear')
  })

  it('says what layer balance is, in the order and with the number the game plays by', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const section = html.split('<h3>Readiness</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(section).toContain('<b>Layer balance</b>')
    expect(section).toContain(GROUND_UP.map((l) => LAYER_NAMES[l]).join(', '))
    expect(section).toContain('a layer ' + RULES.balance.below + ' or more beneath its own')
    expect(section).toContain('Vines')
    expect(html.split('<h3>Not here yet</h3>')[1] ?? '').not.toContain('layer balance')
  })

  it('says what a jump over the fence does not do, and what does not fill a hollow layer', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const tree = html.split('<h3>Learning tree</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(tree).toContain('A jump clears what a seed needs and nothing else: it does not earn a seed, and it does not put one ahead of a hollow layer.')
    const section = html.split('<h3>Readiness</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(section).toContain('A seed you found in the wild does not fill a layer.')
  })

  it('no longer lists readiness as something to come', () => {
    const later = almanacHtml(catalog, RULES.energyMax, '0.0.0').split('<h3>Not here yet</h3>')[1] ?? ''
    expect(later).not.toContain('readiness')
    expect(later).toContain('a planner')
  })

  it('lists under Not here yet the rules the design marks as planned', () => {
    const later = almanacHtml(catalog, RULES.energyMax, '0.0.0').split('<h3>Not here yet</h3>')[1] ?? ''
    for (const planned of ['tools', 'recruiter visits', 'orchard and research fields', 'replanting annuals', 'a planner', 'trading seeds']) {
      expect(later, planned).toContain(planned)
    }
  })

  it('says what a whole guild pays, from the rules, and no longer lists it as something to come', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    expect(html).toContain('A whole guild pays ' + RULES.guild.coins + ' coins each time you harvest or check in on one of its members.')
    expect(html).toContain('While any member is wilted the guild pays nothing; revive it and the pay is back.')
    expect(html.split('<h3>Not here yet</h3>')[1] ?? '').not.toContain('guild')
  })

  it('says what a seed on an edge pays, from the rules, and no longer lists edges as something to come', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    expect(html).toContain('Its harvest pays double, ' + RULES.edge.times * RULES.harvest.coins + ' coins, once you have a tree rooted in the field it borders.')
    expect(html.split('<h3>Not here yet</h3>')[1] ?? '').not.toContain('edge')
  })

  it('says what a sapling is, that it is an extra, and no longer lists saplings as something to come', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    expect(html).toContain('Some trees drop <b>saplings</b> when you harvest them')
    expect(html).toContain('is on the tree, except the extras: a wild seed until you domesticate it, and a sapling until its tree drops it.')
    const readiness = html.split('<h3>Readiness</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(readiness).toContain('saplings a tree dropped are extras and are never counted, so neither foraging nor a harvest can lower the number.')
    expect(readiness).toContain('Neither does a sapling.')
    expect(html.split('<h3>Not here yet</h3>')[1] ?? '').not.toContain('sapling')
  })

  it('explains the market, names each buyer with its bars from the packs, and takes the rival and walk numbers from the rules', () => {
    const html = almanacHtml(catalog, RULES.energyMax, '0.0.0')
    const section = html.split('<h3>The market, last month and the weekly walk</h3>')[1]?.split('<h3>')[0] ?? ''
    expect(section).toContain('<b>A Haskell-first shop</b> wants Backend · Haskell at 80, System design at 60')
    expect(section).toContain('<b>Fintech infrastructure</b> wants Infra at 80, System design at 70, Leadership at 50')
    expect(section).toContain('It costs nothing and pays nothing, and it is shown to nobody.')
    expect(section).toContain('the farm you had ' + RULES.rival.days + ' days ago')
    expect(section).toContain('Every ' + RULES.walk.every + ' days is a <b>walk day</b>')
    const later = html.split('<h3>Not here yet</h3>')[1] ?? ''
    for (const done of ['market', 'rival', 'walk']) expect(later, done).not.toContain(done)
  })

  it('says which version of the game it is, so a bug report can name it', () => {
    expect(almanacHtml(catalog, RULES.energyMax, '9.9.9 (abc1234)')).toContain('Version 9.9.9 (abc1234)')
  })
})
