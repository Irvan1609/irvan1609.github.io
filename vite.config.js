import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        portfolio: resolve(process.cwd(), 'index.html'),
        stat: resolve(process.cwd(), 'stat/index.html'),
      },
    },
  },
})
