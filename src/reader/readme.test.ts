import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as door from './index.ts'
import { BOUNDS } from './read.ts'

const page = readFileSync('src/reader/README.md', 'utf8')
/** The first block of the page written in this language. */
const block = (lang: string): string => {
  const found = new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```').exec(page)
  if (!found) throw new Error('no ' + lang + ' block in the page')
  return found[1] ?? ''
}

describe('src/reader/README.md', () => {
  it('shows an example that reads as the page says it does', () => {
    const draft = door.read(block('text'))
    expect(draft).toEqual(JSON.parse(block('json')))
    expect(draft.notes.length).toBeGreaterThan(0)
    for (const note of draft.notes) expect(page).toContain(door.say(note))
  })

  it('gives every limit with its own number and the range it can be set in', () => {
    const keys = Object.keys(door.LIMITS) as (keyof door.Limits)[]
    expect(keys.sort()).toEqual(Object.keys(BOUNDS).sort())
    for (const key of keys) expect(page).toContain('| `' + key + '` | ' + door.LIMITS[key] + ' | ' + BOUNDS[key][0] + ' to ' + BOUNDS[key][1] + ' |')
    // The range it gives is the range the reader keeps to.
    for (const key of keys) {
      const [least, most] = BOUNDS[key]
      expect(door.LIMITS[key], key).toBeGreaterThanOrEqual(least)
      expect(door.LIMITS[key], key).toBeLessThanOrEqual(most)
    }
  })

  it('lists every code a note can have, and no other', () => {
    const notes = page.slice(page.indexOf('\n## Notes'), page.indexOf('\n## Another language'))
    const listed = [...notes.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1])
    expect(listed.sort()).toEqual([...door.NOTE_CODES].sort())
  })

  it('names everything the front door hands out', () => {
    for (const name of Object.keys(door)) expect(page, name).toContain('`' + name + '`')
  })

  it('names every file in the folder', () => {
    for (const file of readdirSync('src/reader')) if (file !== 'README.md' && file !== 'tsconfig.json') expect(page, file).toContain('`' + file + '`')
  })
})
