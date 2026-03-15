import { existsSync, readFileSync } from 'node:fs';
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
});

afterEach(async () => {
  await page.close();
});

describe('JSON-LD', () => {
  test('includes JSON-LD in prerendered build artifacts', async () => {
    const homeHtml = readPrerenderedHtml('/');

    expect(homeHtml).toContain('application/ld+json');
    expect(homeHtml).toContain('analog-home');
  });

  test('includes JSON-LD in the initial HTML for SSR/prerendered routes', async () => {
    const html = await fetch('http://localhost:3000/').then((response) =>
      response.text(),
    );

    expect(html).toContain('application/ld+json');
    expect(html).toContain('analog-home');
  });

  test('replaces JSON-LD during client navigation', async () => {
    await page.goto('/');
    await expect(page.locator('h2')).toContainText('Products');

    expect(await getJsonLdIdentifiers(page)).toEqual([
      'analog-home',
      'analog-home-catalog',
    ]);

    await page.locator('a[title$="details"]').first().click();
    await expect(page.locator('h2')).toContainText('Product Details');

    const identifiers = await getJsonLdIdentifiers(page);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]).toMatch(/^analog-product-\d+$/);
  });

  test('only injects JSON-LD client-side for no-SSR routes', async () => {
    const rawHtml = await fetch('http://localhost:3000/client').then(
      (response) => response.text(),
    );

    expect(rawHtml).not.toContain('analog-client');

    await page.goto('/client');
    await expect(page.locator('h2')).toContainText('Client Component');
    await page.waitForFunction(() => {
      return !!document.querySelector(
        'script[type="application/ld+json"][data-analog-json-ld]',
      );
    });

    expect(await getJsonLdIdentifiers(page)).toEqual(['analog-client']);
  });
});

async function getJsonLdIdentifiers(page: Page): Promise<string[]> {
  return page
    .locator('script[type="application/ld+json"][data-analog-json-ld]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const parsed = JSON.parse(element.textContent || '{}') as {
          identifier?: string;
        };
        return parsed.identifier || '';
      }),
    );
}

function readPrerenderedHtml(routePath: string): string {
  const relativePath = routePath === '/' ? 'index.html' : routePath.slice(1);
  const candidates = [
    join(process.cwd(), 'dist/apps/analog-app/client', relativePath),
    join(
      process.cwd(),
      'dist/apps/analog-app/client',
      relativePath,
      'index.html',
    ),
    join(process.cwd(), 'dist/apps/analog-app/client', `${relativePath}.html`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf-8');
    }
  }

  throw new Error(`Unable to find prerendered HTML for route "${routePath}"`);
}
