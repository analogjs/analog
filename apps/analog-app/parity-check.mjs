/**
 * Parity check: dump HTML output for each renderer and diff.
 *
 * Usage: node apps/analog-app/parity-check.mjs
 */

import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = __dirname;
const URL = '/';

function createFakeServerContext(url) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = url;
  req.method = 'GET';
  req.headers = { host: 'localhost:3000', 'user-agent': 'parity' };
  req.originalUrl = url;
  req.connection = { encrypted: false };
  const res = new ServerResponse(req);
  return { req, res };
}

async function loadAndRender(viteServer, modulePath, template, url) {
  const mod = await viteServer.ssrLoadModule(modulePath);
  const ctx = createFakeServerContext(url);
  return await mod.default(url, template, ctx);
}

function summarizeDiff(a, b, labelA, labelB) {
  const linesA = a.split(/(?<=>)/);
  const linesB = b.split(/(?<=>)/);
  console.log(`\n  ${labelA}: ${a.length}B, ${linesA.length} fragments`);
  console.log(`  ${labelB}: ${b.length}B, ${linesB.length} fragments`);

  // Fragments only in A
  const setA = new Set(linesA);
  const setB = new Set(linesB);
  const onlyInA = linesA.filter((l) => !setB.has(l));
  const onlyInB = linesB.filter((l) => !setA.has(l));

  if (onlyInA.length === 0 && onlyInB.length === 0) {
    console.log('  IDENTICAL');
    return;
  }
  if (onlyInA.length) {
    console.log(`\n  Only in ${labelA} (${onlyInA.length} fragments):`);
    for (const l of onlyInA.slice(0, 30)) {
      console.log(`    - ${JSON.stringify(l).slice(0, 200)}`);
    }
    if (onlyInA.length > 30) {
      console.log(`    ... and ${onlyInA.length - 30} more`);
    }
  }
  if (onlyInB.length) {
    console.log(`\n  Only in ${labelB} (${onlyInB.length} fragments):`);
    for (const l of onlyInB.slice(0, 30)) {
      console.log(`    + ${JSON.stringify(l).slice(0, 200)}`);
    }
    if (onlyInB.length > 30) {
      console.log(`    ... and ${onlyInB.length - 30} more`);
    }
  }
}

async function main() {
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
        '~analog/entry-server-fast': resolve(
          APP_ROOT,
          'src/main.server.fast.ts',
        ),
      },
    },
  });

  try {
    let template = readFileSync(resolve(APP_ROOT, 'index.html'), 'utf-8');
    template = await viteServer.transformIndexHtml('/', template);

    const origConsole = { error: console.error, warn: console.warn };
    console.error = () => {};
    console.warn = () => {};

    const baseHtml = await loadAndRender(
      viteServer,
      '~analog/entry-server',
      template,
      URL,
    );
    const stringHtml = await loadAndRender(
      viteServer,
      '~analog/entry-server-string',
      template,
      URL,
    );
    const fastHtml = await loadAndRender(
      viteServer,
      '~analog/entry-server-fast',
      template,
      URL,
    );

    console.error = origConsole.error;
    console.warn = origConsole.warn;

    writeFileSync('/tmp/render.html', baseHtml);
    writeFileSync('/tmp/renderToString.html', stringHtml);
    writeFileSync('/tmp/renderToStringFast.html', fastHtml);

    console.log('Wrote /tmp/render.html, /tmp/renderToString.html, /tmp/renderToStringFast.html');
    console.log('\n=== render() vs renderToString() ===');
    summarizeDiff(baseHtml, stringHtml, 'render()', 'renderToString()');

    console.log('\n=== renderToString() vs renderToStringFast() ===');
    summarizeDiff(stringHtml, fastHtml, 'renderToString()', 'renderToStringFast()');

    console.log('\n=== render() vs renderToStringFast() ===');
    summarizeDiff(baseHtml, fastHtml, 'render()', 'renderToStringFast()');
  } finally {
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error('Parity check failed:', err);
  process.exit(1);
});
