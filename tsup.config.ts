import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/*.ts'],
  outDir: 'plugin/dist',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
