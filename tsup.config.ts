import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/*.ts'],
  outDir: 'plugins/nogrep/scripts',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: ['js-yaml', 'gray-matter', 'glob'],
})
