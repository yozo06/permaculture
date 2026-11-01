import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
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

export default defineConfig({
  base: '/permaculture/',
  plugins: [packs()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
})
