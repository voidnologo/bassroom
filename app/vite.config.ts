import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The coach server runs as a separate process so the Anthropic API key never
// reaches the browser bundle; Vite proxies /api to it during development.
const API_PROXY = {
  '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  // `vite preview` does not inherit the dev server's proxy, and without it the
  // coach and the telemetry log fail silently: a static server answers /api
  // with the app's own HTML, which is a 200 nothing checks.
  server: { port: 5173, proxy: API_PROXY },
  preview: { port: 4173, proxy: API_PROXY },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
