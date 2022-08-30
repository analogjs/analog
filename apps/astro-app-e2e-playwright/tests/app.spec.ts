import { chromium, Browser, Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  describe,
} from 'vitest';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({
    baseURL: 'http://localhost:3000',
  });
  await page.goto('/');
});
afterEach(async () => {
  await page.close();
});

describe('AstroApp', () => {
  describe('Given the user has navigated to the home page', () => {
    test('Then client side rendered CardComponent is rendered', async () => {
      const componentLocator = page.locator(
        'astro-island[component-export="CardComponent"]'
      );
      await expect(
        componentLocator.locator('>> text=Angular (Client Side)')
      ).toContain(/Angular \(Client Side\)/i);
    });

    test('Then server side rendered CardComponent is rendered', async () => {
      const componentLocator = page.locator('astro-card');
      await expect(
        componentLocator.locator('>> text=Angular (server side binding)')
      ).toContain(/Angular \(server side binding\)/i);
    });
  });
});
