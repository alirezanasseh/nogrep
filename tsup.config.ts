import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/*.ts'],
  outDir: 'plugins/nogrep/scripts',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: 'node',
  noExternal: ['js-yaml', 'gray-matter', 'glob'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
