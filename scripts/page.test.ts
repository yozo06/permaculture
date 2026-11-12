/// <reference types="node" />
// The game promises to track nobody. A font, script or stylesheet fetched from another site would tell that site
// about every visit, so the page must load nothing but its own files.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

describe('the page', () => {
  it('loads no stylesheet, script, font or image from another site', () => {
    const html = read('index.html')
    const loaded = [...html.matchAll(/<(?:link|script|img|iframe|source)\b[^>]*?\b(?:href|src)\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1] ?? '')
    expect(loaded.length).toBeGreaterThan(0)
    expect(loaded.filter((url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url))).toEqual([])
  })

  it('has no style that reaches another site', () => {
    const css = read('src/style.css')
    expect(css).not.toMatch(/@import/i)
    expect([...css.matchAll(/url\(\s*["']?([^"')\s]+)/gi)].map((m) => m[1] ?? '').filter((url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url))).toEqual([])
  })

  it('names fonts the game carries itself', () => {
    const css = read('src/style.css')
    const main = read('src/main.ts')
    for (const family of ['Pixelify Sans Variable', 'DM Sans Variable']) expect(css).toContain("'" + family + "'")
    expect(main).toContain("'@fontsource-variable/pixelify-sans/wght.css'")
    expect(main).toContain("'@fontsource-variable/dm-sans/wght.css'")
  })
})
