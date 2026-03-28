import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    host: true,   // bind to 0.0.0.0 so Docker port mapping works
    proxy: {
      '/api': {
        // Override with API_TARGET env var when running inside Docker
        // (docker-compose sets API_TARGET=http://backend:3001)
        target: process.env.API_TARGET || 'http://localhost:3001',
        rewrite: path => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
})
