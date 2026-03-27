import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // This is your Base URL routing to the Node.js backend
        target: 'https://ai-db-backend1.onrender.com',
        changeOrigin: true,
      }
    }
  }
})
