/**
 * Boots the built server and drives a real Chromium via Playwright to
 * assert hydration and client-side behavior. Run with
 * `nx verify-browser esbuild-app`, which builds first.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const port = 4174;
const base = `http://localhost:${port}`;
const outDir = new URL('../../dist/apps/esbuild-app/', import.meta.url)
  .pathname;

const { chromium } = await import('@playwright/test');

const server = spawn(process.execPath, [join(outDir, 'server/server.mjs')], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});

const checks = [];
let browser;

const waitFor = (page, fn, arg) =>
  page.waitForFunction(fn, arg, { timeout: 10_000 });

try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium',
    });
  }

  const errors = [];
  const trackErrors = (page) => {
    page.on('console', (msg) => {
      // Failed favicon lookups surface as console errors; not under
      // test. The 422 is the deliberate form-action failure submit.
      const source = msg.location()?.url ?? '';
      if (
        msg.type() === 'error' &&
        !source.includes('favicon') &&
        !msg.text().includes('status of 422')
      ) {
        errors.push(`${msg.text()} (${source})`);
      }
    });
    page.on('pageerror', (err) => errors.push(String(err)));
  };

  // --- SSR load + hydration on the home page ---
  const homeHtml = await (await fetch(base)).text();
  checks.push([
    'served HTML carries hydration annotations',
    homeHtml.includes('ngh='),
  ]);

  const page = await browser.newPage();
  trackErrors(page);
  await page.goto(base, { waitUntil: 'load' });
  await waitFor(
    page,
    () => document.querySelector('h1')?.textContent === 'Home',
  );
  checks.push(['home page renders in the browser', true]);

  // A marker on window survives soft navigation but not a full reload.
  await page.evaluate(() => {
    window.__softNav = true;
  });

  // --- client-side navigation into a lazy page route ---
  await page.click('a[href="/products/1"]');
  await waitFor(
    page,
    () => document.querySelector('h1')?.textContent === 'Product 1',
  );
  checks.push([
    'client-side navigation lazy-loads a page route',
    await page.evaluate(() => window.__softNav === true),
  ]);

  // --- client-side navigation into a markdown content route ---
  await page.goBack();
  await waitFor(
    page,
    () => document.querySelector('h1')?.textContent === 'Home',
  );
  await page.click('a[href="/about"]');
  await waitFor(page, () => !!document.querySelector('h1#about'));
  checks.push([
    'markdown route renders through client-side navigation',
    (await page.evaluate(() => window.__softNav === true)) &&
      (await page.locator('pre.shiki').count()) > 0,
  ]);

  // --- mermaid renders through injectContent + MarkdownComponent ---
  // Markdown ROUTES pass mermaid fences through without client
  // rendering (same as the Vite path); diagrams render via
  // <analog-markdown>, exercised by the blog page.
  const blogPage = await browser.newPage();
  trackErrors(blogPage);
  await blogPage.goto(`${base}/blog/about`, { waitUntil: 'load' });
  await waitFor(blogPage, () => !!document.querySelector('pre.mermaid svg'));
  checks.push(['mermaid diagram renders through analog-markdown', true]);

  // --- per-request SSR page hydrates with the bridged base URL ---
  const ssrPage = await browser.newPage();
  trackErrors(ssrPage);
  await ssrPage.goto(`${base}/products/42`, { waitUntil: 'load' });
  await waitFor(
    ssrPage,
    () => document.querySelector('h1')?.textContent === 'Product 42',
  );
  // Give hydration a beat to run and (if mismatched) destroy the DOM.
  await ssrPage.waitForTimeout(500);
  checks.push([
    'ssr page hydrates with the bridged base URL after client takeover',
    (await ssrPage.locator('[data-base-url]').textContent()) === base,
  ]);

  // --- injectLoad data from a .server.ts page endpoint ---
  const loadPage = await browser.newPage();
  trackErrors(loadPage);
  await loadPage.goto(`${base}/feedback`, { waitUntil: 'load' });
  await waitFor(
    loadPage,
    () =>
      document.querySelector('[data-load]')?.textContent === 'from-server-load',
  );
  checks.push(['injectLoad page hydrates with page endpoint data', true]);

  // --- FormAction directive posts to the page endpoint action ---
  await loadPage.fill('input[name="comment"]', 'hi from browser');
  await loadPage.click('button[type="submit"]');
  await waitFor(
    loadPage,
    () =>
      document.querySelector('[data-saved]')?.textContent === 'hi from browser',
  );
  checks.push(['form action submits and emits onSuccess', true]);

  await loadPage.fill('input[name="comment"]', '');
  await loadPage.click('button[type="submit"]');
  await waitFor(
    loadPage,
    () => document.querySelector('[data-errors]')?.textContent === 'required',
  );
  checks.push(['form action failure emits onError with the errors', true]);

  // --- injectServerFn hydrates from the TransferState seed ---
  const fnPage = await browser.newPage();
  trackErrors(fnPage);
  await fnPage.goto(`${base}/fn-demo`, { waitUntil: 'load' });
  await waitFor(
    fnPage,
    () =>
      document.querySelector('[data-fn]')?.textContent ===
      'hello-from-server-fn',
  );
  checks.push(['injectServerFn page hydrates with the server value', true]);

  // --- streamed page settles and hydrates its defer blocks ---
  // Headless Chromium's default UA matches the bot fallback, so use a
  // regular Chrome UA to exercise the actual streamed path.
  const streamPage = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  });
  trackErrors(streamPage);
  await streamPage.goto(`${base}/stream-demo`, { waitUntil: 'load' });
  await waitFor(
    streamPage,
    () =>
      document.querySelector('[data-stream-a]')?.textContent ===
        'alpha-block' &&
      document.querySelector('[data-stream-b]')?.textContent === 'beta-block',
  );
  checks.push(['streamed page settles with both defer blocks', true]);

  checks.push([
    'no console or page errors across the browser session',
    errors.length === 0,
    errors.slice(0, 3).join(' | '),
  ]);
} finally {
  await browser?.close();
  server.kill();
}

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failed++;
}

console.log(
  `\n${checks.length - failed}/${checks.length} browser checks passed`,
);
process.exit(failed === 0 ? 0 : 1);
