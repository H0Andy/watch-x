import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

const electronExternals = [
  'systeminformation',
  'macos-temperature-sensor',
  'osx-temperature-sensor',
]

export default defineConfig({
  base: './',
  server: {
    watch: {
      // Ignore native/.NET POC build artifacts — watching them causes EBUSY crashes on Windows.
      ignored: ['**/tools/**', '**/helpers/**', '**/release/**', '**/.git/**'],
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            // Force a classic CommonJS preload that Electron can load reliably.
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.js',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
})
