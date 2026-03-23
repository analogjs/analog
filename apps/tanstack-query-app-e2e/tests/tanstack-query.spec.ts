import { expect, test } from '@playwright/test';

test.describe('TanStack Query integration - /tanstack-query', () => {
  function createScope(testInfo: import('@playwright/test').TestInfo) {
    return `${testInfo.title
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        '-',
      )}-${testInfo.retry}-${testInfo.parallelIndex}`;
  }

  function trackTodoRequests(page: import('@playwright/test').Page) {
    const methods: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/v1/query-todos')) {
        methods.push(request.method());
      }
    });

    return methods;
  }

  test('hydrates the first render without a second fetch', async ({
    page,
  }, testInfo) => {
    const scope = createScope(testInfo);
    const methods = trackTodoRequests(page);

    await page.goto(`/tanstack-query?scope=${scope}`);

    await expect(page.locator('#todo-list')).toContainText(
      'Read the Analog docs',
    );

    await expect(page.locator('#todo-fetch-count')).not.toHaveText('0');
    expect(methods).toEqual([]);
  });

  test('invalidates the query after a successful mutation', async ({
    page,
  }, testInfo) => {
    const scope = createScope(testInfo);
    const methods = trackTodoRequests(page);

    await page.goto(`/tanstack-query?scope=${scope}`);
    const initialRequestCount = methods.length;

    await page.locator('#add-todo').click();

    await expect(page.locator('#todo-list')).toContainText(
      'Ship query support',
    );

    expect(methods.slice(initialRequestCount)).toEqual(['POST', 'GET']);
  });

  test('surfaces server validation errors for failed mutations', async ({
    page,
  }, testInfo) => {
    const scope = createScope(testInfo);
    const methods = trackTodoRequests(page);

    await page.goto(`/tanstack-query?scope=${scope}`);
    const initialRequestCount = methods.length;

    await page.locator('#add-empty-todo').click();

    await expect(page.locator('#todo-mutation-error')).toContainText(
      'title is required',
    );
    expect(methods.slice(initialRequestCount)).toEqual(['POST']);
  });
});
