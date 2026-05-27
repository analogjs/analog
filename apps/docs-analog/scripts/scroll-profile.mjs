#!/usr/bin/env node
/**
 * Scroll performance profiler.
 *
 * Loads a URL with Playwright/Chromium and records layout/style-recalc
 * /script timings during synthetic wheel scrolling. Useful for catching
 * regressions in scroll jank without firing up DevTools.
 *
 * Usage:
 *   node scripts/scroll-profile.mjs <path> [options]
 *
 * Options:
 *   --base=<url>       Base URL (default: http://localhost:4400)
 *   --viewport=<WxH>   Viewport (default: 1440x900)
 *   --iters=<n>        Wheel events per direction (default: 60)
 *   --delta=<px>       Pixels per wheel event (default: 400)
 *   --gap=<ms>         Delay between wheel events (default: 30)
 *
 * Output: prints elapsed time and CDP Performance metric deltas. Tiny
 * LayoutDuration/RecalcStyleDuration numbers (<10ms total over hundreds
 * of events) mean the page isn't doing per-frame layout work.
 */

import { chromium } from 'playwright';

function parseArgs(argv) {
  const opts = {
    base: 'http://localhost:4400',
    viewport: '1440x900',
    iters: 60,
    delta: 400,
    gap: 30,
    path: '/',
  };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--viewport=')) opts.viewport = arg.slice(11);
    else if (arg.startsWith('--iters=')) opts.iters = Number(arg.slice(8));
    else if (arg.startsWith('--delta=')) opts.delta = Number(arg.slice(8));
    else if (arg.startsWith('--gap=')) opts.gap = Number(arg.slice(6));
    else if (!arg.startsWith('--')) opts.path = arg;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const [w, h] = opts.viewport.split('x').map(Number);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: h } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');

const url = opts.path.startsWith('http') ? opts.path : opts.base + opts.path;
console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const start = Date.now();
const before = await cdp.send('Performance.getMetrics');
const beforeMap = Object.fromEntries(before.metrics.map((m) => [m.name, m.value]));

for (let i = 0; i < opts.iters; i++) {
  await page.mouse.wheel(0, opts.delta);
  await page.waitForTimeout(opts.gap);
}
for (let i = 0; i < opts.iters; i++) {
  await page.mouse.wheel(0, -opts.delta);
  await page.waitForTimeout(opts.gap);
}

const after = await cdp.send('Performance.getMetrics');
const afterMap = Object.fromEntries(after.metrics.map((m) => [m.name, m.value]));

const elapsed = Date.now() - start;
console.log('elapsed (ms):', elapsed);
console.log(
  'LayoutDuration delta (s):',
  (afterMap.LayoutDuration - beforeMap.LayoutDuration).toFixed(3),
);
console.log(
  'RecalcStyleDuration delta (s):',
  (afterMap.RecalcStyleDuration - beforeMap.RecalcStyleDuration).toFixed(3),
);
console.log(
  'ScriptDuration delta (s):',
  (afterMap.ScriptDuration - beforeMap.ScriptDuration).toFixed(3),
);
console.log('LayoutCount delta:', afterMap.LayoutCount - beforeMap.LayoutCount);
console.log(
  'RecalcStyleCount delta:',
  afterMap.RecalcStyleCount - beforeMap.RecalcStyleCount,
);

await browser.close();
