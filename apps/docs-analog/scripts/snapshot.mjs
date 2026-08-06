#!/usr/bin/env node
/**
 * Snapshot tool for the docs-analog dev server.
 *
 * Hits a URL with Playwright/Chromium, optionally interacts with the
 * page, then writes a PNG. Useful for visual regression spot-checks
 * during UI iteration without keeping a browser open.
 *
 * Usage:
 *   node scripts/snapshot.mjs <path> [options]
 *
 * Options:
 *   --base=<url>          Base URL (default: http://localhost:4400)
 *   --out=<file>          Output PNG (default: /tmp/snapshot.png)
 *   --viewport=<WxH>      Viewport size (default: 1440x900)
 *   --device=<name>       Playwright device preset (e.g. "iPhone 14")
 *   --dark                Emulate prefers-color-scheme: dark
 *   --light               Emulate prefers-color-scheme: light
 *   --wait=<ms>           Extra wait after load (default: 1200)
 *   --full                Capture full-page screenshot (default: viewport only)
 *   --scroll=<y>          Scroll to Y before snapping
 *   --click=<selector>    Click the selector then wait before snapping
 *   --eval=<js>           Evaluate JS in the page before snapping
 *
 * Examples:
 *   node scripts/snapshot.mjs /
 *   node scripts/snapshot.mjs /docs/introduction --dark --device="iPhone 14"
 *   node scripts/snapshot.mjs /docs/features/routing/overview --scroll=1500
 *   node scripts/snapshot.mjs / --click='button[aria-label="Open documentation menu"]'
 */

import { chromium, devices } from 'playwright';

function parseArgs(argv) {
  const opts = {
    base: 'http://localhost:4400',
    out: '/tmp/snapshot.png',
    viewport: '1440x900',
    device: null,
    colorScheme: null,
    wait: 1200,
    fullPage: false,
    scroll: null,
    click: null,
    eval: null,
    path: '/',
  };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--out=')) opts.out = arg.slice(6);
    else if (arg.startsWith('--viewport=')) opts.viewport = arg.slice(11);
    else if (arg.startsWith('--device=')) opts.device = arg.slice(9);
    else if (arg === '--dark') opts.colorScheme = 'dark';
    else if (arg === '--light') opts.colorScheme = 'light';
    else if (arg.startsWith('--wait=')) opts.wait = Number(arg.slice(7));
    else if (arg === '--full') opts.fullPage = true;
    else if (arg.startsWith('--scroll=')) opts.scroll = Number(arg.slice(9));
    else if (arg.startsWith('--click=')) opts.click = arg.slice(8);
    else if (arg.startsWith('--eval=')) opts.eval = arg.slice(7);
    else if (!arg.startsWith('--')) opts.path = arg;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const browser = await chromium.launch();

const contextOptions = {};
if (opts.device) {
  Object.assign(contextOptions, devices[opts.device] ?? {});
}
if (!opts.device) {
  const [w, h] = opts.viewport.split('x').map(Number);
  contextOptions.viewport = { width: w, height: h };
}
if (opts.colorScheme) contextOptions.colorScheme = opts.colorScheme;

const ctx = await browser.newContext(contextOptions);
const page = await ctx.newPage();
const url = opts.path.startsWith('http') ? opts.path : opts.base + opts.path;

console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(opts.wait);

if (opts.click) {
  await page.click(opts.click);
  await page.waitForTimeout(400);
}
if (opts.scroll !== null) {
  await page.evaluate((y) => window.scrollTo(0, y), opts.scroll);
  await page.waitForTimeout(400);
}
if (opts.eval) {
  await page.evaluate(opts.eval);
  await page.waitForTimeout(400);
}

await page.screenshot({ path: opts.out, fullPage: opts.fullPage });
console.log(`✓ wrote ${opts.out}`);

await browser.close();
