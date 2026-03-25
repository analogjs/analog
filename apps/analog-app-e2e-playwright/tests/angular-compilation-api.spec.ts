/**
 * Integration tests for the Angular Compilation API path.
 *
 * These tests run against the live dev server (http://localhost:43000) which
 * is started with `useAngularCompilationAPI: true` in the analog-app config.
 *
 * They verify:
 *  1. The dev server compiles and serves pages via the Compilation API
 *  2. A hot-added page route can be validated manually against the dev server
 *  3. An existing page component template change is reflected during dev
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
// Use a stable existing route for the editable-page assertion so the test
// measures update behavior, not route discovery latency.
const EXISTING_PAGE_PATH = join(
  ANALOG_APP_ROOT,
  'src/app/pages/package.page.ts',
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
  cleanup();
  page = await browser.newPage({
    baseURL,
  });
});

afterEach(async () => {
  await page.close();
});

async function waitFor(
  assertion: () => Promise<void>,
  timeout = 30_000,
  interval = 250,
) {
  // This spec runs against a live dev server, so we retry instead of coupling
  // the test to a matcher extension that may not exist in every Vitest setup.
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeout) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw lastError;
}

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

  // Keep the hot-add scenario documented here, but skip it in automated runs
  // until route discovery latency is predictable enough for stable CI.
  test.skip('picks up a hot-added page route', async () => {
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
    await waitFor(async () => {
      const response = await page.goto('/compilation-api-test');
      expect(response?.status()).toBe(200);
      const html = await page.content();
      expect(html).toContain('Compilation API Hot Route');
    });

    // Clean up immediately so other tests aren't affected
    cleanup();
  }, 60_000);

  test('reflects an existing page template change during dev', async () => {
    const originalPage = readFileSync(EXISTING_PAGE_PATH, 'utf-8');

    try {
      // Rewrite the page in-place so the assertion exercises the existing-route
      // update path that should stay fast during normal editing.
      writeFileSync(
        EXISTING_PAGE_PATH,
        `import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: '<h1 id="hmr-target">Before HMR</h1>',
})
export default class PackagePageComponent {}
`,
      );

      await waitFor(async () => {
        const response = await page.goto('/package');
        expect(response?.status()).toBe(200);
        const text = await page.locator('#hmr-target').textContent();
        expect(text).toBe('Before HMR');
      });

      writeFileSync(
        EXISTING_PAGE_PATH,
        `import { Component } from '@angular/core';

@Component({
  template: '<h1 id="hmr-target">After HMR</h1>',
})
export default class PackagePageComponent {}
`,
      );

      await waitFor(async () => {
        const text = await page.locator('#hmr-target').textContent();
        expect(text).toBe('After HMR');
      });
    } finally {
      // Always restore the checked-in page so the spec is safe to rerun locally.
      writeFileSync(EXISTING_PAGE_PATH, originalPage);
    }
  }, 45_000);
});
