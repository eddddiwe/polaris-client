import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Static showcase site. No build step is required to develop it; Vite is only
// a local server and an optional way to produce out/site for hosting.
export default defineConfig({
  root: resolve(__dirname, 'site'),
  base: './',
  server: {
    port: 4180,
    strictPort: true,
    // The published installer lives under public/downloads. Watching a ~80 MB
    // file can fail with EBUSY on Windows, and it never needs HMR.
    watch: {
      ignored: ['**/public/downloads/**']
    }
  },
  preview: {
    port: 4180,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'out/site'),
    emptyOutDir: true
  }
})
