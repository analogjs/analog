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
    await expect(
      page.locator('role=heading[level=1] >> text=My Store'),
    ).toContain(/My Store/i);
  });
});
