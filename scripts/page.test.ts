/// <reference types="node" />
// The game promises to track nobody. A font, script or stylesheet fetched from another site would tell that site
// about every visit, and so would any call the code made by itself. So the page loads nothing but its own files,
// and the code never calls out.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
/** Every address of another site in a text, however it is written: with a scheme, or starting at the two slashes. */
const addresses = (text: string): string[] => [...text.matchAll(/(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>)]+/gi)].map((m) => m[0])
/** The game's own code, without its tests. */
const sources = (dir: string): string[] =>
  readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(dir + '/' + e.name) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [dir + '/' + e.name] : [])

describe('the page', () => {
  it('names no other site, except for the picture a chat app shows beside a farm link', () => {
    // Whatever tag or attribute it sat in, an address here could be fetched; the preview picture is fetched by the chat app, never by the game.
    expect(addresses(read('index.html'))).toEqual(['https://yozo06.github.io/permaculture/og.jpg'])
  })

  it('has no styles of its own in the page, where the check on the stylesheet would not see them', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/<style\b/i)
    expect(html).not.toMatch(/\bstyle\s*=/i)
    expect(html).not.toMatch(/@import/i)
    expect(html.match(/<script\b[^>]*>/gi)).toEqual(['<script type="module" src="/src/main.ts">'])
  })

  it('has a stylesheet that names no other site', () => {
    const css = read('src/style.css')
    expect(css).not.toMatch(/@import/i)
    expect(addresses(css)).toEqual([])
  })

  it('carries its own fonts: they are installed, imported and the ones the styles ask for', () => {
    const packages = Object.keys((JSON.parse(read('package.json')) as { devDependencies: Record<string, string> }).devDependencies)
    const imports = read('src/main.ts').split('\n').map((l) => l.trim())
    for (const font of ['pixelify-sans', 'dm-sans']) {
      expect(packages).toContain('@fontsource-variable/' + font)
      expect(imports).toContain("import '@fontsource-variable/" + font + "/wght.css'")
    }
    const css = read('src/style.css')
    expect(css).toMatch(/--font-display:'Pixelify Sans Variable','DM Sans Variable',/)
    expect(css).toMatch(/--font-body:'DM Sans Variable',/)
  })
})

describe("the game's code", () => {
  const files = sources('src')

  it('never calls out: there is no server to call', () => {
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      expect(read(file), file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image\b|serviceWorker|importScripts/)
    }
  })

  it('names only fonts the game carries when it draws text itself', () => {
    const named = files.flatMap((file) => [...read(file).matchAll(/font-family\s*[=:]\s*\\?["']([^"',\\]+)/g)].map((m) => m[1]))
    expect(named.length).toBeGreaterThan(0)
    for (const family of named) expect(['DM Sans Variable', 'Pixelify Sans Variable']).toContain(family)
  })
})
