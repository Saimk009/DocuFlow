import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-')) return 'recharts'
          if (id.includes('reactflow') || id.includes('@reactflow')) return 'reactflow'
          if (id.includes('framer-motion')) return 'motion'
          if (
            id.includes('react') ||
            id.includes('scheduler') ||
            id.includes('@tanstack') ||
            id.includes('zustand')
          )
            return 'vendor'
          return undefined
        },
      },
    },
  },
})
