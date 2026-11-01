import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/permaculture/',
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
