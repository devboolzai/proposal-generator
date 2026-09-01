import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // `vercel dev` fronts this app and serves api/ itself, so the Vite dev
    // server only ever needs to hand back the client bundle.
    port: 5174,
  },
})
