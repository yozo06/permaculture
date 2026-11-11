// HTML for the sheets of the depth ladder: plant with notes, explain, write up, and the crop sheet.
// Pure strings in, strings out, so they can be tested without a browser. Everything that came from a player or a pack is escaped.
import type { CropView, PickerPack, SourceLink } from './views'
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
}

/** Tapping soil with a seed in hand: read, then write your notes before the seed goes in. */
export function plantSheetHtml(p: PlantSheet): string {
  return (
    p.chip + '<h2>Plant · ' + esc(p.name) + '</h2>' +
    '<p class="sub">' + esc(p.layer) + ' layer · <span class="tag">' + esc(p.harvest) + '</span></p>' +
    (p.summary ? '<p>' + esc(p.summary) + '</p>' : '') +
    (p.minutes ? '<p class="sub">About ' + p.minutes + ' minutes of reading.</p>' : '') +
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
