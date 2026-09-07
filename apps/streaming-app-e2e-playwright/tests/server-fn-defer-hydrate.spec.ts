import { Browser, chromium, Page, Request } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Adversarial validation for serverFn resolved inside a `@defer (hydrate on ...)`
// block. The component holding `injectServerFn` only instantiates when the block
// resolves on the server, so this exercises whether Angular's SSR stability graph
// (`whenStable`) awaits that late resource and seeds it into TransferState — and
// whether the client then hydrates from the seed with zero refetch.
//
// The `token` returned by the server function is minted per server call, so it is
// a witness: identical SSR-vs-client token == hydrated from the seed; a changed
// token (plus an HTTP call) == refetched on the client.

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3211';
const SERVER_FN_PATH = '/_analog/fn/';
const SEED_KEY_RE = /__analog_fn_[a-z0-9]+_/;
const TOKEN_RE = /srv-[0-9a-f-]{8,}/;
let browser: Browser;

beforeAll(async () => {
  // `PW_EXECUTABLE_PATH` lets a pre-provisioned environment point at its own
  // Chromium; in CI the default (installed by `playwright install`) is used.
  const executablePath = process.env['PW_EXECUTABLE_PATH'];
  browser = await chromium.launch(
    executablePath ? { executablePath } : undefined,
  );
});
afterAll(async () => {
  await browser.close();
});

async function validateRoute(path: string) {
  // Load in a real browser and watch for any client refetch of the server fn.
  // Everything is derived from THIS single navigation: the server mints a fresh
  // token per request, so the SSR token must come from the same response we then
  // hydrate — not a separate fetch.
  // HeadlessChrome intentionally receives buffered HTML. Use a normal browser
  // user-agent so this fixture exercises the progressive path as well.
  const page: Page = await browser.newPage({
    userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36',
  });
  const fnRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (req: Request) => {
    if (req.url().includes(SERVER_FN_PATH)) fnRequests.push(req.url());
  });

  try {
    const response = await page.goto(`${baseURL}${path}`, {
      waitUntil: 'networkidle',
    });
    // 1. The server-rendered document for this navigation carries the serverFn
    //    seed and its value — proof `whenStable` awaited the late resource.
    const ssrHtml = (await response?.text()) ?? '';
    expect(response?.status()).toBe(200);
    expect(ssrHtml.includes('data-analog-authoritative')).toBe(
      path === '/fn-streaming',
    );
    expect(ssrHtml, 'ng-state TransferState script present').toContain(
      'ng-state',
    );
    expect(ssrHtml, 'serverFn seed key present in SSR HTML').toMatch(
      SEED_KEY_RE,
    );
    expect(ssrHtml, 'deferred component rendered on the server').toContain(
      'hello from serverFn',
    );
    const ssrToken = ssrHtml.match(TOKEN_RE)?.[0];
    expect(ssrToken, 'server token embedded in SSR HTML').toBeTruthy();

    // 2. After hydration the block shows the SAME token that was seeded — the
    //    client read the seed rather than refetching.
    const token = await page
      .locator('[data-testid="fn-token"]')
      .first()
      .textContent({ timeout: 10000 });
    expect(token?.trim(), 'client token matches the SSR-seeded token').toBe(
      ssrToken,
    );

    // 3. And it got there with no HTTP round-trip to the server function.
    expect(fnRequests, `no client refetch of ${SERVER_FN_PATH}`).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await page.close();
  }
}

describe('serverFn inside @defer (hydrate on immediate)', () => {
  test('buffered path: seeds TransferState and hydrates with zero refetch', async () => {
    await validateRoute('/fn-buffered');
  });

  test('streaming path: tail carries the seed and hydrates with zero refetch', async () => {
    await validateRoute('/fn-streaming');
  });

  test('HTTP stream sends its shell before the authoritative document and buffers crawlers', async () => {
    const response = await fetch(baseURL, {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain('data-analog-stream');
    expect(first).not.toContain('<template data-analog-authoritative>');
    let html = first;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    const block = html.indexOf('<template data-analog-defer=');
    const tail = html.indexOf('<template data-analog-authoritative>');
    expect(block).toBeGreaterThan(0);
    expect(tail).toBeGreaterThan(block);
    expect(html).toContain('summer');
    const bot = await fetch(baseURL, {
      headers: { 'user-agent': 'Googlebot' },
    });
    const buffered = await bot.text();
    expect(bot.status).toBe(200);
    expect(buffered).toContain('<title>Streamed dynamically');
    expect(buffered).toContain('summer');
    expect(buffered).not.toContain('data-analog-authoritative');
  });
});
