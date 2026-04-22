import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/vercel/index.ts',
    'src/mastra/index.ts',
    'src/openai/index.ts',
  ],
  format: ['esm'],
  dts: true,
  tsconfig: 'tsconfig.json',
  clean: true,
  sourcemap: true,
  treeshake: true,
})
