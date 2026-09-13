import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT || '3002';
const BASE_URL = process.env.PROD_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './src/tests/e2e',
  testMatch: /production-.*\.spec\.ts$/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 45000,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../scratch/playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 12000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
      },
    }
  ],
});
