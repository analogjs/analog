import { test, expect } from '@playwright/test';

// TODO: re-enable once router redirect-only index routes are fixed
// https://github.com/analogjs/analog/issues/2172
test.fixme('should redirect to /blog', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/blog$/);
});

// https://github.com/analogjs/analog/issues/2165
test.fixme('should serve up HTML for pre-rendered markdown route', async ({
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

test('should serve a sitemap with canonical routes and no internal static-data endpoints', async ({
  request,
}) => {
  const response = await request.get('/sitemap.xml');
  const sitemap = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toMatch(/xml/);
  expect(sitemap).toContain('<loc>https://analog-blog.netlify.app/blog</loc>');
  expect(sitemap).toContain('<loc>https://analog-blog.netlify.app/about</loc>');
  expect(sitemap).toContain(
    '<loc>https://analog-blog.netlify.app/blog/2022-12-27-my-first-post</loc>',
  );
  expect(sitemap).not.toContain('/api/_analog/pages/');
});
