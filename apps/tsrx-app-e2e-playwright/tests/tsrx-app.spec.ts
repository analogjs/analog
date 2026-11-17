import { Browser, chromium, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

// End-to-end checks for the TSRX demo app: every page is a `.tsrx` component,
// server-rendered, hydrated, and driven through Analog features.

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:43061';

/** The boundary demo throws on purpose; Angular's ErrorHandler logs it. */
const INTENTIONAL_ERROR = 'Widget failed to render';

let browser: Browser;
let page: Page;
let consoleErrors: string[];
/** Console errors a test expects, besides the boundary demo's. */
let expectedErrors: string[];

beforeAll(async () => {
  const executablePath = process.env['PW_EXECUTABLE_PATH'];
  browser = await chromium.launch(
    executablePath ? { executablePath } : undefined,
  );
});

afterAll(async () => {
  await browser.close();
});

async function open(path: string): Promise<Page> {
  page = await browser.newPage();
  consoleErrors = [];
  expectedErrors = [INTENTIONAL_ERROR];
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' });
  return page;
}

afterEach(async () => {
  const unexpected = consoleErrors.filter(
    (error) => !expectedErrors.some((expected) => error.includes(expected)),
  );
  await page?.close();
  expect(unexpected).toEqual([]);
});

/** Waits for hydration: Angular removes the `ngh` markers once it has hydrated. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('[ngh]'));
}

const text = (selector: string) => page.locator(selector).first().innerText();

describe('home', () => {
  test('renders routeMeta and navigates on the client', async () => {
    await open('/');
    expect(await page.title()).toBe('Analog + TSRX');
    expect(
      await page.locator('meta[name="description"]').getAttribute('content'),
    ).toBe('Analog features demonstrated with TSRX components.');
    expect(await text('#home-title')).toBe('TSRX components in Analog');

    await hydrated(page);
    await page.click('#demos a[href="/counter"]');
    await page.waitForSelector('#increment');
    expect(await page.title()).toBe('Counter');
  });
});

describe('counter', () => {
  test('inputs, outputs, providers and two-way models work after hydration', async () => {
    await open('/counter');
    await hydrated(page);
    expect(await text('#increment')).toBe('Clicks: 0');

    await page.click('#increment');
    await page.click('#increment');
    await expect.poll(() => text('#increment')).toBe('Clicks: 4');
    expect(await text('#doubled')).toBe('doubled: 8');
    expect(await text('#history')).toBe('history: 2, 4');
    expect(await text('#last')).toBe('last emitted: 4');

    // The stepper's model() writes back to the page signal that feeds the counter.
    await page.fill('#step', '5');
    await expect
      .poll(() => page.locator('demo-stepper').getAttribute('data-step'))
      .toBe('5');
    await page.click('#increment');
    await expect.poll(() => text('#increment')).toBe('Clicks: 9');
  });
});

describe('products', () => {
  test('lists products from a server load backed by an API route', async () => {
    await open('/products');
    expect(await text('#product-list')).toContain('Signal Mug');
    expect(await text('#product-list')).toContain('$18.00');

    await hydrated(page);
    await page.click('#product-list a[href="/products/2"]');
    await expect.poll(() => text('#product-name')).toBe('Zoneless Hoodie');
    expect(await text('#product-description')).toBe(
      'No monkey patches, just comfort.',
    );
  });

  test('handles a missing product', async () => {
    await open('/products/99');
    expect(await text('#product-missing')).toBe('Product not found.');
  });

  test('serves the API route', async () => {
    const response = await fetch(`${baseURL}/api/v1/products`);
    const products = (await response.json()) as unknown[];
    expect(products).toHaveLength(3);
    consoleErrors = [];
  });
});

describe('contact', () => {
  test('validates and submits through a form action', async () => {
    await open('/contact');
    // The browser logs the action's validation response (422) as a failed load.
    expectedErrors.push('status of 422');
    await hydrated(page);

    await page.click('#send');
    await expect
      .poll(() => text('#contact-errors'))
      .toContain('Name is required');

    await page.fill('#name', 'Ada');
    await page.fill('#email', 'ada@example.com');
    await page.click('#send');
    await expect
      .poll(() => text('#contact-success'))
      .toBe('Thanks, Ada! We received your message.');
  });
});

describe('blog', () => {
  test('lists content files and renders markdown', async () => {
    await open('/blog');
    expect(await text('#posts')).toContain('TSRX in Analog');
    expect(await text('#posts')).toContain('Control flow');

    await hydrated(page);
    await page.click('#posts a[href="/blog/tsrx-in-analog"]');
    await expect.poll(() => text('#post-title')).toBe('TSRX in Analog');
    await expect
      .poll(() => text('analog-markdown'))
      .toContain('Pages are export default function Page()');
  });
});

describe('error boundary', () => {
  test('renders the fallback and recovers with reset()', async () => {
    await open('/boundary');
    expect(await text('#fallback')).toContain(
      'Caught: Widget failed to render',
    );

    await hydrated(page);
    await page.click('#retry');
    await expect.poll(() => text('#flaky')).toBe('Widget rendered fine');
  });
});

describe('deferred views', () => {
  test('renders placeholders and loads deferred components lazily', async () => {
    await open('/defer');
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    // Placeholders are server-rendered.
    expect(await text('#details-placeholder')).toBe(
      'Details load when you click the button.',
    );
    expect(await text('#chart-placeholder')).toBe(
      'The chart loads when this scrolls into view.',
    );
    await hydrated(page);

    // on interaction(loadDetails): the component's code loads on click.
    expect(requested.some((url) => url.includes('lazy-details'))).toBe(false);
    await page.click('#load-details');
    await expect
      .poll(() => text('#details'))
      .toBe('These details were loaded on interaction.');
    expect(requested.some((url) => url.includes('lazy-details'))).toBe(true);

    // when ready(): a condition on component state.
    expect(await text('#ready-placeholder')).toBe('Waiting for the condition.');
    await page.click('#mark-ready');
    await expect
      .poll(() => text('#ready-content'))
      .toBe('The condition became true.');

    // on viewport: the chart's code loads once its placeholder scrolls into view.
    expect(requested.some((url) => url.includes('heavy-chart'))).toBe(false);
    await page.locator('#chart-placeholder').scrollIntoViewIfNeeded();
    await expect
      .poll(() => text('#chart'))
      .toContain('Loaded lazily by @defer (on viewport)');
    expect(requested.some((url) => url.includes('heavy-chart'))).toBe(true);
  });
});
