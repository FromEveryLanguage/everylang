import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: true,
    // Viewers bring whatever phone they own, so build for older ones than Vite's default.
    // The CSS target matters most: Tailwind v4 writes every theme color as oklch() with no
    // fallback, and a browser without oklch drops all the colors without any error.
    // Lowering cssTarget makes Lightning CSS emit hex values, with the wide-gamut versions
    // in @supports blocks. The floor is Tailwind's @layer, which can't be lowered and needs
    // Chrome 99 / Safari 15.4.
    target: ['chrome99', 'safari15'],
    cssTarget: ['chrome99', 'safari15'],
  },
  server: {
    port: 5008,
    allowedHosts: ["localhost", "127.0.0.1", "dev8.kenarnold.org"],
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/socket': {
        target: 'ws://localhost:8000',
        ws: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Claude Code worktrees are full checkouts under .claude/, so without this a run from
    // the repo root also collects every test in every worktree and reports their stale
    // copies as failures of this one.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  }
})
