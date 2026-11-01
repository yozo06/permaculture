// The Almanac is written from RULES (and the packs' caps), so the numbers on the page cannot drift from the game.
// docs/design.md says the same things; src/engine/design-doc.test.ts checks its tables against RULES.
import type { Catalog } from '../engine/catalog'
import { RULES } from '../engine/rules'
import { esc } from './util'

const days = (n: number): string => n + (n === 1 ? ' day' : ' days')
const stageNo = (stage: number): number => stage + 1
const list = (items: string[]): string => '<ul>' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>'

/** "2 or 3 days". */
const waitText = (waits: number[]): string => [...waits.slice(0, -1).map(String), days(waits[waits.length - 1] ?? 0)].join(' or ')

/** "Z1 daily, Z2 after 2 or 3 days...": one clause per zone, with the stages that live in it. */
function zoneLines(): string[] {
  const zones = [...new Set<string>(RULES.zones)]
  return zones.map((z) => {
    const stages = RULES.zones.flatMap((zone, i) => (zone === z ? [i] : []))
    const waits = stages.map((i) => RULES.intervals[i] ?? 0)
    const label = stages.length === 1 ? 'Stage ' + stageNo(stages[0] ?? 0) : 'Stages ' + stages.map((i) => stageNo(i)).join(' and ')
    return '<b>' + z + '</b>: ' + label + ', thirsty again after ' + waitText(waits)
  })
}

export function almanacHtml(catalog: Catalog, energyMax: number): string {
  const capped = catalog.packs.filter((p) => p.energy_cap !== undefined)
  const capNotes = capped
    .map((p) => 'The <b>' + esc(p.title) + '</b> field is capped: all its work together may use at most ' + p.energy_cap + "% of a day's energy (" + catalog.capOf(p.pack, energyMax) + ' of ' + energyMax + '), so it never becomes the only crop.')
    .join('</li><li>')
  const last = RULES.maxStage
  return (
    '<h2>Almanac</h2><p class="sub">The rules of this farm, as they stand today. Everything here is in the game right now.</p>' +
    '<h3>The loop</h3>' +
    list([
      '<b>Seeds are topics.</b> Plant one in its field: ' + RULES.plant.energy + ' energy, ' + RULES.plant.coins + ' coins. It sprouts at stage 1 of 5. You can plant ' + RULES.newSeedsPerDay + ' new seeds a day, so the farm stays small enough to tend.',
      '<b>Water = answer.</b> A thirsty crop shows a droplet. Tap it and answer one question (' + RULES.water.energy + ' energy). Right: it grows a stage. Wrong: it wilts, drops a stage, and goes in the compost heap.',
      '<b>Harvest = prove it.</b> A stage-' + stageNo(last) + ' crop sparkles. Answer a harder question (' + RULES.harvest.energy + ' energy). Premium: +' + RULES.harvest.coins + ' coins and the crop becomes a <b>perennial tree</b>, rooted for good. Seconds: composted, and it drops back to stage ' + last + ' of 5.',
    ]) +
    '<h3>Thirst and zones</h3>' +
    list([
      ...zoneLines(),
      '<b>' + RULES.perennialZone + '</b>: a perennial asks for a check-in every ' + RULES.perennialInterval + ' days.',
      'Two days past thirsty without water, a crop wilts overnight, unless the rain barrel has a day to spend.',
      'Perennials do not wilt from neglect. A wrong check-in wilts them until the next day.',
      'This is spaced repetition. The map is your retention: inner zones should be small, outer zones full.',
    ]) +
    '<h3>Energy and the rain barrel</h3>' +
    list([
      RULES.energyMax + ' energy a day. Sleep restores it.',
      'End a day with ' + RULES.barrel.fillAt + ' or more energy left and the barrel stores one day (it holds ' + RULES.barrel.max + '). The barrel fills before it is spent, so a crop never wilts overnight while the barrel holds a day. It never grows a crop; only you do.',
      ...(capNotes ? [capNotes] : []),
    ]) +
    '<h3>The compost heap</h3>' +
    list(['A wrong answer or a failed harvest puts the crop in the heap. Everything in the heap is due again the next day. Water it right and it leaves the heap.']) +
    '<h3>Fields and land</h3>' +
    list([
      'Every pack is a field. They sit on a grid around the barn, and the world grows to fit them. Drag to pan; everything beyond the homestead is wilderness.',
      'Tap land next to a field to fence it in: ' + RULES.fence.open + ' coins for open ground, ' + RULES.fence.forest + ' to clear forest. Fields grow one tile at a time, any shape.',
      "Some seeds are not questions. The Workshop's are days of work on the game itself: you log the day, and you harvest when it ships.",
    ]) +
    '<h3>Wilderness (Zone 5)</h3>' +
    list([
      'Tap trees to forage a <b>wild find</b>: a fact next to what you are growing. ' + RULES.forage.energy + ' energy, +' + RULES.forage.coins + ' coins, no readiness credit.',
      'Some finds can be <b>domesticated</b> into volunteer seeds that appear in your seed bag.',
    ]) +
    '<h3>Learning tree</h3>' +
    list([
      'Every seed of every field, including locked ones, is on the tree. A seed unlocks when what it needs is rooted.',
      'Pick a branch to focus; the seed bag puts it first. Or jump the fence: pass a harvest-grade question to unlock a seed early (' + RULES.testOut.energy + ' energy).',
      'Guilds are sets of seeds that belong together. The tree shows how many of each are rooted; there is no bonus yet.',
    ]) +
    '<h3>Buildings</h3>' +
    list(['<b>Barn</b>: seed bag. <b>Well</b>: rain barrel. <b>Compost heap</b>: what to review. <b>Signpost</b>: this almanac.']) +
    '<h3>Your farm is an event log</h3>' +
    list([
      'Everything you do is saved as an event in this browser, and your farm is what you get by replaying them. Export gives you that log; import replays it.',
      'Farms from the first prototype (v2) still import: the game turns them into the first event of a new log.',
    ]) +
    '<h3>Not here yet</h3><p class="sub">Guild bonuses, layers as terraces, real weather from Coorg, the rival farm, the Sunday walk, the market, judged write-ups and timed solves, your own notes on each crop, loading your own pack in the browser, the village.</p>' +
    '<div class="foot"><span></span><button type="button" class="pri" data-act="close">Close</button></div>'
  )
}
