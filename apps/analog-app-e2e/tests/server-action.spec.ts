import { test, expect } from '@playwright/test';

test.describe('defineAction - /contact', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
    // Wait for Angular hydration — the FormAction directive sets data-state
    // once the directive is live.
    await page.locator('form[data-state]').waitFor({ timeout: 15_000 });
  });

  test('should submit contact form successfully', async ({ page }) => {
    await page.locator('input[name="name"]').fill('Alice');
    await page.locator('input[name="email"]').fill('alice@example.com');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.locator('#contact-success')).toContainText('Alice');
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.locator('#contact-errors')).toBeVisible();
  });
});
