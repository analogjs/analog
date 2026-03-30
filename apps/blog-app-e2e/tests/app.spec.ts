import { test, expect } from '@playwright/test';

test('should redirect to /blog', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/blog$/);
});

test('should serve up HTML for pre-rendered markdown route', async ({
  page,
}) => {
  await page.goto('/blog/2022-12-27-my-first-post');
  await expect(page.locator('h1')).toContainText('My First Post');
});

test('should serve up XML for pre-rendered XML route at /api/rss.xml', async ({
  request,
}) => {
  const response = await request.get('/api/rss.xml');
  expect(response.headers()['content-type']).toMatch(/xml/);
});
