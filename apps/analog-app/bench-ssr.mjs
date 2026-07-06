/**
 * End-to-end SSR benchmark: render() vs renderToString()
 *
 * Boots a Vite dev server, loads each renderer entry point,
 * and measures real rendering times for the analog-app.
 *
 * Usage: node apps/analog-app/bench-ssr.mjs
 */

import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = __dirname;
const ITERATIONS = 100;
const WARMUP = 10;
const URLS = ['/'];

function createFakeServerContext(url) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = url;
  req.method = 'GET';
  req.headers = {
    host: 'localhost:3000',
    'user-agent': 'benchmark',
  };
  req.originalUrl = url;
  req.connection = { encrypted: false };
  const res = new ServerResponse(req);
  return { req, res };
}

function computeStats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function benchmarkRenderer(viteServer, modulePath, name, template, url) {
  const mod = await viteServer.ssrLoadModule(modulePath);
  const renderFn = mod.default;

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    const ctx = createFakeServerContext(url);
    await renderFn(url, template, ctx);
  }

  // Benchmark
  const times = [];
  let htmlLength = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const ctx = createFakeServerContext(url);
    const start = performance.now();
    const result = await renderFn(url, template, ctx);
    const elapsed = performance.now() - start;
    times.push(elapsed);
    if (typeof result === 'string') {
      htmlLength = result.length;
    }
  }

  return { name, url, htmlLength, ...computeStats(times) };
}

function formatMs(ms) {
  return ms.toFixed(2).padStart(8) + 'ms';
}

function printResults(results) {
  console.log('\n' + '='.repeat(105));
  console.log('  SSR Benchmark Results');
  console.log(
    `  ${ITERATIONS} iterations per renderer per URL, ${WARMUP} warmup`,
  );
  console.log('='.repeat(105));
  console.log(
    `  ${'Renderer'.padEnd(20)} ${'URL'.padEnd(12)} ${'Mean'.padStart(10)} ${'Median'.padStart(10)} ${'P95'.padStart(10)} ${'P99'.padStart(10)} ${'Min'.padStart(10)} ${'Max'.padStart(10)} ${'HTML'.padStart(8)}`,
  );
  console.log('  ' + '-'.repeat(103));

  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(20)} ${r.url.padEnd(12)} ${formatMs(r.mean)} ${formatMs(r.median)} ${formatMs(r.p95)} ${formatMs(r.p99)} ${formatMs(r.min)} ${formatMs(r.max)} ${String(r.htmlLength).padStart(6)}B`,
    );
  }

  console.log('\n  ' + '-'.repeat(60));
  console.log('  Comparison (mean render time):');
  for (const url of URLS) {
    const baseline = results.find(
      (r) => r.name === 'render()' && r.url === url,
    );
    const experimental = results.find(
      (r) => r.name === 'renderToString()' && r.url === url,
    );
    const compareTo = (other, label) => {
      if (!baseline || !other) return;
      const diff = ((baseline.mean - other.mean) / baseline.mean) * 100;
      const faster = diff > 0 ? 'faster' : 'slower';
      console.log(
        `  ${url}: ${label} is ${Math.abs(diff).toFixed(1)}% ${faster} than render()`,
      );
    };
    compareTo(experimental, 'renderToString()');
    if (baseline) {
      console.log(
        `    render():               ${formatMs(baseline.mean)} (median ${formatMs(baseline.median)})`,
      );
    }
    if (experimental) {
      console.log(
        `    renderToString():       ${formatMs(experimental.mean)} (median ${formatMs(experimental.median)})`,
      );
    }
  }
  console.log('='.repeat(105) + '\n');
}

async function main() {
  console.log('Starting Vite dev server for analog-app...');

  // Suppress Angular's noisy console output during benchmark
  const origError = console.error;
  const origWarn = console.warn;
  const origLog = console.log;
  let suppressLogs = false;
  const quietConsole = (fn) =>
    (...args) => {
      if (suppressLogs) return;
      fn(...args);
    };

  const viteServer = await createServer({
    configFile: resolve(APP_ROOT, 'vite.config.ts'),
    root: APP_ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    resolve: {
      alias: {
        '~analog/entry-server': resolve(APP_ROOT, 'src/main.server.ts'),
        '~analog/entry-server-string': resolve(
          APP_ROOT,
          'src/main.server.string.ts',
        ),
      },
    },
  });

  try {
    let template = readFileSync(resolve(APP_ROOT, 'index.html'), 'utf-8');
    template = await viteServer.transformIndexHtml('/', template);

    console.log(`Template loaded (${template.length} bytes)`);
    console.log(
      `Running ${ITERATIONS} iterations per renderer per URL (${WARMUP} warmup)...\n`,
    );

    const results = [];

    for (const url of URLS) {
      console.log(`Benchmarking URL: ${url}`);

      // Suppress Angular's verbose error/navigation logging during rendering
      suppressLogs = true;
      console.error = quietConsole(origError);
      console.warn = quietConsole(origWarn);

      console.log = origLog; // Keep our output
      console.log('  render() (baseline) ...');
      console.log = quietConsole(origLog);

      try {
        const baseline = await benchmarkRenderer(
          viteServer,
          '~analog/entry-server',
          'render()',
          template,
          url,
        );
        results.push(baseline);
      } catch (err) {
        console.log = origLog;
        console.log('  render() failed:', err.message);
      }

      console.log = origLog;
      console.log('  renderToString() ...');
      console.log = quietConsole(origLog);

      try {
        const experimental = await benchmarkRenderer(
          viteServer,
          '~analog/entry-server-string',
          'renderToString()',
          template,
          url,
        );
        results.push(experimental);
      } catch (err) {
        console.log = origLog;
        console.log('  renderToString() failed:', err.message);
      }

      // Restore console
      suppressLogs = false;
      console.error = origError;
      console.warn = origWarn;
      console.log = origLog;
    }

    if (results.length > 0) {
      printResults(results);
    }
  } finally {
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
