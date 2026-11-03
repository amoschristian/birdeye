import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:9732',
        ws: true,
      },
      '/api': 'http://localhost:9732',
    },
  },
})
