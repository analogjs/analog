import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

test.describe('JSON-LD', () => {
  test('includes JSON-LD in prerendered build artifacts', async () => {
    const homeHtml = readPrerenderedHtml('/');

    expect(homeHtml).toContain('application/ld+json');
    expect(homeHtml).toContain('analog-home');
  });

  test('includes JSON-LD in the initial HTML for SSR/prerendered routes', async () => {
    const html = await fetch('http://localhost:43000/').then((r) => r.text());

    expect(html).toContain('application/ld+json');
    expect(html).toContain('analog-home');
  });

  test('replaces JSON-LD during client navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h2')).toContainText('Products');

    expect(await getJsonLdIdentifiers(page)).toEqual([
      'analog-home',
      'analog-home-catalog',
    ]);

    await page.locator('a[title$="details"]').first().click();
    await page.waitForURL(/\/products\/\d+/);
    await expect(page.locator('h2')).toContainText('Product Details');

    const identifiers = await getJsonLdIdentifiers(page);
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]).toMatch(/^analog-product-\d+$/);
  });

  test('only injects JSON-LD client-side for no-SSR routes', async ({
    page,
  }) => {
    const rawHtml = await fetch('http://localhost:43000/client').then((r) =>
      r.text(),
    );

    expect(rawHtml).not.toContain('analog-client');

    await page.goto('/client');
    // Client-only route — Angular must bootstrap before content renders.
    await expect(page.locator('h2')).toContainText('Client Component', {
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => {
        return !!document.querySelector(
          'script[type="application/ld+json"][data-analog-json-ld]',
        );
      },
      { timeout: 15_000 },
    );

    expect(await getJsonLdIdentifiers(page)).toEqual(['analog-client']);
  });

  test('removes JSON-LD when navigating to a route without structured data', async ({
    page,
  }) => {
    await page.goto('/');
    expect(await getJsonLdIdentifiers(page)).toEqual([
      'analog-home',
      'analog-home-catalog',
    ]);

    await page.locator('text=Checkout').click();
    await page.waitForURL('/cart');
    await page.waitForFunction(() => {
      return !document.querySelector(
        'script[type="application/ld+json"][data-analog-json-ld]',
      );
    });

    const scripts = await page
      .locator('script[type="application/ld+json"][data-analog-json-ld]')
      .count();
    expect(scripts).toBe(0);
  });

  test('includes JSON-LD in initial SSR HTML for dynamic product route', async () => {
    const html = await fetch('http://localhost:43000/products/1').then((r) =>
      r.text(),
    );

    expect(html).toContain('application/ld+json');
    expect(html).toContain('analog-product-1');
  });

  test('preserves JSON-LD after browser back navigation', async ({ page }) => {
    await page.goto('/');
    expect(await getJsonLdIdentifiers(page)).toEqual([
      'analog-home',
      'analog-home-catalog',
    ]);

    await page.locator('a[title$="details"]').first().click();
    await page.waitForURL(/\/products\/\d+/);
    const productIds = await getJsonLdIdentifiers(page);
    expect(productIds).toHaveLength(1);
    expect(productIds[0]).toMatch(/^analog-product-\d+$/);

    await page.goBack();
    await page.waitForURL('/');
    await page.waitForFunction(() => {
      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"][data-analog-json-ld]',
      );
      return scripts.length === 2;
    });

    expect(await getJsonLdIdentifiers(page)).toEqual([
      'analog-home',
      'analog-home-catalog',
    ]);
  });

  test('validates JSON-LD schema structure in prerendered output', async () => {
    const homeHtml = readPrerenderedHtml('/');

    const jsonLdRegex =
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    const entries: Record<string, unknown>[] = [];
    let match;
    while ((match = jsonLdRegex.exec(homeHtml)) !== null) {
      entries.push(JSON.parse(match[1]));
    }

    expect(entries.length).toBeGreaterThanOrEqual(2);

    for (const entry of entries) {
      expect(entry['@context']).toBe('https://schema.org');
      expect(entry['@type']).toBeTruthy();
    }

    const types = entries.map((e) => e['@type']);
    expect(types).toContain('WebSite');
    expect(types).toContain('CollectionPage');
  });
});

async function getJsonLdIdentifiers(
  page: import('@playwright/test').Page,
): Promise<string[]> {
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
    join(
      join(process.cwd(), '../..'),
      'dist/apps/analog-app/analog/public',
      relativePath,
    ),
    join(
      join(process.cwd(), '../..'),
      'dist/apps/analog-app/analog/public',
      relativePath,
      'index.html',
    ),
    join(
      join(process.cwd(), '../..'),
      'dist/apps/analog-app/analog/public',
      `${relativePath}.html`,
    ),
    join(
      join(process.cwd(), '../..'),
      'dist/apps/analog-app/client',
      relativePath,
    ),
    join(
      join(process.cwd(), '../..'),
      'dist/apps/analog-app/client',
      relativePath,
      'index.html',
    ),
    join(
      join(process.cwd(), '../..'),
      'dist/apps/analog-app/client',
      `${relativePath}.html`,
    ),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf-8');
    }
  }

  throw new Error(`Unable to find prerendered HTML for route "${routePath}"`);
}
