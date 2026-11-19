// The reader's English: what its notes say, for a program that shows them to a person who reads English.
import type { Note } from './read.ts'

const counted = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many)

const SENTENCES: { readonly [C in Note['code']]: (n: Extract<Note, { code: C }>) => string } = {
  'lines-cut': (n) => 'Read the first ' + (n.kept === 1 ? 'line' : n.kept + ' lines') + ' only; the text has ' + n.of + '.',
  'long-lines-cut': (n) => 'Read only the first ' + n.kept + ' characters of ' + counted(n.count, 'very long line.', 'very long lines.'),
  'columns-left-out': () => 'Read the first two columns of each line as a card, and left the others out.',
  'code-left-out': (n) => 'Left out ' + counted(n.count, 'block of code.', 'blocks of code.'),
  'wordless-left-out': (n) => 'Left out ' + counted(n.count, 'line with no words in it.', 'lines with no words in them.'),
  'course-left-out': (n) =>
    'Left out, as not something to learn: ' + n.items.map((i) => i.text + (i.under ? ' (and the ' + counted(i.under, 'line', 'lines') + ' under it)' : '')).join(', ') + (n.more ? ', and ' + n.more + ' more' : ''),
  'title-taken': (n) => 'Read as the title of the whole list, not as a topic: ' + n.text,
  'wordless-name-left-out': () => 'Left out a line whose first part has no words in it.',
  'twice-left-out': (n) => 'Left out, because it is there twice: ' + n.text,
  'name-shortened': (n) => 'Shortened, with the whole line kept as what to read: ' + n.text,
  'summary-cut': (n) => 'Cut short, the line on what to read for: ' + n.text,
  'text-left-out': (n) => 'Left out the text under ' + counted(n.count, 'heading.', 'headings.'),
  'more-notes': (n) => 'And ' + n.count + ' more like these.',
}

/** A note in English. A note this file has no sentence for, from a reader newer than it, is said as its code. */
export const say = (note: Note): string => (Object.hasOwn(SENTENCES, note.code) ? (SENTENCES[note.code] as (n: Note) => string)(note) : note.code)
