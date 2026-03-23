import { test, expect } from '@playwright/test';

test.describe('definePageLoad - /greet/:name', () => {
  test('should load page with route params', async ({ page }) => {
    await page.goto('/greet/analog');

    await expect(page.locator('#greeting')).toContainText('Hello, analog!');
    await expect(page.locator('#greet-name')).toContainText('analog');
  });

  test('should pass query params to handler', async ({ page }) => {
    await page.goto('/greet/analog?shout=true');

    await expect(page.locator('#greeting')).toContainText('Hello, ANALOG!');
    await expect(page.locator('#greet-shout')).toContainText('true');
  });

  test('should handle missing optional query params', async ({ page }) => {
    await page.goto('/greet/world');

    await expect(page.locator('#greeting')).toContainText('Hello, world!');
    await expect(page.locator('#greet-shout')).toContainText('false');
  });
});
