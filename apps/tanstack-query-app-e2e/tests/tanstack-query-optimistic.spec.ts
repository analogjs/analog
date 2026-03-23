import { expect, test } from '@playwright/test';

test.describe('TanStack Query optimistic updates - /tanstack-query-optimistic', () => {
  function createScope(testInfo: import('@playwright/test').TestInfo) {
    return `${testInfo.title
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        '-',
      )}-${testInfo.retry}-${testInfo.parallelIndex}`;
  }

  test('renders comments from SSR', async ({ page }, testInfo) => {
    const scope = createScope(testInfo);

    await page.goto(`/tanstack-query-optimistic?scope=${scope}`);

    await expect(page.locator('#comments-list li')).not.toHaveCount(0);
    await expect(page.locator('#comments-list')).toContainText('Comment 1');
  });

  test('applies optimistic update and persists after mutation succeeds', async ({
    page,
  }, testInfo) => {
    const scope = createScope(testInfo);

    await page.goto(`/tanstack-query-optimistic?scope=${scope}`);

    await expect(page.locator('#comments-list li')).not.toHaveCount(0);
    await expect(page.locator('#comments-list')).not.toContainText(
      'Great post!',
    );

    await page.locator('#add-comment').click();

    await expect(page.locator('#optimistic-applied')).toBeVisible();
    await expect(page.locator('#comments-list')).toContainText('Great post!');
  });

  test('rolls back optimistic update on mutation failure', async ({
    page,
  }, testInfo) => {
    const scope = createScope(testInfo);

    await page.goto(`/tanstack-query-optimistic?scope=${scope}`);

    await expect(page.locator('#comments-list li')).not.toHaveCount(0);

    await page.locator('#add-bad-comment').click();

    await expect(page.locator('#rolled-back')).toBeVisible();
    await expect(page.locator('#mutation-error')).toContainText(
      'text is required',
    );
    await expect(
      page.locator('#comments-list li[data-optimistic="true"]'),
    ).toHaveCount(0);
  });
});
