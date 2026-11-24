import { test, expect } from '@playwright/test';

test.describe('legacy PageServerAction - /legacy-action', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legacy-action');
    await page.locator('form').waitFor({ timeout: 15_000 });
  });

  test('submits successfully through the legacy action handler', async ({
    page,
  }) => {
    await page.locator('input[name="email"]').fill('legacy@example.com');
    await page.getByRole('button', { name: /submit/i }).click();

    await expect(page.locator('#legacy-action-success')).toContainText(
      'legacy@example.com',
    );
  });

  test('returns validation errors through the legacy action handler', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /submit/i }).click();

    await expect(page.locator('#legacy-action-error')).toContainText(
      'Email is required',
    );
  });
});
