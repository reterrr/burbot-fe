import { defineConfig } from '@playwright/test'

const origin = 'http://127.0.0.1:17513'

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.mjs',
  use: {
    baseURL: origin,
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.BURBOT_TEST_CHROMIUM },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 17513 --strictPort',
    url: origin,
    env: { BURBOT_REVIEW_GATEWAY: 'http://127.0.0.1:18089' },
  },
})
