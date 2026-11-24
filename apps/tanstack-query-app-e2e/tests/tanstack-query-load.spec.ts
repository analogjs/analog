import { expect, test } from '@playwright/test';

test.describe('TanStack Query load-time prefetch - /tanstack-query-load', () => {
  test('renders the posts list from a load-time prefetch with no client request', async ({
    page,
  }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/query-posts')) {
        apiRequests.push(url);
      }
    });

    await page.goto('/tanstack-query-load?scope=load-hydration');

    await expect(page.locator('#load-posts-list li')).toHaveCount(4);
    await expect(page.locator('#load-scope')).toContainText('load-hydration');
    await expect(page.locator('#load-fetch-count')).toContainText('1');

    // The component reads from the cache the load() prefetch warmed; the
    // client should not issue its own `/api/v1/query-posts` request.
    expect(apiRequests).toHaveLength(0);
  });

  test('isolates scope state across requests', async ({ page }) => {
    await page.goto('/tanstack-query-load?scope=load-scope-a');
    await expect(page.locator('#load-fetch-count')).toContainText('1');

    await page.goto('/tanstack-query-load?scope=load-scope-b');
    await expect(page.locator('#load-fetch-count')).toContainText('1');
  });
});
