import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // During local dev, proxy API calls to SAM local (port 3001)
      '/api': {
        target: 'http://localhost:3001',
        rewrite: path => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
})
