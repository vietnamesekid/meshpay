import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  tsconfig: 'tsconfig.json',
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['viem'],
})
