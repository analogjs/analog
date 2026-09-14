import { chromium, type Browser, type Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'vitest';

let browser: Browser;
let page: Page;
const baseURL = process.env['ASTRO_TEST_URL'] ?? 'http://localhost:43030';
let errors: string[];

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ baseURL });
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
afterEach(async () => {
  await page.close();
  expect(errors).toEqual([]);
});

test('prerenders Angular and React without JavaScript', async () => {
  const response = await page.request.get('/');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Angular (server side binding)');
  expect(html).toContain('Angular (Client Side)');
  expect(html).toContain('src/pages');
});

// Also fails on the Astro 6 baseline; tracked in analogjs/analog#2536.
test.skip('hydrates a visible Angular island and forwards output events', async () => {
  await page.goto('/');
  const island = page.locator('astro-island[component-export="CardComponent"]');
  await island.scrollIntoViewIfNeeded();
  await expect.poll(() => island.getAttribute('ssr')).toBeNull();
  const event = page.waitForEvent('console', {
    predicate: (message) =>
      message.text() === 'event received from card-component-1: clicked',
  });
  await island.locator('li').dispatchEvent('click');
  expect((await event).text()).toContain('clicked');
});

test('renders MDX Angular islands and preserves the focused node during hydration', async () => {
  await page.goto('/test');
  await expect
    .poll(() => page.locator('astro-parent').textContent())
    .toContain('Angular');
  await expect
    .poll(() => page.locator('astro-client-only').textContent())
    .toContain('only rendered on the client');
  const component = page.locator('astro-hydration-test');
  const input = await component.locator('input').elementHandle();
  expect(input).not.toBeNull();
  await input!.focus();
  await expect.poll(() => component.textContent()).toContain('hydrated: true');
  expect(await input!.evaluate((node) => node === document.activeElement)).toBe(
    true,
  );
});

// Also fails on the Astro 6 baseline; tracked in analogjs/analog#2536.
test.skip('replays incremental hydration events', async () => {
  await page.goto('/test');
  const incremental = page.locator('astro-incremental-hydration-test button');
  await incremental.click();
  await expect.poll(() => incremental.textContent()).toContain('Count: 1');
  await expect
    .poll(() => incremental.textContent())
    .toContain('hydrated: true');
});
