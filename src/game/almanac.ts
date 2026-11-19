// The Almanac is written from RULES (and the packs' caps), so the numbers on the page cannot drift from the game.
// docs/design.md says the same things; src/engine/design-doc.test.ts checks its tables against RULES.
import { LAYER_NAMES, type Catalog } from '../engine/catalog'
import { LADDER } from '../engine/ladder'
import { KINDS, KIND_ORDER, OWN_TODAY } from '../engine/own'
import { TEXT } from '../reader'
import { GROUND_UP, earnedLine } from '../engine/readiness'
import { RULES } from '../engine/rules'
import type { Layer } from '../engine/types'
import { cropSprite, iconHtml } from './art/sprites'
import { esc } from './util'
import { timesOver } from './views'

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
  ['vine', 'leaves climbing a pole, and an arbour once it is a tree. What runs through everything else.'],
  ['shrub', 'a round bush. Structures, and where things are kept.'],
  ['herb', 'one stalk with leaves in pairs, and a flower once it is a tree. Techniques.'],
  ['ground-cover', 'a mat lying flat on the soil. Fundamentals.'],
  ['root', 'a mound of earth with a fan of leaves. What works underneath.'],
]
/** Each layer as the tree it grows into, from the sprite sheet. Its fruit is in no field's colour, so it stands for any of them. */
const legend = (): string =>
  '<div class="legend">' + LAYER_LINES.map(([layer, line]) => '<div>' + iconHtml(cropSprite(layer, RULES.maxStage, true), 2) + '<span><b>' + LAYER_NAMES[layer] + '</b>: ' + line + '</span></div>').join('') + '</div>'

/** `version` is what the build calls itself ("0.1.0 (a031b7a)"); it sits in the footer so a bug report can name it. */
export function almanacHtml(catalog: Catalog, energyMax: number, version: string): string {
  const capped = catalog.packs.filter((p) => p.energy_cap !== undefined)
  const capNotes = capped
    .map((p) => 'The <b>' + esc(p.title) + '</b> field is capped: all its work together may use at most ' + p.energy_cap + "% of a day's energy (" + catalog.capOf(p.pack, energyMax) + ' of ' + energyMax + '), so it never becomes the only crop.')
    .join('</li><li>')
  const last = RULES.maxStage
  const noEnd = catalog.packs.filter((p) => p.perennial === true).map((p) => '<b>' + esc(p.title) + '</b>')
  const titleOf = (pack: string): string => catalog.pack(pack)?.title ?? pack
  const buyers = catalog.buyers.map((b) => '<b>' + esc(b.name) + '</b> wants ' + b.bars.map((x) => esc(titleOf(x.pack)) + ' at ' + x.want).join(', '))
  // What each earned seed asks for, read from the packs, so this page cannot say something the game does not do.
  const earned = catalog.packs.flatMap((p) => catalog.seedsOf(p.pack)).flatMap((s) => (s.earned ? ['<b>' + esc(s.name) + '</b>: ' + esc(earnedLine(s.earned, catalog))] : []))
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
      'A seed can sit on the <b>edge</b> of its own field, where it borders a second. Its harvest pays ' + timesOver(RULES.edge.times) + ', ' + RULES.edge.times * RULES.harvest.coins + ' coins, once you have a tree rooted in the field it borders. The learning tree lists them under both fields.',
      "Some seeds are not questions. The Workshop's are days of work on the game itself: you explain what moved forward, and you harvest when it ships, with a link as proof.",
    ]) +
    '<h3>A field of your own</h3>' +
    list([
      'Open the learning tree and press <b>+ Your own</b>. Name what you want to learn, then paste whatever you have: a list of topics, a syllabus, a contents page, your notes, a word list or a file of flashcards. One topic to a line is enough. The game reads it into topics and shows you what it made of it before anything is added.',
      'Short pairs such as “Hund - dog” become <b>question cards</b>, up to ' + TEXT.bundle + ' to a topic. The wrong answers on a card are borrowed from the other cards of the field. A topic with cards is watered by answering them; any other is watered by writing.',
      'Each topic is one <b>kind</b> of thing: ' + KIND_ORDER.map((k) => KINDS[k].label.toLowerCase()).join(', ') + '. The game guesses it from the name, and you can change it from the learning tree. A skill is harvested by doing it and saying so; the others by cards or a write-up.',
      'A field of your own has no end: no readiness, no bar, nothing that waits for anything else. It holds ' + OWN_TODAY.seeds + ' topics. Fencing land in for it costs ' + RULES.fence.own + ' coins a tile. A topic that was never planted can be removed; one in the ground can be changed, and stays.',
      'Your topics are part of your farm, so Export carries them. They are not shown in a farm link.',
    ]) +
    '<h3>Reading the farm</h3>' +
    '<p class="sub">Every seed belongs to one of seven layers, as in a forest garden, and each layer has a shape of its own. So the map shows what kind of knowledge sits where, and which kind a field is missing. These are the trees; a crop starts as a sprout of the same kind and gets bigger at each stage.</p>' +
    legend() +
    list([
      "Fruit in the field's colour means a crop is ripe. A tree keeps its fruit. A wilted crop turns brown, fruit and all.",
      "Each field flies a <b>flag</b> in its colour, and its fence posts are capped in it. Tap a flag to open that field's learning tree.",
      'Water splashes when you water a crop, a ring spreads when it grows, and sparks rise from a harvest. They are only for show.',
      '<b>Pinch</b> to zoom, or use the + and − buttons, or the same keys. Drag to look around. The picture is drawn to fit your screen, so it is as sharp on a phone as on a laptop.',
    ]) +
    '<h3>Wilderness (Zone 5)</h3>' +
    list([
      'Tap trees to forage a <b>wild find</b>: a fact next to what you are growing. ' + RULES.forage.energy + ' energy, +' + RULES.forage.coins + ' coins, no readiness credit.',
      'Some finds can be <b>domesticated</b> into volunteer seeds that appear in your seed bag.',
    ]) +
    '<h3>Learning tree</h3>' +
    list([
      'Every seed of every field, including locked ones, is on the tree, except the extras: a wild seed until you domesticate it, and a sapling until its tree drops it. A seed unlocks when what it needs is rooted.',
      'Pick a branch to focus; the seed bag puts it first. Or jump the fence: pass a harvest-grade question to unlock a seed early (' + RULES.testOut.energy + ' energy). A jump clears what a seed needs and nothing else: it does not earn a seed, and it does not put one ahead of a hollow layer.',
      'A <b>guild</b> is a set of seeds that belong together, and it is whole while every member stands as a tree. A whole guild pays ' + RULES.guild.coins + ' coins each time you harvest or check in on one of its members. While any member is wilted the guild pays nothing; revive it and the pay is back. The tree shows how far each guild has come.',
      'Some trees drop <b>saplings</b> when you harvest them: new seeds that grow from that one and go deeper. A sapling stays out of sight until then, and the tree says how many are to come, never which. Like a wild find it is an extra.',
    ]) +
    '<h3>Readiness</h3>' +
    list([
      "A field's readiness is the share of its seeds that stand as trees today, rounded down. A tree that a wrong check-in has wilted does not count until it comes back. Seeds you found in the wild and saplings a tree dropped are extras and are never counted, so neither foraging nor a harvest can lower the number.",
      'Every field is held to a <b>bar</b>: ' + RULES.readiness.bar + ' unless its pack says otherwise, and you can set your own, from ' + RULES.readiness.min + ' to ' + RULES.readiness.max + '. A field is at its bar when its readiness has reached it and none of its layers is hollow. A layer is hollow while none of its seeds stands as a tree. A seed you found in the wild does not fill a layer. Neither does a sapling.',
      '<b>Layer balance</b>: a field is built from the ground up: ' + GROUND_UP.map((l) => LAYER_NAMES[l]).join(', ') + '. A seed waits while a layer ' + RULES.balance.below + ' or more beneath its own is hollow and has a seed you could plant today. The seed bag says which layer to plant in first. A hollow layer with nothing left to plant holds nothing back, so a field is never stuck. Vines climb through every layer and never wait, and nothing waits in a field with no end.',
      'There are no dates, and nobody else to compare with. The Readiness button shows every field.' + (noEnd.length ? ' A field with no end has no readiness and no bar: ' + noEnd.join(', ') + '.' : ''),
      ...(earned.length ? ['Some seeds have to be <b>earned</b>: they can be planted only once the learning is on your farm. Jumping the fence does not clear this. ' + earned.join('. ') + '.'] : []),
    ]) +
    '<h3>The market, last month and the weekly walk</h3>' +
    list([
      'The <b>market</b> stall stands on the path south of the barn. A buyer is a named set of bars: how ready they want each field to be. A buyer is buying while your farm meets every one, with no layer of those fields hollow, and a lantern is lit on the stall.' + (buyers.length ? ' ' + buyers.join('. ') + '.' : ''),
      'A <b>sale</b> is something real that came of your farm: an offer, a contract, a yes. You record it at the market in your own words, with a buyer who is buying. It costs nothing and pays nothing, and it is shown to nobody.',
      'Your only <b>rival</b> is the farm you had ' + RULES.rival.days + ' days ago. The Readiness sheet puts today beside it in plain counts, and lets you walk round the old farm. Nobody else is compared.',
      'Every ' + RULES.walk.every + ' days is a <b>walk day</b>. The farm asks for no work: it shows the week that was and asks three questions, and you answer the ones you have something to say to. A walk costs nothing and pays nothing. What you write is kept.',
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
    list(['<b>Barn</b>: seed bag. <b>Well</b>: rain barrel. <b>Compost heap</b>: what to review. <b>Signpost</b>: this almanac. <b>Gate</b>: your neighbours. <b>Stall</b>: the market.']) +
    '<h3>Your farm is an event log</h3>' +
    list([
      'Everything you do is saved as an event in this browser, and your farm is what you get by replaying them. Export gives you that log; import replays it.',
      'Farms from the first prototype (v2) still import: the game turns them into the first event of a new log.',
    ]) +
    '<h3>Not here yet</h3><p class="sub">The Apply rung (a problem, a design, a debugging session), timed solves and AI judging, replanting annuals, a planner, tools, recruiter visits, orchard and research fields, layers as terraces, real weather from Coorg, loading your own pack in the browser, rain for a neighbour (answer a card about one of their crops and send them a day in the barrel), trading seeds, the village server.</p>' +
    '<div class="foot"><span class="sub">Version ' + esc(version) + '</span><button type="button" class="pri" data-act="close">Close</button></div>'
  )
}
