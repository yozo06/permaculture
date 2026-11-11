import { describe, expect, it } from 'vitest'
import { collectPacks } from '../../scripts/packs-lib.mjs'
import { buildCatalog } from '../engine/catalog'
import { RULES } from '../engine/rules'
import { almanacHtml } from './almanac'

const catalog = buildCatalog(collectPacks())

describe('almanacHtml', () => {
  it('states the wilt and barrel rules in the same words as the design doc', () => {
    const html = almanacHtml(catalog, RULES.energyMax)
    expect(html).toContain('Two days past thirsty without water, a crop wilts overnight')
    expect(html).toContain('The barrel fills before it is spent, so a crop never wilts overnight while the barrel holds a day')
  })
})
