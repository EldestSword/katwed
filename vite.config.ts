import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __KATWED_BUILD_MODE__: JSON.stringify(mode),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    env: {
      VITE_DEMO_MODE: 'true',
    },
    css: true,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
}))
