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

describe('My Store', () => {
  test(`Given the user has navigated to the home page
    Then the app title is visible`, async () => {
    // Wait for the page to be fully loaded and Angular to be ready
    await page.waitForLoadState('networkidle');

    // Wait for the Angular app to be fully rendered
    await page.waitForSelector('analogjs-root');

    // Wait for the top bar component to be rendered
    await page.waitForSelector('analogjs-top-bar');

    // Now check for the heading - use a simpler selector that should work
    const heading = page.locator('h1:has-text("My Store")');
    await expect(await heading.textContent()).toContain('My Store');
  });
});
