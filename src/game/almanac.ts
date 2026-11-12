// The Almanac is written from RULES (and the packs' caps), so the numbers on the page cannot drift from the game.
// docs/design.md says the same things; src/engine/design-doc.test.ts checks its tables against RULES.
import { LAYER_NAMES, type Catalog } from '../engine/catalog'
import { LADDER } from '../engine/ladder'
import { RULES } from '../engine/rules'
import type { Layer } from '../engine/types'
import { cropShape, shapeSvg } from './shapes'
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

/** What each layer looks like on the map, and the kind of knowledge it holds. In the order of a forest, top to bottom. */
const LAYER_LINES: [Layer, string][] = [
  ['canopy', 'a tall tree with a wide crown. The big picture.'],
  ['understory', 'a small tree that comes to a point. Patterns.'],
  ['vine', 'leaves climbing a pole, and a trellis once it is a tree. What runs through everything else.'],
  ['shrub', 'a round bush. Structures, and where things are kept.'],
  ['herb', 'one stalk with leaves in pairs. Techniques.'],
  ['ground-cover', 'a mat lying flat on the soil. Fundamentals.'],
  ['root', 'a mound of earth with a fan of leaves. What works underneath.'],
]
/** The fruit in the legend: no field's colour, so it stands for any of them. */
const LEGEND_FRUIT = '#F4EAD0'
const legend = (): string =>
  '<div class="legend">' + LAYER_LINES.map(([layer, line]) => '<div>' + shapeSvg(cropShape(layer, RULES.maxStage, true), LEGEND_FRUIT) + '<span><b>' + LAYER_NAMES[layer] + '</b>: ' + line + '</span></div>').join('') + '</div>'

/** `version` is what the build calls itself ("0.1.0 (a031b7a)"); it sits in the footer so a bug report can name it. */
export function almanacHtml(catalog: Catalog, energyMax: number, version: string): string {
  const capped = catalog.packs.filter((p) => p.energy_cap !== undefined)
  const capNotes = capped
    .map((p) => 'The <b>' + esc(p.title) + '</b> field is capped: all its work together may use at most ' + p.energy_cap + "% of a day's energy (" + catalog.capOf(p.pack, energyMax) + ' of ' + energyMax + '), so it never becomes the only crop.')
    .join('</li><li>')
  const last = RULES.maxStage
  return (
    '<h2>Almanac</h2><p class="sub">The rules of this farm, as they stand today. Everything here is in the game right now.</p>' +
    '<h3>The depth ladder</h3>' +
    '<p class="sub">Stages change the kind of work, not just the wait. Multiple choice is for recall only.</p>' +
    list([
      '<b>Sprout.</b> Plant a seed in its field: ' + RULES.plant.energy + ' energy, ' + RULES.plant.coins + ' coins. Read the source and write notes in your own words, at least ' + RULES.notesMin + ' characters. The notes stay on the crop. You can plant ' + RULES.newSeedsPerDay + ' new seeds a day, so the farm stays small enough to tend.',
      '<b>Recall</b> (stages ' + stageNo(0) + ' to ' + stageNo(LADDER.recallLast) + ' of ' + (last + 1) + '). A thirsty crop shows a droplet. Tap it and answer a multiple-choice card (' + RULES.water.energy + ' energy). Right: it grows a stage. Wrong: it wilts, drops a stage, and goes in the compost heap.',
      '<b>Explain</b> (stage ' + stageNo(LADDER.explain) + ' of ' + (last + 1) + '). Write the topic in your own words, at least ' + RULES.explainMin + ' characters (' + RULES.water.energy + ' energy). Your notes stay hidden until you submit. Then rate yourself against the seed\'s rubric: more than half the lines is a pass and the crop grows. Otherwise it wilts like a wrong answer. Self-rating is the fallback until judged harvests arrive.',
      '<b>Harvest</b> (stage ' + stageNo(last) + ' of ' + (last + 1) + '). A sparkling crop is ready (' + RULES.harvest.energy + ' energy): a harder question, a write-up that meets every rubric line, or proof of an artifact (a link or a description). Premium: +' + RULES.harvest.coins + ' coins and the crop becomes a <b>perennial tree</b>, rooted for good. Seconds: composted, and it drops back to stage ' + stageNo(last - 1) + ' of ' + (last + 1) + '.',
      'A seed with no cards (the Workshop\'s) explains at every stage. A perennial check-in is a card too, and the harder harvest cards are used when a seed has them.',
      'Tap an idle crop, or press Notes in the seed bag, to read your notes and the journal of your explanations and write-ups.',
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
      'Each pack you chose is a field. They sit on a grid around the barn, and the world grows to fit them. Open another from its tab in the learning tree; it is free. Drag to pan; everything beyond the homestead is wilderness.',
      'Tap land next to a field to fence it in: ' + RULES.fence.open + ' coins for open ground, ' + RULES.fence.forest + ' to clear forest. Fields grow one tile at a time, any shape.',
      "Some seeds are not questions. The Workshop's are days of work on the game itself: you explain what moved forward, and you harvest when it ships, with a link as proof.",
    ]) +
    '<h3>Reading the farm</h3>' +
    '<p class="sub">Every seed belongs to one of seven layers, as in a forest garden, and each layer has a shape of its own. So the map shows what kind of knowledge sits where, and which kind a field is missing. These are the trees; a crop starts as a sprout of the same kind and gets bigger at each stage.</p>' +
    legend() +
    list([
      "Fruit in the field's colour means a crop is ripe. A tree keeps its fruit. A wilted crop turns brown and has none.",
      "Each field flies a <b>flag</b> in its colour, and its fence posts are capped in it. Tap a flag to open that field's learning tree.",
      'Water splashes when you water a crop, a ring spreads when it grows, and sparks rise from a harvest. They are only for show.',
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
    '<h3>Neighbours</h3>' +
    list([
      'Tap the <b>gate</b> where the main path leaves the homestead. Name your farm (1 to ' + RULES.farmName.max + ' characters) and make a <b>farm link</b>: a picture of your farm, held inside the link itself. Send it in any chat you already use. Nothing is uploaded.',
      'You choose which fields each link shows. It shows every crop at the furthest it has grown. It never shows your notes, a wrong answer, the compost heap, a wilted crop, your coins, energy or rain barrel.',
      'A link is a photograph. It shows the day it was made and never updates, and a sent link cannot be taken back. Send a new one to show progress.',
      "Open a neighbour's link to add them (the game keeps at most " + RULES.neighbours.max + '). Visit to look around their farm, and tap a crop to see how the same seed stands on yours. Nothing you do there changes either farm.',
      'The later of two pictures of a farm is the one kept. A picture is forgotten ' + RULES.neighbours.forgetDays + ' days after it was made; ask your neighbour for a new link.',
      'Nobody is ranked. Your neighbours are listed in the order you met them.',
    ]) +
    '<h3>Buildings</h3>' +
    list(['<b>Barn</b>: seed bag. <b>Well</b>: rain barrel. <b>Compost heap</b>: what to review. <b>Signpost</b>: this almanac. <b>Gate</b>: your neighbours.']) +
    '<h3>Your farm is an event log</h3>' +
    list([
      'Everything you do is saved as an event in this browser, and your farm is what you get by replaying them. Export gives you that log; import replays it.',
      'Farms from the first prototype (v2) still import: the game turns them into the first event of a new log.',
    ]) +
    '<h3>Not here yet</h3><p class="sub">The Apply rung (a problem, a design, a debugging session), timed solves and AI judging, guild bonuses, layers as terraces, real weather from Coorg, the rival farm, the Sunday walk, the market, loading your own pack in the browser, rain for a neighbour (answer a card about one of their crops and send them a day in the barrel), the village server.</p>' +
    '<div class="foot"><span class="sub">Version ' + esc(version) + '</span><button type="button" class="pri" data-act="close">Close</button></div>'
  )
}
