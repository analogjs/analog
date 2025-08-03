---
sidebar_position: 3
title: Playwright E2E Testing in Analog - Complete End-to-End Testing Guide
description: Learn how to set up and use Playwright for end-to-end testing in Analog applications. Cross-browser testing, reliable automation, and debugging tools.
keywords:
  [
    'Playwright',
    'E2E testing',
    'end-to-end testing',
    'cross-browser',
    'automation',
    'testing framework',
    'browser testing',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/testing/playwright
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Testing
tags: ['playwright', 'e2e', 'testing', 'automation']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Playwright Testing

Analog provides excellent support for end-to-end testing with [Playwright](https://playwright.dev), a powerful testing framework for modern web applications.

## Overview

Playwright enables you to write reliable end-to-end tests that work across all modern browsers:

- **Cross-browser**: Test in Chromium, Firefox, and WebKit
- **Fast**: Parallel execution and smart waiting
- **Reliable**: Auto-waiting and retry mechanisms
- **Powerful**: Network interception, geolocation, and more
- **Debugging**: Excellent debugging tools and trace viewer

## Setup

### Installation

Install Playwright in your Analog project:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```bash title="Install Playwright with npm"
npm install -D @playwright/test
npx playwright install
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```bash title="Install Playwright with Yarn"
yarn add -D @playwright/test
yarn playwright install
```

  </TabItem>

  <TabItem value="pnpm">

```bash title="Install Playwright with pnpm"
pnpm add -D @playwright/test
pnpm playwright install
```

  </TabItem>

  <TabItem value="bun">

```bash title="Install Playwright with Bun"
bun add -D @playwright/test
bunx playwright install
```

  </TabItem>
</Tabs>

### Configuration

Create a Playwright configuration file:

```ts title="playwright.config.ts - Basic configuration"
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Writing Tests

### Basic Test Structure

```ts
// tests/app.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Analog Application', () => {
  test('should display home page', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Analog/);

    // Check for main content
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('should navigate to about page', async ({ page }) => {
    await page.goto('/');

    // Click navigation link
    await page.click('a[href="/about"]');

    // Verify navigation
    await expect(page).toHaveURL('/about');
    await expect(page.locator('h1')).toContainText('About');
  });
});
```

### Component Testing

```ts
// tests/components/user-card.spec.ts
import { test, expect } from '@playwright/test';

test.describe('UserCard Component', () => {
  test('should display user information', async ({ page }) => {
    await page.goto('/users/1');

    // Check user details
    await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-role"]')).toBeVisible();
  });

  test('should handle user not found', async ({ page }) => {
    await page.goto('/users/999');

    // Check error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'User not found',
    );
  });
});
```

### Form Testing

```ts
// tests/forms/contact-form.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Contact Form', () => {
  test('should submit form successfully', async ({ page }) => {
    await page.goto('/contact');

    // Fill form fields
    await page.fill('[data-testid="name-input"]', 'John Doe');
    await page.fill('[data-testid="email-input"]', 'john@example.com');
    await page.fill(
      '[data-testid="message-input"]',
      'Hello, this is a test message',
    );

    // Submit form
    await page.click('[data-testid="submit-button"]');

    // Check success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      'Message sent successfully',
    );
  });

  test('should show validation errors', async ({ page }) => {
    await page.goto('/contact');

    // Try to submit empty form
    await page.click('[data-testid="submit-button"]');

    // Check validation errors
    await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-error"]')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/contact');

    // Fill form with invalid email
    await page.fill('[data-testid="name-input"]', 'John Doe');
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.fill('[data-testid="message-input"]', 'Test message');

    // Submit form
    await page.click('[data-testid="submit-button"]');

    // Check email validation error
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toContainText(
      'Please enter a valid email',
    );
  });
});
```

### API Testing

```ts
// tests/api/users.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Users API', () => {
  test('should return users list', async ({ request }) => {
    const response = await request.get('/api/users');

    expect(response.ok()).toBeTruthy();

    const users = await response.json();
    expect(Array.isArray(users)).toBeTruthy();
    expect(users.length).toBeGreaterThan(0);

    // Check user structure
    const user = users[0];
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
  });

  test('should return specific user', async ({ request }) => {
    const response = await request.get('/api/users/1');

    expect(response.ok()).toBeTruthy();

    const user = await response.json();
    expect(user.id).toBe(1);
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
  });

  test('should handle user not found', async ({ request }) => {
    const response = await request.get('/api/users/999');

    expect(response.status()).toBe(404);
  });

  test('should create new user', async ({ request }) => {
    const newUser = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'user',
    };

    const response = await request.post('/api/users', {
      data: newUser,
    });

    expect(response.ok()).toBeTruthy();

    const createdUser = await response.json();
    expect(createdUser.name).toBe(newUser.name);
    expect(createdUser.email).toBe(newUser.email);
    expect(createdUser).toHaveProperty('id');
  });
});
```

### Authentication Testing

```ts
// tests/auth/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login');

    // Fill login form
    await page.fill('[data-testid="email-input"]', 'user@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Check redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // Check user is logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill form with invalid credentials
    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Check error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'Invalid credentials',
    );
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'user@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    // Check redirect to login
    await expect(page).toHaveURL('/login');
  });
});
```

## Advanced Testing Patterns

### Page Object Model

```ts
// tests/pages/login-page.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectErrorMessage(message: string) {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }
}

// tests/auth/login-pom.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';

test.describe('Login with Page Object Model', () => {
  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');

    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('invalid@example.com', 'wrongpassword');

    await loginPage.expectErrorMessage('Invalid credentials');
  });
});
```

### Test Fixtures

```ts
// tests/fixtures/auth-fixtures.ts
import { test as base } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: any;
  adminPage: any;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'user@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await use(page);
  },

  adminPage: async ({ page }, use) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@example.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');

    await use(page);
  },
});

export { expect } from '@playwright/test';

// tests/admin/dashboard.spec.ts
import { test, expect } from '../fixtures/auth-fixtures';

test.describe('Admin Dashboard', () => {
  test('should show admin features', async ({ adminPage }) => {
    await adminPage.goto('/admin/dashboard');

    await expect(
      adminPage.locator('[data-testid="admin-panel"]'),
    ).toBeVisible();
    await expect(
      adminPage.locator('[data-testid="user-management"]'),
    ).toBeVisible();
  });

  test('should not show admin features to regular users', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/admin/dashboard');

    await expect(
      authenticatedPage.locator('[data-testid="access-denied"]'),
    ).toBeVisible();
  });
});
```

### Visual Testing

```ts
// tests/visual/home-page.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Testing', () => {
  test('home page should match snapshot', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');

    // Take screenshot and compare
    await expect(page).toHaveScreenshot('home-page.png');
  });

  test('responsive design should work', async ({ page }) => {
    await page.goto('/');

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page).toHaveScreenshot('home-page-mobile.png');

    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page).toHaveScreenshot('home-page-tablet.png');

    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page).toHaveScreenshot('home-page-desktop.png');
  });
});
```

### Performance Testing

```ts
// tests/performance/load-testing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Performance Testing', () => {
  test('should load home page within 2 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(2000);
  });

  test('should handle concurrent users', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const context3 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const page3 = await context3.newPage();

    // Navigate all pages simultaneously
    await Promise.all([page1.goto('/'), page2.goto('/'), page3.goto('/')]);

    // Verify all pages loaded successfully
    await expect(page1.locator('h1')).toBeVisible();
    await expect(page2.locator('h1')).toBeVisible();
    await expect(page3.locator('h1')).toBeVisible();

    await context1.close();
    await context2.close();
    await context3.close();
  });
});
```

## Running Tests

### Basic Commands

<Tabs groupId="package-manager">
  <TabItem value="npm">

```bash
# Run all tests
npm run test:e2e

# Run tests in headed mode
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e tests/app.spec.ts

# Run tests in specific browser
npm run test:e2e -- --project=chromium

# Run tests in parallel
npm run test:e2e -- --workers=4
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```bash
# Run all tests
yarn test:e2e

# Run tests in headed mode
yarn test:e2e --headed

# Run specific test file
yarn test:e2e tests/app.spec.ts

# Run tests in specific browser
yarn test:e2e --project=chromium

# Run tests in parallel
yarn test:e2e --workers=4
```

  </TabItem>

  <TabItem value="pnpm">

```bash
# Run all tests
pnpm test:e2e

# Run tests in headed mode
pnpm test:e2e --headed

# Run specific test file
pnpm test:e2e tests/app.spec.ts

# Run tests in specific browser
pnpm test:e2e --project=chromium

# Run tests in parallel
pnpm test:e2e --workers=4
```

  </TabItem>
</Tabs>

### Debugging Tests

```bash
# Run tests in debug mode
npm run test:e2e -- --debug

# Run specific test in debug mode
npm run test:e2e tests/app.spec.ts -- --debug

# Generate trace file
npm run test:e2e -- --trace=on
```

### CI/CD Integration

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Run Playwright tests
        run: npm run test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

## Best Practices

### 1. Test Organization

- Group related tests using `test.describe()`
- Use descriptive test names
- Follow the Arrange-Act-Assert pattern
- Keep tests independent and isolated

### 2. Selectors

- Use `data-testid` attributes for reliable selectors
- Avoid using CSS classes or text content for selectors
- Prefer semantic selectors over complex CSS selectors

### 3. Waiting Strategies

- Use `page.waitForLoadState()` for page loads
- Use `expect().toBeVisible()` for element visibility
- Avoid hard-coded delays with `page.waitForTimeout()`

### 4. Test Data

- Use fixtures for common test data
- Clean up test data after tests
- Use unique identifiers for test data

### 5. Performance

- Run tests in parallel when possible
- Use headless mode in CI/CD
- Optimize test execution time

## Related Documentation

- [Vitest Testing](/docs/features/testing/vitest)
- [Testing Overview](/docs/features/testing/overview)
- [Playwright Documentation](https://playwright.dev)
- [Testing Best Practices](/docs/guides/testing)
