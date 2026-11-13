import { describe, expect, it } from 'vitest'
import { bountifulCatalog as rich, smallCatalog as cat, smallFarm } from './fixtures'
import { RULES } from './rules'
import type { Crop, FarmState } from './types'
import { dragging, guildCoins, guildWhole, wholeGuilds } from './yields'

const tree = (seed: string, patch: Partial<Crop> = {}): Crop =>
  ({ seed, x: 20, y: 20, stage: 4, best: 4, due: 99, wilted: false, perennial: true, notes: '', journal: [], ...patch })
const farm = (...crops: Crop[]): FarmState => ({ ...smallFarm(), crops })
// The garden's one guild: corn, beans and squash. See `smallPacks`.
const sisters = cat.guildsOf('corn')[0]!

describe('a guild', () => {
  it('is whole only while every member stands as a tree', () => {
    expect(guildWhole(sisters, farm())).toBe(false)
    expect(guildWhole(sisters, farm(tree('corn'), tree('beans')))).toBe(false)
    expect(guildWhole(sisters, farm(tree('corn'), tree('beans'), tree('squash', { perennial: false })))).toBe(false)
    expect(guildWhole(sisters, farm(tree('corn'), tree('beans'), tree('squash')))).toBe(true)
  })

  it('is not whole while a member is wilted, and says which members drag it', () => {
    const s = farm(tree('corn'), tree('beans', { wilted: true }), tree('squash'))
    expect(guildWhole(sisters, s)).toBe(false)
    expect(dragging(sisters, s)).toEqual(['beans'])
  })

  it('is dragged by nothing while it is whole, or while a member is not rooted yet', () => {
    expect(dragging(sisters, farm(tree('corn'), tree('beans'), tree('squash')))).toEqual([])
    // A wilted seedling is not what stands between this guild and its pay: the missing tree is.
    expect(dragging(sisters, farm(tree('corn'), tree('beans', { perennial: false, wilted: true })))).toEqual([])
  })

  it('pays its coins for work on a member while it is whole, and nothing otherwise', () => {
    const whole = farm(tree('corn'), tree('beans'), tree('squash'))
    expect(wholeGuilds('corn', whole, cat).map((g) => g.id)).toEqual(['three-sisters'])
    expect(guildCoins('squash', whole, cat)).toBe(RULES.guild.coins)
    expect(guildCoins('corn', farm(tree('corn'), tree('beans')), cat)).toBe(0)
  })

  it('pays a share from each whole guild a seed is in', () => {
    // Corn is in three guilds there: alone, with beans, and with beans and squash.
    expect(rich.guildsOf('corn').map((g) => g.id)).toEqual(['three-sisters', 'tall', 'pole'])
    expect(guildCoins('corn', farm(tree('corn')), rich)).toBe(RULES.guild.coins)
    expect(guildCoins('corn', farm(tree('corn'), tree('beans')), rich)).toBe(2 * RULES.guild.coins)
    expect(guildCoins('beans', farm(tree('corn'), tree('beans')), rich)).toBe(RULES.guild.coins)
    expect(guildCoins('corn', farm(tree('corn'), tree('beans'), tree('squash')), rich)).toBe(3 * RULES.guild.coins)
  })

  it('pays nothing for a seed that is in no guild', () => {
    const whole = farm(tree('corn'), tree('beans'), tree('squash'), tree('bees'), tree('saw'))
    expect(guildCoins('bees', whole, cat)).toBe(0)
    expect(guildCoins('saw', whole, cat)).toBe(0)
    expect(guildCoins('nope', whole, cat)).toBe(0)
  })
})
