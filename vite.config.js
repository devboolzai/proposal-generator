import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run dev` now runs the real API: `node server.js` beside it, and this
// proxy in front. That is the whole local setup — `vercel dev` is gone, and
// with it the rule that PDF and Word export only worked in deployment.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
})
