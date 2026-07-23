/**
 * Core Web Vitals benchmark: streamed vs buffered render of the SAME page.
 *
 * Usage:
 *   npx nx build streaming-app --configuration=production
 *   PORT=3210 HOST=127.0.0.1 node dist/apps/streaming-app/analog/server/index.mjs &
 *   node apps/streaming-app/tools/cwv-bench.mjs           # BASE/ITERS overridable via env
 *
 * The same route (`/`) is measured both ways, decided by User-Agent: a browser
 * UA streams, a Googlebot UA takes the buffered fallback. Page, bundle, and the
 * ~600ms httpResource dependency are identical, so only the render strategy
 * differs. Throttled to Lighthouse mobile-ish conditions (Slow-4G + 4x CPU) so
 * the TTFB/FCP deltas are meaningful.
 *
 * Playwright is used rather than Lighthouse on purpose: Lighthouse's own
 * user-agent matches `SSR_BOT_RE`, so it would only ever measure the buffered
 * path. Requires the repo's `playwright` dev dependency + `npx playwright install`.
 */
import pw from 'playwright';
const { chromium } = pw;

const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const URL = `${BASE}/`;
const ITERS = Number(process.env.ITERS || 9);

const UA_BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const UA_BOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Lighthouse "Slow 4G": 150ms RTT, ~1.6 Mbps down / 0.75 up, 4x CPU.
const NET = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (0.75 * 1024 * 1024) / 8,
};
const CPU_RATE = 4;

const OBSERVERS = `
window.__cwv = { lcp: 0, lcpEl: '', cls: 0, fcp: 0, events: [] };
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    window.__cwv.lcp = e.startTime;
    const el = e.element;
    window.__cwv.lcpEl = el ? (el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/)[0] : '')) : '';
  }
}).observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value;
}).observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__cwv.fcp = e.startTime;
}).observe({ type: 'paint', buffered: true });
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) window.__cwv.events.push({ name: e.name, dur: e.duration });
}).observe({ type: 'event', buffered: true, durationThreshold: 0 });
`;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function runOnce(browser, ua) {
  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', NET);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  await page.addInitScript(OBSERVERS);

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  // Let the ~600ms data + tail + hydration settle, and give LCP time to finalize.
  await page.waitForTimeout(2500);

  // INP proxy: click the interaction-hydrated block, take the slowest pointer/
  // click event-timing entry it produces.
  const before = await page.evaluate(() => window.__cwv.events.length);
  const btn = page.locator('.btn-c');
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(600);
  }
  const inp = await page.evaluate((n) => {
    const evs = window.__cwv.events
      .slice(n)
      .filter((e) => ['pointerdown', 'pointerup', 'click'].includes(e.name));
    return evs.length ? Math.max(...evs.map((e) => e.dur)) : null;
  }, before);

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    return { ttfb: n.responseStart || 0, load: n.loadEventEnd || 0 };
  });
  const cwv = await page.evaluate(() => window.__cwv);

  await context.close();
  return {
    ttfb: nav.ttfb,
    fcp: cwv.fcp,
    lcp: cwv.lcp,
    lcpEl: cwv.lcpEl,
    cls: cwv.cls,
    load: nav.load,
    inp,
  };
}

async function bench(browser, label, ua) {
  const rows = [];
  for (let i = 0; i < ITERS; i++) rows.push(await runOnce(browser, ua));
  const pick = (k) =>
    rows.map((r) => r[k]).filter((v) => v != null && !Number.isNaN(v));
  return {
    label,
    ttfb: median(pick('ttfb')),
    fcp: median(pick('fcp')),
    lcp: median(pick('lcp')),
    lcpEl:
      rows
        .map((r) => r.lcpEl)
        .filter(Boolean)
        .pop() || '(none)',
    cls: median(pick('cls')),
    load: median(pick('load')),
    inp: pick('inp').length ? median(pick('inp')) : null,
  };
}

const browser = await chromium.launch({ headless: true });
const streamed = await bench(browser, 'streamed', UA_BROWSER);
const buffered = await bench(browser, 'buffered', UA_BOT);
await browser.close();

const ms = (v) => (v == null ? '   n/a' : `${Math.round(v)}ms`.padStart(6));
const fmt = (r) =>
  `${r.label.padEnd(9)} TTFB=${ms(r.ttfb)}  FCP=${ms(r.fcp)}  LCP=${ms(r.lcp)}  CLS=${r.cls
    .toFixed(3)
    .padStart(6)}  load=${ms(r.load)}  INP≈${ms(r.inp)}  LCPel=${r.lcpEl}`;

console.log(
  `\n== CWV: streamed vs buffered, same page, Slow-4G + 4x CPU, median of ${ITERS} ==`,
);
console.log(fmt(streamed));
console.log(fmt(buffered));
console.log('\nJSON ' + JSON.stringify({ streamed, buffered }));
