import { describe, expect, it } from 'vitest'
import { smallCatalog as cat } from '../engine/fixtures'
import type { Picture } from '../engine/picture'
import { RULES } from '../engine/rules'
import { ageText, bookText, emptyBook, readBook, receive, remove, tooOld, type Book } from './neighbours'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-20T12:00:00Z')
const OWN = 'ownownownown0'
const code = (n: number): string => String(n).padStart(13, '0')
const picture = (n: number, at = '2026-11-20T10:00:00Z', name = 'Farm ' + n): Picture => ({
  code: code(n), name, day: 5, at, game: '0.2.0', fields: [{ pack: 'garden', land: [], crops: [['corn', 0, 0, 2, 0]] }],
})
const got = (book: Book, p: Picture) => receive(book, p, OWN, NOW)

describe('receive', () => {
  it('adds a farm you have not met, in the order they arrive', () => {
    const a = got(emptyBook(), picture(1))
    const b = got(a.book, picture(2))
    expect([a.result, b.result]).toEqual(['added', 'added'])
    expect(b.book.neighbours.map((n) => n.picture.code)).toEqual([code(1), code(2)])
  })

  it('replaces the picture of a neighbour you have only with one made later', () => {
    const first = got(emptyBook(), picture(1, '2026-11-18T10:00:00Z', 'Old name')).book
    const newer = got(first, picture(1, '2026-11-19T10:00:00Z', 'New name'))
    expect(newer.result).toBe('updated')
    expect(newer.book.neighbours).toHaveLength(1)
    expect(newer.book.neighbours[0]?.picture.name).toBe('New name')
    // An old link tapped again can never roll a neighbour back, nor can one made at the very same moment.
    for (const at of ['2026-11-18T10:00:00Z', '2026-11-19T10:00:00Z']) {
      const again = got(newer.book, picture(1, at, 'Old name'))
      expect(again.result).toBe('not-newer')
      expect(again.book).toBe(newer.book)
    }
  })

  it('does not keep a picture made more than 60 days ago, your own farm, or a 25th neighbour', () => {
    expect(got(emptyBook(), picture(1, '2026-09-01T00:00:00Z')).result).toBe('too-old')
    expect(got(emptyBook(), { ...picture(1), code: OWN }).result).toBe('own')
    let book = emptyBook()
    for (let n = 1; n <= RULES.neighbours.max; n++) book = got(book, picture(n)).book
    const extra = got(book, picture(99))
    expect(extra.result).toBe('full')
    expect(extra.book.neighbours).toHaveLength(RULES.neighbours.max)
    // A neighbour you already have can still send a newer picture when the list is full.
    expect(got(book, picture(3, '2026-11-20T11:00:00Z')).result).toBe('updated')
  })

  it('never changes the book it was given', () => {
    const book = got(emptyBook(), picture(1)).book
    const frozen = JSON.stringify(book)
    got(book, picture(2))
    got(book, picture(1, '2026-11-20T11:00:00Z'))
    remove(book, code(1))
    expect(JSON.stringify(book)).toBe(frozen)
  })
})

describe('remove', () => {
  it('takes one neighbour off the list', () => {
    const book = got(got(emptyBook(), picture(1)).book, picture(2)).book
    expect(remove(book, code(1)).neighbours.map((n) => n.picture.code)).toEqual([code(2)])
  })
})

describe('age', () => {
  it('is told in days', () => {
    expect(ageText('2026-11-20T10:00:00Z', NOW)).toBe('made today')
    expect(ageText('2026-11-19T11:00:00Z', NOW)).toBe('1 day old')
    expect(ageText('2026-11-08T12:00:00Z', NOW)).toBe('12 days old')
    // A clock that is a little behind does not make a picture come from the future.
    expect(ageText('2026-11-20T13:00:00Z', NOW)).toBe('made today')
  })

  it('is too old after 60 days', () => {
    expect(tooOld(new Date(NOW - 60 * DAY).toISOString(), NOW)).toBe(false)
    expect(tooOld(new Date(NOW - 60 * DAY - 1000).toISOString(), NOW)).toBe(true)
  })
})

describe('the saved book', () => {
  it('reads back what was written', () => {
    const book: Book = { ...got(got(emptyBook(), picture(1)).book, picture(2)).book, shared: '2026-11-20T09:00:00Z' }
    expect(readBook(bookText(book), cat, NOW)).toEqual(book)
  })

  it('is empty when there is nothing saved or it cannot be read', () => {
    for (const bad of [null, '', '{oops', '7', '{"neighbours":5}']) expect(readBook(bad, cat, NOW)).toEqual(emptyBook())
  })

  it('checks every saved picture the way a link is checked, and keeps no more than a book holds', () => {
    const good = got(emptyBook(), picture(1)).book.neighbours[0]
    const many = Array.from({ length: 30 }, (_, i) => ({ ...good, picture: picture(i + 10) }))
    const text = JSON.stringify({ neighbours: [good, { picture: { ...picture(2), code: 'bad' }, added: 'x' }, 'junk', { ...good }, ...many], shared: 12 })
    const book = readBook(text, cat, NOW)
    expect(book.neighbours).toHaveLength(RULES.neighbours.max)
    expect(book.neighbours[0]?.picture.code).toBe(code(1))
    expect(book.neighbours[1]?.picture.code).toBe(code(10))
    expect(book.shared).toBeNull()
  })

  it('forgets a picture after 60 days but keeps the neighbour by name', () => {
    const old = { picture: picture(1, '2026-08-01T00:00:00Z'), added: '2026-08-01T00:00:00Z' }
    const book = readBook(JSON.stringify({ neighbours: [old], shared: null }), cat, NOW)
    expect(book.neighbours[0]?.picture).toMatchObject({ name: 'Farm 1', code: code(1), fields: [] })
  })
})
