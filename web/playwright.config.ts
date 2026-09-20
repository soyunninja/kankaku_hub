import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Lets an isolated/parallel test run (e.g. against a second local
  // stack) write results somewhere other than the default `test-results`
  // without colliding with a concurrently running default-config run.
  outputDir: process.env.PW_OUTPUT_DIR || undefined,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
