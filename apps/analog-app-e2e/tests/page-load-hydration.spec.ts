import { expect, test } from '@playwright/test';

test('hydrates the native load once and shares fresh query loads with getLoadResolver', async ({
  page,
}) => {
  const loads: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/_analog/pages/')) loads.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const response = await page.goto('/greet/reader?shout=false');
  expect(response?.status()).toBe(200);
  expect(await response?.text()).toContain('Hello, reader!');
  await expect(page.locator('#greeting')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('#greeting')).toHaveText('Hello, reader!');
  expect(loads).toEqual([]);

  await page.getByRole('link', { name: 'Shout greeting', exact: true }).click();
  await expect(page.locator('#greeting')).toHaveText('Hello, READER!');
  expect(loads).toHaveLength(1);
  expect(new URL(loads[0]).searchParams.get('shout')).toBe('true');

  await page
    .getByRole('link', { name: 'Normal greeting', exact: true })
    .click();
  await expect(page.locator('#greeting')).toHaveText('Hello, reader!');
  expect(loads).toHaveLength(2);
  expect(new URL(loads[1]).searchParams.get('shout')).toBe('false');
  expect(errors).toEqual([]);
});
