import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Nitro matches parent SSR opt-out and explicit child opt-in', async ({
  request,
}) => {
  const disabled = await request.get('/render-policy/disabled');
  expect(disabled.status()).toBe(200);
  expect(await disabled.text()).not.toContain('Server-rendered policy example');

  const enabled = await request.get('/render-policy/enabled?fresh=1');
  expect(enabled.status()).toBe(200);
  expect(await enabled.text()).toContain('Server-rendered policy example');
});

for (const [input, status] of [
  [404, 404],
  [503, 503],
  [200, 500],
]) {
  test(`resolver status ${input} returns safe HTTP ${status}`, async ({
    request,
  }) => {
    const response = await request.get(`/ssr-errors/${input}`);
    expect(response.status()).toBe(status);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-robots-tag']).toBe('noindex');
    const html = await response.text();
    expect(html).toContain('<h1>Unable to load this page</h1>');
    expect(html).not.toContain('private-resolver-error-marker');
    expect(html).not.toContain('This resolver did not complete');
    expect(html).not.toContain('<script');
  });
}

test('failed and successful renders remain independent', async ({
  request,
}) => {
  const [failure, success] = await Promise.all([
    request.get('/ssr-errors/503'),
    request.get('/render-policy/enabled?concurrent=1'),
  ]);
  expect(failure.status()).toBe(503);
  expect(success.status()).toBe(200);
  expect(await success.text()).toContain('Server-rendered policy example');
});

test('prerender writes useful HTML and includes the route in the sitemap', () => {
  const output = resolve('../../dist/apps/analog-app/analog/public');
  const html = readFileSync(
    resolve(output, 'render-policy/prerendered/index.html'),
    'utf8',
  );
  expect(html).toContain('Server-rendered policy example');
  expect(html).toContain('</html>');
  expect(readFileSync(resolve(output, 'sitemap.xml'), 'utf8')).toContain(
    '/render-policy/prerendered',
  );
});
