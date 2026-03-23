import { test, expect } from '@playwright/test';

test.describe('defineAction - /contact', () => {
  test('should submit contact form successfully', async ({ page }) => {
    await page.goto('/contact');

    await page.locator('input[name="name"]').fill('Alice');
    await page.locator('input[name="email"]').fill('alice@example.com');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.locator('#contact-success')).toContainText('Alice');
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.goto('/contact');

    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.locator('#contact-errors')).toBeVisible();
  });
});
