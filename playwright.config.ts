import { defineConfig } from '@playwright/test';

// Same Node/npm and dependency tree as the Angular application.
export default defineConfig({
  testDir: './e2e/perps',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 400, height: 800 },
    locale: 'en-US',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run ng -- serve --configuration e2e --host 127.0.0.1 --port 4300',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
