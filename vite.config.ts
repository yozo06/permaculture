import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { collectPacks, defaultPacksDir } from './scripts/packs-lib.mjs'

const VIRTUAL_ID = 'virtual:packs'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/** Serves every packs/*.yaml as `virtual:packs`. A broken pack fails the build with the validator's messages. */
function packs(): Plugin {
  const isPackFile = (file: string) => path.dirname(file) === defaultPacksDir && /\.ya?ml$/.test(file)
  return {
    name: 'permaculture-packs',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return undefined
      return 'export default ' + JSON.stringify(collectPacks(defaultPacksDir))
    },
    // In dev, adding, editing or removing a pack reloads the page with the new packs.
    hotUpdate({ file }) {
      if (!isPackFile(file)) return undefined
      const mod = this.environment.moduleGraph.getModuleById(RESOLVED_ID)
      if (mod) this.environment.moduleGraph.invalidateModule(mod)
      if (this.environment.name === 'client') this.environment.hot.send({ type: 'full-reload' })
      return []
    },
  }
}

/**
 * What the build calls itself, shown in the Almanac: the version in package.json and, when git can say,
 * the commit being built, as "0.1.0 (a031b7a)". A build outside a git checkout is just the version.
 */
function appVersion(): string {
  const root = path.dirname(defaultPacksDir)
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return commit ? version + ' (' + commit + ')' : version
  } catch {
    return version
  }
}

export default defineConfig({
  base: '/permaculture/',
  plugins: [packs()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
})
