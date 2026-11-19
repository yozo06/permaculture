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

  it('describes a folder that leans on nothing outside it, and that the game enters by one door', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? files(dir + '/' + f.name) : f.name.endsWith('.ts') ? [dir + '/' + f.name] : []))
    const imports = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/\bfrom '([^']+)'/g)].map((m) => m[1] ?? '')
    for (const file of files('src/reader')) {
      for (const from of imports(file)) expect(/^\.\/[\w.-]+\.ts$/.test(from) || (file.endsWith('.test.ts') && /^(node:fs|vitest|fast-check)$/.test(from)), file + ' imports ' + from).toBe(true)
    }
    for (const file of files('src').filter((f) => !f.startsWith('src/reader/'))) {
      for (const from of imports(file)) if (from.includes('reader')) expect(/^(\.\.\/)+reader$/.test(from), file + ' imports ' + from).toBe(true)
    }
  })
})
