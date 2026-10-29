import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer-only preview. Runs the UI in a normal browser against the mock API
// (window.polaris is absent) for design review without launching Electron.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 5178,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true
  }
})
