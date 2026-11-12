import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog, LAYER_NAMES } from '../engine/catalog'
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
    expect(section.split('<svg ').length - 1).toBe(Object.keys(LAYER_NAMES).length)
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

  it('no longer lists readiness as something to come', () => {
    const later = almanacHtml(catalog, RULES.energyMax, '0.0.0').split('<h3>Not here yet</h3>')[1] ?? ''
    expect(later).not.toContain('readiness')
    expect(later).toContain('the market')
  })

  it('lists under Not here yet the rules the design marks as planned', () => {
    const later = almanacHtml(catalog, RULES.energyMax, '0.0.0').split('<h3>Not here yet</h3>')[1] ?? ''
    for (const planned of ['the Sunday walk', 'guild bonuses', 'saplings', 'tools', 'recruiter visits', 'orchard and research fields', 'replanting annuals', 'a planner', 'trading seeds']) {
      expect(later, planned).toContain(planned)
    }
  })

  it('says which version of the game it is, so a bug report can name it', () => {
    expect(almanacHtml(catalog, RULES.energyMax, '9.9.9 (abc1234)')).toContain('Version 9.9.9 (abc1234)')
  })
})
