import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  outputDir: '../../dist/.playwright/apps/analog-app-e2e/output',
  use: {
    baseURL: 'http://localhost:43000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx nx serve-nitro analog-app',
    url: 'http://localhost:43000',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    cwd: '../..',
  },
});
