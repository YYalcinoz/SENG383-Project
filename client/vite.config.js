import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // E2E testleri backend'i başka bir portta çalıştırır (e2e/playwright.config.js)
      '/api': process.env.API_URL || 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/testUtils.js', 'src/main.jsx'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // NFR-05: branch coverage en az %60 (v1.0 hedefi). Altına düşerse CI kırmızı olur.
      thresholds: { branches: 60 },
    },
  },
})