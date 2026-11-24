import { expect, test } from '@playwright/test';

test.describe('TanStack Query infinite query - /tanstack-query-infinite', () => {
  test('renders the first page of results', async ({ page }) => {
    await page.goto('/tanstack-query-infinite?scope=infinite-hydration');

    await expect(page.locator('#page-count')).toHaveText('1');
    await expect(page.locator('#comments-list li')).toHaveCount(3);
    await expect(page.locator('#load-more')).toBeVisible();
  });

  test('loads next page client-side after hydration', async ({ page }) => {
    await page.goto('/tanstack-query-infinite?scope=infinite-paginate');

    await expect(page.locator('#page-count')).toHaveText('1');

    await page.locator('#load-more').click();

    await expect(page.locator('#page-count')).toHaveText('2');
    await expect(page.locator('#comments-list li')).toHaveCount(6);
  });

  test('hides load-more when all pages are fetched', async ({ page }) => {
    await page.goto('/tanstack-query-infinite?scope=infinite-exhaust');

    await expect(page.locator('#load-more')).toBeVisible();

    await page.locator('#load-more').click();
    await expect(page.locator('#page-count')).toHaveText('2');

    await page.locator('#load-more').click();
    await expect(page.locator('#page-count')).toHaveText('3');

    await expect(page.locator('#load-more')).toBeHidden();
    await expect(page.locator('#comments-list li')).toHaveCount(7);
  });
});
