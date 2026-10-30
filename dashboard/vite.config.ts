import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cockpit: fileURLToPath(new URL('./cockpit.html', import.meta.url)),
      },
    },
  },
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
