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
    baseURL: 'http://localhost:4321',
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

    test('Then client side rendered CardComponent should emit an event on click', async () => {
      const console = waitForConsole();
      const componentLocator = page.locator(
        'astro-island[component-export="CardComponent"]'
        // '[data-analog-id=card-1]'
      );
      const elementLocator = componentLocator.locator('li');
      await elementLocator.click();

      await expect(await console).toBe('event received from card-1: clicked');
    });
  });
});

async function waitForConsole(): Promise<string> {
  return new Promise(function (resolve) {
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        resolve(msg.text());
      }
    });
  });
}
