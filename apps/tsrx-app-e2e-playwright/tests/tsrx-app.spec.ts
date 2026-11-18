import { Browser, chromium, Page, type Request } from 'playwright';
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

/** Opens `path`, passing every request from the start of navigation to `onRequest`. */
async function open(
  path: string,
  onRequest?: (request: Request) => void,
): Promise<Page> {
  page = await browser.newPage();
  if (onRequest) page.on('request', onRequest);
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

/**
 * Waits for hydration: Angular removes the `ngh` markers once it has hydrated.
 * Markers inside `@defer` blocks left dehydrated by incremental hydration
 * (`ngb`) stay until those blocks hydrate.
 */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[ngh]')].every((el) => el.closest('[ngb]')),
  );
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

  test('reports a failed submission and keeps the form for a retry', async () => {
    await open('/contact');
    await hydrated(page);
    // Fail the first submission in the network, then let the retry through.
    let failed = false;
    await page.route('**/contact*', (route) => {
      if (route.request().method() === 'POST' && !failed) {
        failed = true;
        return route.abort();
      }
      return route.fallback();
    });
    expectedErrors.push('ERR_FAILED');

    await page.fill('#name', 'Ada');
    await page.fill('#email', 'ada@example.com');
    await page.click('#send');
    await expect
      .poll(() => text('#contact-errors'))
      .toBe('Something went wrong. Please try again.');

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
    const requested: string[] = [];
    await open('/defer', (request) => requested.push(request.url()));

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

describe('incremental hydration', () => {
  test('hydrates a @defer block on interaction and never loads hydrate never', async () => {
    const requested: string[] = [];
    await open('/defer', (request) => requested.push(request.url()));

    // Both blocks render their content on the server, not a placeholder.
    expect(await text('#like')).toBe('Likes: 0');
    expect(await text('#server-note')).toBe(
      'Rendered on the server and never hydrated.',
    );
    expect(requested.some((url) => url.includes('like-button'))).toBe(false);

    // The first click loads and hydrates the block, then is replayed.
    await page.click('#like');
    await expect.poll(() => text('#like')).toBe('Likes: 1');
    expect(requested.some((url) => url.includes('like-button'))).toBe(true);
    await page.click('#like');
    await expect.poll(() => text('#like')).toBe('Likes: 2');

    // hydrate never: the code is never requested.
    await page.locator('#chart-placeholder').scrollIntoViewIfNeeded();
    await expect.poll(() => text('#chart')).toContain('Loaded lazily');
    expect(requested.some((url) => url.includes('server-note'))).toBe(false);
  });
});

describe('content projection', () => {
  test('projects into named, default and fallback slots, and stays reactive', async () => {
    await open('/projection');

    // Server-rendered into the right slots.
    expect(await text('#full-card header')).toBe('Projected title');
    expect(await text('#full-card footer')).toBe('A projected footer.');
    expect(await text('#bare-card header')).toBe('');
    expect(await text('#bare-card footer')).toBe('No footer given.');
    expect(await text('#panel h3')).toBe('A .ts component');

    // contentChild() sees the projected template ref, and only where it's given.
    expect(await text('#full-card .query')).toBe(
      'contentChild: Projected title',
    );
    expect(await text('#bare-card .query')).toBe('contentChild: none');

    // Projected content keeps binding to the parent's state after hydration.
    await hydrated(page);
    await page.click('#card-click');
    await expect.poll(() => text('#card-body')).toBe('Clicked 1 times.');
    expect(await text('#panel-body')).toBe(
      'TSRX markup projected into it, clicked 1 times.',
    );

    expect(await page.locator('#card-details').count()).toBe(0);
    await page.click('#card-expand');
    await expect
      .poll(() => text('#card-details'))
      .toBe('Conditionally projected details.');
    // Conditional content lands in the default slot, not the footer.
    expect(await page.locator('#full-card footer #card-details').count()).toBe(
      0,
    );
  });
});
