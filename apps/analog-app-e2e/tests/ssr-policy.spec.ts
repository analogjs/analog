import { expect, test } from '@playwright/test';

test('caller hints cannot disable SSR on an enabled route', async ({
  request,
}) => {
  for (const headers of [{}, { 'x-analog-no-ssr': 'true' }]) {
    const response = await request.get('/products/1?ssr-policy=1', { headers });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('Product Details');
    expect(html).toContain('ng-server-context');
  }
});

test('caller hints cannot enable SSR on a configured client route', async ({
  request,
}) => {
  const response = await request.get('/cart', {
    headers: { 'x-analog-no-ssr': 'false' },
  });
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain('ng-server-context');
});
