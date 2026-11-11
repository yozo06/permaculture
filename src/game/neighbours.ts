// The neighbours a game knows: an address book kept in the browser, beside the farm and not part of it.
// It is not in the farm's log or its export, and it survives a reset. A saved book is as untrusted as a link.
import type { Catalog } from '../engine/catalog'
import { readPicture, type Picture } from '../engine/picture'
import { RULES } from '../engine/rules'
import { isRecord } from '../engine/util'

export const BOOK_KEY = 'permaculture-neighbours'
const DAY_MS = 24 * 60 * 60 * 1000

export interface Neighbour {
  /** The latest picture of their farm. Once it is too old its fields are forgotten and only the name is kept. */
  picture: Picture
  /** When they were first added. */
  added: string
}

export interface Book {
  /** In the order they were added. Never sorted any other way: nobody is ranked. */
  neighbours: Neighbour[]
  /** When this game last made a farm link of its own, or null. */
  shared: string | null
}

export const emptyBook = (): Book => ({ neighbours: [], shared: null })

/** A picture is forgotten this many days after it was made. Calendar time, so it is checked here and not in the engine. */
export const tooOld = (at: string, nowMs: number): boolean => nowMs - Date.parse(at) > RULES.neighbours.forgetDays * DAY_MS

/** "made today", "1 day old", "12 days old". */
export function ageText(at: string, nowMs: number): string {
  const days = Math.max(0, Math.floor((nowMs - Date.parse(at)) / DAY_MS))
  return days === 0 ? 'made today' : days + (days === 1 ? ' day old' : ' days old')
}

export type Arrival = 'added' | 'updated' | 'not-newer' | 'too-old' | 'full' | 'own'

/**
 * A picture has arrived. `own` is this farm's code. The later of two pictures of a farm is the one kept, so an old
 * link tapped again can never roll a neighbour back or bring back a field they have since hidden.
 */
export function receive(book: Book, picture: Picture, own: string, nowMs: number): { book: Book; result: Arrival } {
  if (picture.code === own) return { book, result: 'own' }
  if (tooOld(picture.at, nowMs)) return { book, result: 'too-old' }
  const i = book.neighbours.findIndex((n) => n.picture.code === picture.code)
  const have = book.neighbours[i]
  if (have) {
    if (Date.parse(picture.at) <= Date.parse(have.picture.at)) return { book, result: 'not-newer' }
    const neighbours = book.neighbours.slice()
    neighbours[i] = { ...have, picture }
    return { book: { ...book, neighbours }, result: 'updated' }
  }
  if (book.neighbours.length >= RULES.neighbours.max) return { book, result: 'full' }
  return { book: { ...book, neighbours: [...book.neighbours, { picture, added: new Date(nowMs).toISOString() }] }, result: 'added' }
}

export const remove = (book: Book, code: string): Book => ({ ...book, neighbours: book.neighbours.filter((n) => n.picture.code !== code) })

export const bookText = (book: Book): string => JSON.stringify(book)

/** Read a saved book. Every picture is checked the way a link is; what cannot be read is dropped. Never throws. */
export function readBook(text: string | null, catalog: Catalog, nowMs: number): Book {
  const book = emptyBook()
  if (!text) return book
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return book }
  if (!isRecord(raw) || !Array.isArray(raw.neighbours)) return book
  for (const item of raw.neighbours) {
    if (book.neighbours.length >= RULES.neighbours.max) break
    const read = isRecord(item) ? readPicture(item.picture, catalog, nowMs) : null
    if (!read || !isRecord(item) || book.neighbours.some((n) => n.picture.code === read.picture.code)) continue
    // Forgotten after its time: the neighbour stays on the list by name until a new link arrives.
    const picture = tooOld(read.picture.at, nowMs) ? { ...read.picture, fields: [] } : read.picture
    book.neighbours.push({ picture, added: typeof item.added === 'string' ? item.added.slice(0, 40) : '' })
  }
  if (typeof raw.shared === 'string' && Number.isFinite(Date.parse(raw.shared))) book.shared = raw.shared.slice(0, 40)
  return book
}
