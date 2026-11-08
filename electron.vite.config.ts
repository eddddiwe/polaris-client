import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const cspPlugin = {
  name: 'polaris-csp',
  transformIndexHtml(html: string, ctx: { server?: unknown }): string {
    const dev = Boolean(ctx.server)
    const script = dev ? "'self' 'unsafe-inline'" : "'self'"
    const connect = dev
      ? "'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*"
      : "'self'"
    return html
      .replace('__POLARIS_SCRIPT_SRC__', script)
      .replace('__POLARIS_CONNECT_SRC__', connect)
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    },
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), cspPlugin],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      // electron-vite defaults renderer minification off; React DOM is 82% of
      // the entry chunk, so minify the production bundles (Vite's default).
      minify: 'esbuild',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom']
          }
        }
      }
    }
  }
})
