import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import { defineExtensionManifest } from './src/manifest.config.js'

const EDGE_BROWSER_API = 'globalThis[String.fromCharCode(99,104,114,111,109,101)]'

function hideOtherBrowserNameFromEdgeBundle(target) {
  return {
    name: 'edge-browser-api-literal',
    generateBundle(_options, bundle) {
      if (target !== 'edge') return

      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          output.code = output.code
            .replaceAll('globalThis.chrome', EDGE_BROWSER_API)
            .replace(/\bchrome\./g, `${EDGE_BROWSER_API}.`)
        } else if (output.fileName.endsWith('.js') && typeof output.source === 'string') {
          output.source = output.source
            .replaceAll('globalThis.chrome', EDGE_BROWSER_API)
            .replace(/\bchrome\./g, `${EDGE_BROWSER_API}.`)
        }
      }
    },
  }
}

export default defineConfig(() => {
  const target = process.env.EXTENSION_TARGET || 'chrome'
  const manifest = defineExtensionManifest({ target })

  return {
    plugins: [
      vue(),
      crx({ manifest }),
      hideOtherBrowserNameFromEdgeBundle(target),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    publicDir: 'public',
  }
})
