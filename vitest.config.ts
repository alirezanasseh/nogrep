import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['tests/fixtures/**', 'node_modules/**'],
  },
})
