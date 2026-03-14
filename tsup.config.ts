import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/*.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
