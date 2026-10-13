import { defineConfig } from 'vitest/config'

// Unit tests cover the pure layers (music theory, judging, scheduling,
// progression). Anything that needs Web Audio is isolated behind an interface
// and exercised with fakes, so the suite runs in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/ui/**', 'src/main.tsx'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
})
