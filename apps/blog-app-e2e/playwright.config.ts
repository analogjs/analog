import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  outputDir: '../../dist/.playwright/apps/blog-app-e2e/output',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx nx serve-nitro blog-app',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    cwd: '../..',
    timeout: 160000,
  },
});
