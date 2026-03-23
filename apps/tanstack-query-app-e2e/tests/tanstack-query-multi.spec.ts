import { expect, test } from '@playwright/test';

test.describe('TanStack Query multi-query - /tanstack-query-multi', () => {
  test('renders multiple independent queries from SSR', async ({ page }) => {
    await page.goto('/tanstack-query-multi?scope=multi-hydration');

    await expect(page.locator('#posts-list li')).toHaveCount(4);
    await expect(page.locator('#featured-title')).toContainText(
      'Getting Started with Analog',
    );
    await expect(page.locator('#featured-author')).toContainText('Alice');
  });

  test('resolves dependent query that chains off another query', async ({
    page,
  }) => {
    await page.goto('/tanstack-query-multi?scope=dependent-hydration');

    await expect(page.locator('#featured-author')).toContainText('Alice');
    await expect(page.locator('#author-posts-list li')).toHaveCount(2);
  });
});
