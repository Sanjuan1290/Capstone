import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Keep per-file progress from flooding interactive Windows terminals.
    reporters: ['dot'],
    testTimeout: 10000,
    // node:test suites emit TAP output but are not Vitest suites.
    // Preserve Vitest's own default exclusions and run these via test:node.
    exclude: [...configDefaults.exclude, '**/*.node.cjs', '**/*.node.test.cjs'],
  },
})

