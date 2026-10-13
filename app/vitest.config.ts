import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Two kinds of test live in one suite.
 *
 * Everything pure - music theory, DSP, judging, scheduling - runs in plain
 * Node, which is fast and keeps those layers honest about not needing a
 * browser. Screen tests opt into jsdom with a `@vitest-environment jsdom`
 * docblock, so the cost is paid only where it buys something.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['test/support/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/audio/worklet/pitch-processor.ts'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
})
