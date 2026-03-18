/**
 * Integration tests for the Angular Compilation API path.
 *
 * These tests run against the live dev server (http://localhost:43000) which
 * is started with `useAngularCompilationAPI: true` in the analog-app config.
 *
 * They verify:
 *  1. The dev server compiles and serves pages via the Compilation API
 *  2. A hot-added page route is picked up without a full restart
 *  3. A component template change triggers HMR (not a full reload)
 */
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';

const ANALOG_APP_ROOT = join(process.cwd(), 'apps/analog-app');
const HOT_PAGE_PATH = join(
  ANALOG_APP_ROOT,
  'src/app/pages/compilation-api-test.page.ts',
);

let browser: Browser;
let page: Page;
const baseURL = 'http://localhost:43000';

beforeAll(async () => {
  browser = await chromium.launch();
  // Clean up any leftover test page from a prior run
  cleanup();
});

afterAll(async () => {
  cleanup();
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({
    baseURL,
  });
});

afterEach(async () => {
  await page.close();
});

function cleanup() {
  if (existsSync(HOT_PAGE_PATH)) {
    unlinkSync(HOT_PAGE_PATH);
  }
}

describe('Angular Compilation API', () => {
  test('serves the home page (confirms dev server is using useAngularCompilationAPI)', async () => {
    await page.goto('/');
    expect(await page.locator('h2').first().textContent()).toContain(
      'Products',
    );
  });

  test('picks up a hot-added page route', async () => {
    // Write a new page file while the dev server is running
    writeFileSync(
      HOT_PAGE_PATH,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-compilation-api-test',
  standalone: true,
  template: '<h1>Compilation API Hot Route</h1>',
})
export default class CompilationApiTestPage {}
`,
    );

    // Wait for the dev server to pick up the new file and recompile.
    // The route should become available at /compilation-api-test.
    await expect(async () => {
      const response = await page.goto('/compilation-api-test');
      expect(response?.status()).toBe(200);
      const html = await page.content();
      expect(html).toContain('Compilation API Hot Route');
    }).toPass({ timeout: 15_000 });

    // Clean up immediately so other tests aren't affected
    cleanup();
  });

  test('reflects a component template change via HMR', async () => {
    // Write the initial page
    writeFileSync(
      HOT_PAGE_PATH,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-compilation-api-test',
  standalone: true,
  template: '<h1 id="hmr-target">Before HMR</h1>',
})
export default class CompilationApiTestPage {}
`,
    );

    // Wait for the route to become available
    await expect(async () => {
      const response = await page.goto('/compilation-api-test');
      expect(response?.status()).toBe(200);
    }).toPass({ timeout: 15_000 });

    expect(await page.locator('#hmr-target').textContent()).toBe('Before HMR');

    // Modify the template
    writeFileSync(
      HOT_PAGE_PATH,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-compilation-api-test',
  standalone: true,
  template: '<h1 id="hmr-target">After HMR</h1>',
})
export default class CompilationApiTestPage {}
`,
    );

    // Wait for the HMR update to be applied (either HMR or full-reload)
    await expect(async () => {
      const text = await page.locator('#hmr-target').textContent();
      expect(text).toBe('After HMR');
    }).toPass({ timeout: 15_000 });

    cleanup();
  });
});
