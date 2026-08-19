import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Durante o desenvolvimento (npm run dev), o Vite repassa as chamadas /api
// para o servidor Node que roda o Tor. Em produção o próprio servidor serve o
// frontend compilado, então o proxy não é usado.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
