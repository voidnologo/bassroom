import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Builds the AudioWorklet processor as a standalone IIFE in public/.
 *
 * AudioWorklet modules are fetched and compiled by the browser's audio thread
 * and cannot resolve bare imports, so the processor has to ship as one flat
 * file. Bundling it from TypeScript rather than hand-writing that file keeps
 * the DSP in `src/audio/dsp`, where the unit tests can reach it.
 */
export default defineConfig({
  // outDir is public/, so the public-directory copy step must be off.
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    lib: {
      entry: fileURLToPath(new URL('./src/audio/worklet/pitch-processor.ts', import.meta.url)),
      formats: ['iife'],
      name: 'BassroomPitchProcessor',
      fileName: () => 'pitch-processor.js',
    },
  },
})
