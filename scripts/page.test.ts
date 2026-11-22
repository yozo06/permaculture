/// <reference types="node" />
// The game promises to track nobody. A font, script or stylesheet fetched from another site would tell that site
// about every visit, and so would any call the code made by itself. So the page loads nothing but its own files,
// and the code never calls out.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
/** Every address of another site in a text, however it is written: with a scheme, or starting at the two slashes. */
const addresses = (text: string): string[] => [...text.matchAll(/(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>)]+/gi)].map((m) => m[0])
/** Every file under a folder whose name fits. */
const filesIn = (dir: string, fits: (name: string) => boolean): string[] =>
  readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(dir + '/' + e.name, fits) : fits(e.name) ? [dir + '/' + e.name] : [])
/** Every stylesheet the game could ship: the ones the code imports and the ones served as they are. */
const stylesheets = [...filesIn('src', (n) => n.endsWith('.css')), ...filesIn('public', (n) => n.endsWith('.css'))]
/** Fonts every device has, by their CSS names. */
const GENERIC = ['system-ui', 'sans-serif', 'ui-monospace', 'monospace']
const CARRIED = ['Pixelify Sans Variable', 'DM Sans Variable']

describe('the page', () => {
  it('names no other site, except for the picture a chat app shows beside a farm link', () => {
    // Whatever tag or attribute it sat in, an address here could be fetched; the preview picture is fetched by the chat app, never by the game.
    expect(addresses(read('index.html'))).toEqual(['https://yozo06.github.io/permaculture/og.jpg'])
  })

  it('shows one picture of its own, the sprite sheet, from among its own files', () => {
    const pictures = [...read('index.html').matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    expect(pictures).toEqual(['<img id="sheetArt" src="/src/game/art/sheet.png" alt="" hidden>'])
  })

  it('has no styles of its own in the page, where the check on the stylesheet would not see them', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/<style\b/i)
    expect(html).not.toMatch(/\bstyle\s*=/i)
    expect(html).not.toMatch(/@import/i)
    expect(html.match(/<script\b[^>]*>/gi)).toEqual(['<script type="module" src="/src/main.ts">'])
  })

  it('has no stylesheet that names another site', () => {
    expect(stylesheets).toContain('src/style.css')
    for (const file of stylesheets) {
      expect(read(file), file).not.toMatch(/@import/i)
      expect(addresses(read(file)), file).toEqual([])
    }
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
    // Every font any style names is one of those two, a font every device has, or one of the two variables.
    for (const file of stylesheets) {
      const lists = [...read(file).matchAll(/(?:font-family|--font-[a-z-]+)\s*:([^;}]+)/g)].map((m) => m[1] ?? '')
      for (const name of lists.flatMap((l) => l.split(',')).map((n) => n.trim().replace(/^['"]|['"]$/g, ''))) {
        expect([...CARRIED, ...GENERIC, 'var(--font-display)', 'var(--font-body)'], file).toContain(name)
      }
    }
  })
})

describe("the game's code", () => {
  const files = filesIn('src', (n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
  const code = files.map((file) => ({ file, text: read(file) }))

  it('never calls out: there is no server to call', () => {
    expect(files.length).toBeGreaterThan(10)
    for (const { file, text } of code) {
      expect(text, file).not.toMatch(/\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource|serviceWorker|importScripts|\bnew (?:Image|Audio|Worker)\b/)
    }
  })

  it('names other sites only as links the player taps: the village green, and the AI chats in a file of their own', () => {
    const named = code.flatMap(({ file, text }) => [...text.matchAll(/(?:https?|wss?|ftp):\/\/[^\s"'`<>)]+|["'`]\/\/[^\s"'`<>)]+/g)].map((m) => ({ file, at: m[0] })))
    expect(named.filter((n) => n.file !== 'src/game/chats.ts').map((n) => n.at)).toEqual(['https://github.com/yozo06/permaculture/discussions'])
    expect(named.filter((n) => n.file === 'src/game/chats.ts').map((n) => n.at)).toEqual([
      'https://chatgpt.com/', 'https://chatgpt.com/?q=', 'https://grok.com/', 'https://grok.com/?q=', 'https://claude.ai/new', 'https://gemini.google.com/app', 'https://copilot.microsoft.com/',
    ])
  })

  it('builds nothing that would fetch by itself: no picture, frame, script or stylesheet made in code', () => {
    for (const { file, text } of code) {
      expect(text, file).not.toMatch(/<(?:img|iframe|script|link|source|audio|video|embed|object|base)\b/i)
      const made = [...text.matchAll(/createElement\(\s*([^)]*)\)/g)].map((m) => m[1] ?? '')
      for (const what of made) expect(["'canvas'", "'div'", "'a'"], file).toContain(what)
    }
  })

  it('names only fonts the game carries when it draws text itself', () => {
    const named = code.flatMap(({ text }) => [...text.matchAll(/font-family\s*[=:]\s*\\?["']?([^"',;\\]+)/g)].map((m) => (m[1] ?? '').trim()))
    expect(named.length).toBeGreaterThan(0)
    for (const family of named) expect(CARRIED).toContain(family)
    // Nor does it set a font from code, where this check could not read the name.
    for (const { file, text } of code) expect(text, file).not.toMatch(/fontFamily|\.font\s*=/)
  })
})
