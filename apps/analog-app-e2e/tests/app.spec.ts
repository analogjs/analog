import { test, expect } from '@playwright/test';

test('should display the app title', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /my store/i, level: 1 }),
  ).toBeVisible();
});

test('should display 404 page', async ({ page }) => {
  await page.goto('/bad');
  await expect(
    page.getByRole('heading', { name: /page not found/i, level: 2 }),
  ).toBeVisible();
});

test('should display nested 404 page', async ({ page }) => {
  await page.goto('/shipping/bad');
  await expect(
    page.getByRole('heading', {
      name: /shipping page not found/i,
      level: 2,
    }),
  ).toBeVisible();
});
