import { test, expect } from '@playwright/test';

test.describe('My Store', () => {
  test(`Given the user has navigated to the home page
    Then the app title is visible`, async ({ page }) => {
    await page.goto('/');

    await expect(
      page.locator('role=heading[level=1] >> text=My Store')
    ).toHaveText(/My Store/i);
  });
});
