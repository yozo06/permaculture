// HTML for the sheets of the depth ladder: plant with notes, explain, write up, and the crop sheet.
// Pure strings in, strings out, so they can be tested without a browser. Everything that came from a player or a pack is escaped.
import { cropSprite, iconHtml } from './art/sprites'
import type { NeighbourCropView, NeighbourRow, ShareView } from './visit'
import type { CropView, EarnedRow, HeldRow, PickerPack, ReadinessRow, ReadinessView, SourceLink } from './views'
import { esc } from './util'

export const chipHtml = (title: string, color: string): string => '<div><span class="chip" style="--c:' + esc(color) + '">' + esc(title) + '</span></div>'

export const footHtml = (label?: string, extra?: string): string =>
  '<div class="foot">' + (extra || '<span></span>') + '<button type="button" class="pri" data-act="close">' + (label ? esc(label) : 'Close') + '</button></div>'

/** "12 of 40 characters" until there is enough, then just the count. */
export const countText = (n: number, min: number): string => (n >= min ? n + ' characters' : n + ' of ' + min + ' characters')

/**
 * A textarea with a live count. `gate` is the id of the button that stays disabled until the text (trimmed) reaches `min`;
 * the sheet's input handler keeps both in step.
 */
export function writingBox(opts: { id: string; label: string; min: number; max: number; gate: string; value?: string; rows?: number; placeholder?: string }): string {
  const n = (opts.value ?? '').trim().length
  return (
    '<label for="' + opts.id + '" class="sub">' + esc(opts.label) + '</label>' +
    '<textarea id="' + opts.id + '" class="write" rows="' + (opts.rows ?? 5) + '" data-min="' + opts.min + '" data-gate="' + opts.gate + '" maxlength="' + opts.max + '" autocomplete="off" spellcheck="true"' +
    (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '>' + esc(opts.value ?? '') + '</textarea>' +
    '<div class="sub count' + (n >= opts.min ? ' ok' : '') + '" id="' + opts.id + 'Count" aria-live="polite">' + countText(n, opts.min) + '</div>'
  )
}

/** A set of checkboxes, one per rubric line. */
export function tickList(legend: string, lines: readonly string[]): string {
  return (
    '<fieldset class="ticks"><legend>' + esc(legend) + '</legend>' +
    lines.map((l) => '<label class="tick"><input type="checkbox" data-line> <span>' + esc(l) + '</span></label>').join('') +
    '</fieldset>'
  )
}

export function sourcesHtml(sources: readonly SourceLink[]): string {
  if (sources.length === 0) return ''
  return (
    '<div><p class="sub">Sources</p><ul class="sources">' +
    sources.map((s) => '<li>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a>' : esc(s.title)) + '</li>').join('') +
    '</ul></div>'
  )
}

export interface PlantSheet {
  chip: string
  name: string
  layer: string
  harvest: string
  summary?: string
  minutes?: number
  sources: readonly SourceLink[]
  notesMin: number
  textMax: number
  energy: number
  coins: number
  /** The edge the seed sits on and what that pays, in a sentence. */
  edge?: string
}

/** Tapping soil with a seed in hand: read, then write your notes before the seed goes in. */
export function plantSheetHtml(p: PlantSheet): string {
  return (
    p.chip + '<h2>Plant · ' + esc(p.name) + '</h2>' +
    '<p class="sub">' + esc(p.layer) + ' layer · <span class="tag">' + esc(p.harvest) + '</span></p>' +
    (p.summary ? '<p>' + esc(p.summary) + '</p>' : '') +
    (p.minutes ? '<p class="sub">About ' + p.minutes + ' minutes of reading.</p>' : '') +
    (p.edge ? '<p class="sub">' + esc(p.edge) + '</p>' : '') +
    sourcesHtml(p.sources) +
    writingBox({ id: 'notes', label: 'Your notes, in your own words', min: p.notesMin, max: p.textMax, gate: 'plantGo', rows: 6, placeholder: 'What is it, why does it matter, and how would you explain it to a friend?' }) +
    '<div class="foot"><button type="button" data-act="close">Not now</button><button type="button" class="pri" id="plantGo" data-act="plantGo" disabled>Plant · ' + p.energy + ' energy · ' + p.coins + ' coins</button></div>'
  )
}

/** The text of a note or explanation: line breaks kept, nothing else trusted. */
export const noteHtml = (text: string): string => '<div class="note">' + esc(text) + '</div>'

export const NO_NOTES = 'Planted before notes existed.'

/** The sheet a crop with nothing to do opens: where it stands, your notes, your journal, sources. */
export function cropSheetHtml(chip: string, v: CropView): string {
  return (
    chip + '<h2>' + esc(v.name) + '</h2>' +
    '<p class="sub">' + esc(v.layer) + ' layer · ' + esc(v.stageLine) + '</p>' +
    '<p>' + esc(v.statusLine) + (v.nextWork ? ' ' + esc(v.nextWork) : '') + '</p>' +
    (v.saplings.length ? '<p class="sub">' + esc(v.saplings.join(' ')) + '</p>' : '') +
    (v.edge ? '<p class="sub">' + esc(v.edge) + '</p>' : '') +
    v.guilds.map((g) => '<p class="sub">' + esc(g) + '</p>').join('') +
    '<h3>Your notes</h3>' + (v.notes ? noteHtml(v.notes) : '<p class="sub">' + NO_NOTES + '</p>') +
    '<h3>Journal</h3>' +
    (v.journal.length
      ? v.journal.map((j) => '<div class="entry"><p class="sub">Day ' + j.day + ' · ' + esc(j.label) + ' · ' + (j.ok ? 'passed' : 'not yet') + '</p>' + noteHtml(j.text) + '</div>').join('')
      : '<p class="sub">Nothing yet. Explanations and write-ups are kept here.</p>') +
    sourcesHtml(v.sources) +
    footHtml()
  )
}

/** One box per pack the farm does not have yet. The sheet's change handler keeps the button it gates in step. */
export function pickerHtml(packs: readonly PickerPack[]): string {
  return (
    '<fieldset class="ticks"><legend>What do you want to grow?</legend>' +
    packs.filter((p) => !p.open).map((p) =>
      '<label class="tick"><input type="checkbox" data-pack="' + esc(p.pack) + '"' + (p.ticked ? ' checked' : '') + '> <span><b style="color:' + esc(p.color) + '">' + esc(p.title) + '</b> · ' + p.seeds + ' seeds<br><span class="sub">' + esc(p.description) + '</span></span></label>').join('') +
    '</fieldset>'
  )
}

/* ---------- readiness ---------- */

/** A pack's colour if it is one, else the game's green: it goes into a style, so nothing else may. */
const hex = (color: string): string => (/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#6DB24F')
const fieldHead = (r: ReadinessRow, tag = ''): string => '<div class="fh"><i style="background:' + hex(r.color) + '"></i>' + esc(r.title) + tag + '</div>'
const standing = (r: ReadinessRow): string => r.rooted + ' of ' + r.total + ' rooted · ' + r.growing + ' growing'

function readinessRowHtml(r: ReadinessRow, limits: { min: number; max: number }): string {
  const ready = r.readiness
  if (!ready) return '<div class="ready">' + fieldHead(r) + '<div class="sub">This field has no end, so it has no number and no bar. ' + standing(r) + '.</div></div>'
  const id = 'bar-' + esc(r.pack)
  // Each layer as the tree it grows into, faded where nothing stands yet.
  const layers = ready.layers.map((l) =>
    '<div class="lay' + (l.rooted === 0 ? ' hollow' : '') + '">' + iconHtml(cropSprite(l.layer, 4, true), 1) + '<span>' + esc(l.name) + ' <b>' + l.rooted + '</b> of ' + l.total + '</span></div>').join('')
  return (
    '<div class="ready">' + fieldHead(r, ready.atBar ? ' <span class="tag">at its bar</span>' : '') +
    '<div class="gauge" role="img" aria-label="Readiness ' + ready.percent + ', bar ' + ready.bar + '"><i style="width:' + ready.percent + '%;background:' + hex(r.color) + '"></i><b style="left:' + ready.bar + '%"></b></div>' +
    '<div class="sub"><b>' + ready.percent + '</b> · bar ' + ready.bar + ' · ' + standing(r) + '</div>' +
    (layers ? '<div class="layers">' + layers + '</div>' : '') +
    (ready.hollow.length ? '<div class="sub">Hollow: ' + esc(ready.hollow.join(', ')) + '.</div>' : '') +
    '<div class="setbar"><label for="' + id + '" class="sub">Your bar for this field</label>' +
    '<input type="number" id="' + id + '" class="write" min="' + limits.min + '" max="' + limits.max + '" step="1" inputmode="numeric" value="' + ready.bar + '">' +
    '<button type="button" data-act="setBar" data-arg="' + esc(r.pack) + '">Set bar</button></div>' +
    '</div>'
  )
}

const earnedRowHtml = (e: EarnedRow, field: string): string =>
  '<div class="row slim"><div class="n">' + esc(e.name) + '<small>' + esc(field) + ' · earned by ' + esc(e.line) + '</small></div>' +
  '<span class="sub">' + (e.met ? (e.locked ? 'earned, still locked by what it needs' : e.held ? 'earned, waiting for the ' + esc(e.held) + ' layer' : 'earned, ready to plant') : e.have + ' of ' + e.want) + '</span></div>'

/** The seeds that have still to be earned, under their own heading; nothing at all when there are none. */
export const earnedSectionHtml = (rows: readonly EarnedRow[], titleOf: (pack: string) => string): string =>
  rows.length
    ? '<h3>Earned by learning</h3><p class="sub">These seeds can be planted only once the learning is on your farm. A jump over the fence does not clear them.</p><div>' +
      rows.map((e) => earnedRowHtml(e, titleOf(e.pack))).join('') + '</div>'
    : ''

/** The seeds that layer balance holds back, under their own heading; nothing at all when there are none. `below` is how many layers down the rule looks. */
export const heldSectionHtml = (rows: readonly HeldRow[], below: number): string =>
  rows.length
    ? '<h3>Waiting for a lower layer</h3><p class="sub">A field is built from the ground up. A seed waits while a layer ' + below + ' or more beneath its own is hollow and has something you could plant.</p><div>' +
      rows.map((r) => '<div class="row slim"><div class="n">' + esc(r.name) + '<small>' + esc(r.layer) + ' · plant in the ' + esc(r.below) + ' layer first</small></div></div>').join('') + '</div>'
    : ''

/** How ready each field is, the bar it is held to, and what has still to be earned. `limits` is what a farmer may set a bar to. */
export function readinessSheetHtml(v: ReadinessView, limits: { min: number; max: number }): string {
  const title = (pack: string): string => v.rows.find((r) => r.pack === pack)?.title ?? pack
  return (
    '<h2>Readiness</h2><p class="sub">How much of each field stands as trees today. There are no dates here: a field is ready when it reaches the bar you set for it and none of its layers is hollow. A layer is hollow while none of its seeds stands as a tree.</p>' +
    (v.withBar ? '<p><b>' + v.atBar + ' of ' + v.withBar + '</b> ' + (v.withBar === 1 ? 'field is' : 'fields are') + ' at the bar.</p>' : '') +
    v.rows.map((r) => readinessRowHtml(r, limits)).join('') +
    earnedSectionHtml(v.earned, title) +
    '<h3>Where it leads</h3><p class="sub">Who would buy what you grow, how today compares with your own farm a month ago, and the weekly walk.</p>' +
    '<div class="branches"><button type="button" data-act="market">Market</button><button type="button" data-act="rival">Last month</button><button type="button" data-act="walk">Weekly walk</button></div>' +
    footHtml()
  )
}

/* ---------- neighbours ---------- */
// A name here was typed by someone else and arrived in a link. It is escaped everywhere, like all player and pack text.

const count = (n: number, one: string, many = one + 's'): string => n + ' ' + (n === 1 ? one : many)

/** Asking for the farm's name: needed before a farm can be shared. */
export function nameSheetHtml(current: string, max: number): string {
  return (
    '<h2>Name your farm</h2><p class="sub">Your neighbours see this name. 1 to ' + max + ' characters. You can change it later.</p>' +
    '<label for="farmName" class="sub">Farm name</label><input type="text" id="farmName" class="write" maxlength="' + max + '" value="' + esc(current) + '" autocomplete="off">' +
    '<div class="foot"><button type="button" data-act="close">Not now</button><button type="button" class="pri" data-act="saveName">Save name</button></div>'
  )
}

/** The sheet behind the gate. Neighbours come in the order they were added: no sorting, nothing to compare. */
export function neighboursSheetHtml(v: { name: string; shared: string | null; rows: readonly NeighbourRow[]; green: string }): string {
  const rows = v.rows.map((r) =>
    '<div class="row"><div class="n">' + esc(r.name) + '<small>' + (r.stale ? 'No recent picture. Ask for a new link.' : 'day ' + r.day + ' · picture ' + esc(r.age)) + '</small></div><span class="pair">' +
    (r.stale ? '' : '<button type="button" data-act="visit" data-arg="' + esc(r.code) + '">Visit</button>') +
    '<button type="button" class="link" data-act="removeNeighbour" data-arg="' + esc(r.code) + '">Remove</button></span></div>').join('')
  return (
    '<h2>Neighbours</h2><p class="sub">Farms you can see, and farmers who can see yours. Nobody is ranked.</p>' +
    '<div class="row"><div class="n">' + (v.name ? esc(v.name) : 'Your farm has no name yet') + '<small>Your farm · ' + (v.shared ? 'your last link was ' + esc(v.shared) : 'no link made yet') + '</small></div><button type="button" data-act="rename">' + (v.name ? 'Rename' : 'Name it') + '</button></div>' +
    '<div class="branches"><button type="button" data-act="share">Share my farm</button><button type="button" data-act="pasteLink">Paste a link</button></div>' +
    '<p class="sub">A link is a photograph: one already sent stays as it is until your neighbour opens a newer one.</p>' +
    '<h3>Your neighbours</h3>' +
    (rows ? '<div>' + rows + '</div>' : '<p class="sub">No neighbours yet. Send your farm link to a friend, and open theirs when they send one back.</p>') +
    '<p class="sub">Looking for neighbours? People post their farm links on the <a href="' + esc(v.green) + '" target="_blank" rel="noopener noreferrer">village green</a>.</p>' +
    footHtml()
  )
}

/** A crop on a neighbour's farm: what it is, how far it has grown, and how the same seed stands on your own farm. */
export function neighbourCropSheetHtml(chip: string, v: NeighbourCropView, owner: string): string {
  return (
    chip + '<h2>' + esc(v.name) + '</h2>' +
    '<p class="sub">' + esc(v.layer) + ' layer · ' + esc(v.stageLine) + '</p>' +
    '<p>Growing on ' + esc(owner) + "'s farm.</p>" +
    '<h3>On your farm</h3><p>' + esc(v.yours) + '</p>' +
    footHtml('Back')
  )
}

export interface ArrivalSheet {
  name: string
  day: number
  age: string
  /** Titles of the fields the picture shows. */
  fields: readonly string[]
  /** Crops left out because this game does not know them, and because they did not fit. Different causes, different words. */
  newer: number
  misfit: number
  /** The person opening the link has never set up a farm. */
  firstTime: boolean
}

/** What a farm link opens on. */
export function arrivalSheetHtml(v: ArrivalSheet): string {
  const about = '<p class="sub">Day ' + v.day + ' · picture ' + esc(v.age) + (v.fields.length ? ' · ' + v.fields.map(esc).join(', ') : '') + '</p>' +
    (v.newer ? '<p class="sub">' + count(v.newer, 'crop needs', 'crops need') + ' a newer version of the game, and ' + (v.newer === 1 ? 'is' : 'are') + ' not shown.</p>' : '') +
    (v.misfit ? '<p class="sub">' + count(v.misfit, 'crop') + ' did not fit on the map, and ' + (v.misfit === 1 ? 'is' : 'are') + ' not shown.</p>' : '')
  if (v.firstTime) {
    return (
      '<h2>You are looking at ' + esc(v.name) + "'s farm</h2>" +
      '<p>This is Permaculture: a farm where the crops are the things you are learning. Every crop here is something ' + esc(v.name) + ' is learning, and every tree is something they can now explain and prove.</p>' + about +
      '<p class="sub">Look around: drag to pan, tap a crop to see what it is. Then start a farm of your own next door.</p>' +
      '<div class="foot"><button type="button" data-act="close">Look around</button><button type="button" class="pri" data-act="startFromVisit">Start my own farm</button></div>'
    )
  }
  return (
    '<h2>' + esc(v.name) + "'s farm</h2><p>A neighbour has sent you a picture of their farm.</p>" + about +
    '<div class="foot"><button type="button" data-act="justLook">Just look</button><button type="button" class="pri" data-act="addNeighbour">Add to my neighbours</button></div>'
  )
}

export interface ShareSheet {
  name: string
  /** The farm's open fields, and which are ticked to be shown. */
  packs: readonly { pack: string; title: string; color: string; ticked: boolean }[]
  /** Null when no field is ticked. */
  view: Pick<ShareView, 'fields' | 'crops' | 'trees' | 'lostCrops' | 'lostLand'> | null
  url: string | null
  /** The device has its own share sheet. */
  canShare: boolean
}

/** Making a farm link: which fields, exactly what the link holds, and what a link is. */
export function shareSheetHtml(v: ShareSheet): string {
  const ticks = '<fieldset class="ticks"><legend>Fields to show</legend>' +
    v.packs.map((p) => '<label class="tick"><input type="checkbox" data-show="' + esc(p.pack) + '"' + (p.ticked ? ' checked' : '') + '> <span><b style="color:' + esc(p.color) + '">' + esc(p.title) + '</b></span></label>').join('') + '</fieldset>'
  const head = '<h2>Share my farm</h2><p>A farm link holds a picture of <b>' + esc(v.name) + '</b> as it is today. Send it in any chat you already use. Nothing is uploaded: the picture is inside the link itself.</p>' + ticks
  if (!v.view || v.url === null) return head + '<p>Tick at least one field to make a link.</p>' + footHtml()
  const lost = v.view.lostCrops + v.view.lostLand > 0
    ? ' With fields hidden, the ones you show are drawn side by side from the first plot, and ' + count(v.view.lostCrops, 'crop') + ' and ' + count(v.view.lostLand, 'fenced tile') + ' will not fit there.'
    : ''
  return (
    head +
    '<div class="res"><b>This link shows</b> your farm\'s name and day, ' + count(v.view.fields, 'field') + ', ' + count(v.view.crops, 'crop') + ' and ' + count(v.view.trees, 'tree') + ', each at the furthest it has grown.' + lost + '</div>' +
    '<p class="sub">It never shows your notes, explanations or write-ups, a wrong answer, the compost heap, a wilted crop, your coins, energy or rain barrel, or a field you left unticked.</p>' +
    '<p class="sub">A link is a photograph. It shows today and never updates, so send a new one to show progress. A sent link cannot be taken back, and one posted in public stays public. Every link from this farm carries the same farm code, so someone holding two of your links can tell they are one farm, and an older link may show a field a newer one hides.</p>' +
    '<label for="shareLink" class="sub">Your farm link</label><textarea id="shareLink" class="short" readonly rows="3">' + esc(v.url) + '</textarea>' +
    '<div class="branches"><button type="button" data-act="previewShare">See it as a neighbour will</button>' + (v.canShare ? '<button type="button" data-act="shareNative">Share…</button>' : '') + '</div>' +
    '<div class="foot"><button type="button" data-act="close">Close</button><button type="button" class="pri" data-act="copyShare">Copy link</button></div>'
  )
}
