import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  outputDir: '../../dist/.playwright/apps/blog-app-e2e/output',
  use: {
    baseURL: 'http://localhost:43010',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm nx serve-nitro blog-app',
    url: 'http://localhost:43010',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    cwd: '../..',
    timeout: 160000,
  },
});
