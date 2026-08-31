import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // lottie-react's "browser" field points at a UMD bundle whose default
      // export is the whole CJS exports object, not the Lottie component —
      // force resolution to the ESM build where default export is correct.
      'lottie-react': 'lottie-react/build/index.es.js',
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
