import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ── Public queue display (no /v1 prefix on server) ──────────────────
      // This MUST come before the generic '/api' rule so Vite matches it first.
      '/api/queue': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // No rewrite — server mounts this at /api/queue (not /api/v1/queue)
      },
      // ── All other API calls → /api/v1/... ───────────────────────────────
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api/v1'),
      },
    },
  },
})