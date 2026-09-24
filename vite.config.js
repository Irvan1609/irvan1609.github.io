import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        portfolio: resolve(process.cwd(), 'index.html'),
        stat: resolve(process.cwd(), 'stat/index.html'),
        printSkripsi: resolve(process.cwd(), 'print-skripsi/index.html'),
        mendeley: resolve(process.cwd(), 'mendeley/index.html'),
      },
    },
  },
})
