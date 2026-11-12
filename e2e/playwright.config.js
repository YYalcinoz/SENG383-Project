import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const dir = path.dirname(fileURLToPath(import.meta.url))

// E2E testleri geliştirme ortamından ayrı çalışır: kendi veritabanı dosyası ve kendi
// portları var. Böylece açık bir `npm start` / `npm run dev` ile çakışmaz ve testler
// geliştirme veritabanını (server/database.db) asla silmez.
const BACKEND_PORT = 3100
const FRONTEND_PORT = 5180
const DATA_DIR = path.join(dir, '.data')
const DB_PATH = path.join(DATA_DIR, 'e2e.db')
fs.mkdirSync(DATA_DIR, { recursive: true })

export default defineConfig({
  testDir: './tests',
  // Testler aynı veritabanını paylaşıyor; sırayla çalışsınlar ki biri diğerinin verisini bozmasın
  workers: 1,
  fullyParallel: false,
  // CI'da yanlışlıkla bırakılan test.only bütün testleri atlatmasın
  forbidOnly: !!process.env.CI,
  // Yeniden deneme yok: titrek bir test gizlenmesin, düzeltilsin
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    // Başarısız bir testin adım adım kaydı ve ekran görüntüsü HTML raporda kalır
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Her çalıştırmada temiz seed verisiyle başlar
      command: 'npm run seed && npm start',
      cwd: path.join(dir, '../server'),
      env: { ...process.env, DB_PATH, PORT: String(BACKEND_PORT), JWT_SECRET: 'e2e-only-secret' },
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      // Var olan bir sunucuyu asla kullanma: yanlış veritabanına bağlanmış olabilir
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      cwd: path.join(dir, '../client'),
      env: { ...process.env, API_URL: `http://localhost:${BACKEND_PORT}` },
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
