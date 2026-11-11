import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
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

  it('says which version of the game it is, so a bug report can name it', () => {
    expect(almanacHtml(catalog, RULES.energyMax, '9.9.9 (abc1234)')).toContain('Version 9.9.9 (abc1234)')
  })
})
