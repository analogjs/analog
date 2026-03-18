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
const baseURL = 'http://localhost:43000';

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage({
    baseURL,
  });
  await page.goto('/');
});
afterEach(async () => {
  await page.close();
});

describe('My Store', () => {
  test(`Given the user has navigated to the home page
    Then the app title is visible`, async () => {
    expect(await page.locator('h2').first().textContent()).toContain(
      'Products',
    );
  });
});
