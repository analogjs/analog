import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  outputDir: '../../dist/.playwright/apps/tailwind-debug-app-e2e/output',
  use: {
    baseURL: 'http://localhost:43040',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --config apps/tailwind-debug-app/vite.config.ts',
    url: 'http://localhost:43040',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    cwd: '../..',
  },
});
