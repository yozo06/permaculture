/// <reference types="node" />
// docs/design.md is the source of truth for the rules, and RULES must match its tables exactly.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RULES } from './rules'

const doc = readFileSync(new URL('../../docs/design.md', import.meta.url), 'utf8')
const lines = new Set(doc.split('\n').map((l) => l.trim()))
const days = (n: number) => n + (n === 1 ? ' day' : ' days')

/** The data rows of the table under a `### heading`, without its header and separator, so an extra or contradicting row is caught too. */
const rowsUnder = (heading: string): string[] =>
  (doc.split(/^### /m).find((s) => s.startsWith(heading + '\n')) ?? '')
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .slice(2)
    .map((l) => l.trim())

const thirstRows = [
  ...RULES.intervals.map((n, i) => `| ${i + 1} | ${RULES.zones[i]} | ${days(n)} |`),
  `| perennial | ${RULES.perennialZone} | ${days(RULES.perennialInterval)} |`,
]

const numbersRows = [
  `| Energy per day | ${RULES.energyMax} |`,
  `| Plant | ${RULES.plant.energy} energy, ${RULES.plant.coins} coins |`,
  `| Notes to plant | at least ${RULES.notesMin} characters |`,
  `| New seeds per day | ${RULES.newSeedsPerDay} |`,
  `| Water | ${RULES.water.energy} energy |`,
  `| Explanation | at least ${RULES.explainMin} characters; passes with more than half the rubric lines |`,
  `| Harvest | ${RULES.harvest.energy} energy; premium pays ${RULES.harvest.coins} coins |`,
  `| Harvest write-up | at least ${RULES.writeMin} characters; proof of an artifact, at least ${RULES.proofMin} |`,
  `| Jump the fence | ${RULES.testOut.energy} energy |`,
  `| Forage | ${RULES.forage.energy} energy; pays ${RULES.forage.coins} coins |`,
  `| Fence a tile | ${RULES.fence.open} coins on open ground, ${RULES.fence.forest} in forest |`,
  `| Rain barrel | +1 day when a day ends with ${RULES.barrel.fillAt} or more energy; holds ${RULES.barrel.max} |`,
  `| New farm | day ${RULES.start.day}, ${RULES.start.coins} coins, nothing in the barrel |`,
  `| Longest text | ${RULES.textMax} characters |`,
  `| Farm name | 1 to ${RULES.farmName.max} characters |`,
  `| Neighbours | at most ${RULES.neighbours.max} |`,
  `| A neighbour's picture | forgotten by your game ${RULES.neighbours.forgetDays} days after it was made |`,
  `| Readiness bar | ${RULES.readiness.bar} unless the pack or the farmer sets another; the farmer may set ${RULES.readiness.min} to ${RULES.readiness.max} |`,
  `| Layer balance | a seed waits while a layer ${RULES.balance.below} or more beneath its own is hollow and has a seed to plant |`,
  `| A whole guild | pays ${RULES.guild.coins} coins at each harvest or check-in of one of its members |`,
  `| A seed on an edge | its harvest pays ${RULES.edge.times} times over once a tree is rooted in the field it borders |`,
  `| The weekly walk | every ${RULES.walk.every} days; it costs nothing and pays nothing |`,
  `| The rival | your own farm ${RULES.rival.days} days ago |`,
  '| Compost | everything in the heap is due again the next day |',
]

describe('docs/design.md', () => {
  it('has exactly the thirst table from RULES', () => {
    expect(rowsUnder('Thirst and zones')).toEqual(thirstRows)
  })

  it('has exactly the Numbers table from RULES', () => {
    expect(lines).toContain('### Numbers')
    expect(rowsUnder('Numbers')).toEqual(numbersRows)
  })

  it('has the depth ladder', () => {
    for (const line of [
      "- **0 · Sprout**: read the source and write notes in your own words. Planting needs the notes; they stay on the crop. The sprout's first watering is a recall card.",
      '- **1–2 · Recall**: multiple-choice cards. Multiple choice is for recall only.',
      "- **3 · Explain**: write it in your own words, then rate it against the seed's rubric. More than half the lines is a pass. Self-rating is the fallback until judged harvests arrive.",
      '- **4 · Harvest**: a harder question, a write-up that meets every rubric line, or proof of an artifact.',
      'A seed with no cards explains at every stage. A perennial check-in is a card too, from the harder harvest cards when the seed has them.',
    ]) expect(lines, line).toContain(line)
  })

  it('says how the barrel and perennials behave', () => {
    expect(doc).toContain('The barrel fills before it is spent, so a crop never wilts overnight while the barrel holds a day.')
    expect(doc).toContain('Perennials do not wilt from neglect; a wrong check-in wilts them until the next day.')
    expect(doc).toContain('Two days past thirsty without water, a crop wilts overnight')
    expect(RULES.wiltAfter).toBe(2)
  })
})
