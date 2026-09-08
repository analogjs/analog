// Copy into an installed consumer before running so imports use its toolchain.
// node --expose-gc compiler-runtime-qualification.mjs --output=result.json
//   --mode=ngtsc|fast|api --components=100 --edits=60 --duration-ms=240000
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import {
  createServer,
  createRunnableDevEnvironment,
  version as viteVersion,
} from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    mode: { type: 'string', default: 'ngtsc' },
    components: { type: 'string', default: '1' },
    edits: { type: 'string', default: '10' },
    'duration-ms': { type: 'string', default: '0' },
    'restart-every': { type: 'string', default: '0' },
    'close-queued': { type: 'boolean', default: false },
    'refresh-ssr': { type: 'boolean', default: false },
    'expect-style-state': { type: 'boolean', default: false },
    'event-latency': { type: 'boolean', default: false },
    'race-ssr': { type: 'boolean', default: false },
    'split-resource-write-ms': { type: 'string', default: '0' },
    'ssr-first': { type: 'boolean', default: false },
    'ssr-idle-ms': { type: 'string', default: '0' },
    warmup: { type: 'string', default: 'default' },
    'race-source': { type: 'boolean', default: false },
    'ssr-loader': { type: 'string', default: 'compat' },
    label: { type: 'string', default: 'candidate' },
  },
});
assert.ok(values.output, '--output is required');
assert.ok(['ngtsc', 'fast', 'api'].includes(values.mode));
assert.ok(['compat', 'runner'].includes(values['ssr-loader']));
assert.ok(['default', 'off'].includes(values.warmup));
assert.equal(process.version, 'v24.15.0');
assert.equal(typeof globalThis.gc, 'function', 'Run with --expose-gc');
const count = Number(values.components),
  edits = Number(values.edits);
const duration = Number(values['duration-ms']),
  restartEvery = Number(values['restart-every']);
const splitResourceWriteMs = Number(values['split-resource-write-ms']);
assert.ok(
  Number.isSafeInteger(splitResourceWriteMs) && splitResourceWriteMs >= 0,
);
assert.ok(
  !splitResourceWriteMs || !values['event-latency'],
  'Split writes are correctness probes, not latency samples',
);
for (const number of [count, edits, duration, restartEvery])
  assert.ok(Number.isSafeInteger(number) && number >= 0);
assert.ok(count >= 1 && edits >= 1);
const output = resolve(values.output);
const root = await fs.mkdtemp(join(process.cwd(), 'runtime-project-'));
const require = createRequire(import.meta.url);
const records = [],
  memory = [],
  restarts = [],
  errors = [];
const sockets = [];
const result = {
  label: values.label,
  mode: values.mode,
  components: count,
  edits,
  durationMs: duration,
  splitResourceWriteMs,
  node: process.version,
  vite: viteVersion,
  angular: require('@angular/core/package.json').version,
  typescript: require('typescript/package.json').version,
  ssrLoader: values['ssr-loader'],
  startupOrder: values['ssr-first'] ? 'server-first' : 'browser-first',
  ssrIdleMs: Number(values['ssr-idle-ms']),
  warmup: values.warmup,
  latencyProbe: values['event-latency'] ? 'dom-events' : 'frame-poll',
  records,
  memory,
  restarts,
  errors,
  passed: false,
};
const initialCpu = process.cpuUsage();
const started = performance.now();
const capture = (stage) => {
  memory.push({
    stage,
    elapsedMs: performance.now() - started,
    ...process.memoryUsage(),
  });
};
const persist = async () => {
  await fs.writeFile(`${output}.tmp`, JSON.stringify(result, null, 2));
  await fs.rename(`${output}.tmp`, output);
};
await fs.mkdir(join(root, 'src'));
const childNames = Array.from(
  { length: count - 1 },
  (_, index) => `Child${index}`,
);
const childTags = childNames.map((_, index) => `<child-${index}/>`).join('');
const template = (revision) =>
  `<p data-message>REVISION_${revision}</p><button data-count (click)="count=count+1">{{count}}</button>${childTags}`;
const css = (revision) =>
  `[data-message] { --fixture-revision: ${revision}px; }`;
for (const [index, name] of childNames.entries()) {
  await fs.writeFile(
    join(root, `src/child-${index}.ts`),
    `import {Component} from '@angular/core'; @Component({selector:'child-${index}',standalone:true,template:'<span data-child="${index}">child ${index}</span>'}) export class ${name} {}`,
  );
}
const imports = childNames
  .map((name, index) => `import {${name}} from './child-${index}';`)
  .join('\n');
await fs.writeFile(
  join(root, 'src/app.ts'),
  `import {Component} from '@angular/core'; ${imports}\n@Component({selector:'app-root',standalone:true,imports:[${childNames.join(',')}],templateUrl:'./view.html',styleUrl:'./view.css'}) export class App { count = 0; }`,
);
await fs.writeFile(join(root, 'src/view.html'), template(0));
await fs.writeFile(join(root, 'src/view.css'), css(0));
await fs.writeFile(
  join(root, 'index.html'),
  '<html><head></head><body><app-root></app-root><script type="module" src="/src/browser.ts"></script></body></html>',
);
await fs.writeFile(
  join(root, 'src/browser.ts'),
  "import 'zone.js'; import {bootstrapApplication} from '@angular/platform-browser'; import {provideZoneChangeDetection} from '@angular/core'; import {App} from './app'; bootstrapApplication(App,{providers:[provideZoneChangeDetection()]});",
);
await fs.writeFile(
  join(root, 'src/ssr.ts'),
  "import 'zone.js/node'; import '@angular/compiler'; import {bootstrapApplication} from '@angular/platform-browser'; import {provideZoneChangeDetection} from '@angular/core'; import {renderApplication,provideServerRendering} from '@angular/platform-server'; import {App} from './app'; export function render(){return renderApplication(context=>bootstrapApplication(App,{providers:[provideServerRendering(),provideZoneChangeDetection()]},context),{document:'<html><head></head><body><app-root></app-root></body></html>',url:'http://localhost/',allowedHosts:['localhost']});}",
);
let sourceRevision = 0;
if (values['race-source']) {
  await fs.writeFile(
    join(root, 'src/version.ts'),
    'export const sourceRevision = 0;',
  );
  await fs.appendFile(
    join(root, 'src/ssr.ts'),
    "\nexport { sourceRevision } from './version';",
  );
}
await fs.writeFile(
  join(root, 'tsconfig.json'),
  JSON.stringify({
    files: ['src/browser.ts', 'src/ssr.ts'],
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      types: [],
    },
  }),
);
const reservation = createNetServer();
await new Promise((done, fail) =>
  reservation.once('error', fail).listen(0, '127.0.0.1', done),
);
const address = reservation.address();
assert.ok(address && typeof address !== 'string');
await new Promise((done, fail) =>
  reservation.close((error) => (error ? fail(error) : done())),
);
const origin = `http://127.0.0.1:${address.port}`;
const plugins = angular({
  workspaceRoot: root,
  tsconfig: join(root, 'tsconfig.json'),
  jit: false,
  liveReload: true,
  fastCompile: values.mode === 'fast',
  experimental: {
    useAngularCompilationAPI: values.mode === 'api',
    ...(values.warmup === 'off' ? { ssrHmrWarmup: false } : {}),
  },
});
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(root, '.vite-cache'),
  logLevel: 'silent',
  plugins,
  ...(values['ssr-loader'] === 'runner'
    ? {
        environments: {
          ssr: { dev: { createEnvironment: createRunnableDevEnvironment } },
        },
      }
    : {}),
  server: { host: '127.0.0.1', port: address.port, strictPort: true },
});
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('websocket', (socket) =>
  socket.on('framereceived', (frame) => sockets.push(String(frame.payload))),
);
let sampler;
let completed = false;
async function renderSsr(revision) {
  // A common SSR host policy makes the corrected legacy control comparable.
  // Native candidate soak runs leave this off to test its own invalidation.
  if (values['refresh-ssr'])
    server.environments.ssr.moduleGraph.invalidateAll();
  const start = performance.now();
  const module =
    values['ssr-loader'] === 'runner'
      ? await server.environments.ssr.runner.import('/src/ssr.ts')
      : await server.ssrLoadModule('/src/ssr.ts');
  if (values['race-source'])
    assert.equal(
      module.sourceRevision,
      sourceRevision,
      'SSR source is current',
    );
  const html = await module.render();
  const ms = performance.now() - start;
  assert.ok(html.includes(`REVISION_${revision}`), 'SSR template is current');
  const rendered = await browser.newPage();
  try {
    await rendered.setContent(
      html.replace('<head>', `<head><base href="${origin}/">`),
    );
    assert.equal(
      await rendered.locator('[data-child]').count(),
      count - 1,
      'SSR includes every child',
    );
    await rendered.waitForFunction(
      (n) => {
        const element = document.querySelector('[data-message]');
        return (
          element &&
          getComputedStyle(element)
            .getPropertyValue('--fixture-revision')
            .trim() === `${n}px`
        );
      },
      revision,
      { timeout: 5000 },
    );
  } finally {
    await rendered.close();
  }
  return {
    ms,
    htmlBytes: Buffer.byteLength(html),
    css: html.includes('<link') ? 'linked' : 'inline',
  };
}
// Arm before the write. Mutation/load events observe the rendered condition
// without adding a requestAnimationFrame polling interval to edit latency.
async function armBrowserUpdate(kind, revision) {
  if (!values['event-latency']) return;
  await page.evaluate(
    ({ kind, revision }) => {
      globalThis.__analogUpdate = new Promise((resolve, reject) => {
        const finish = (error) => {
          observer.disconnect();
          document.removeEventListener('load', check, true);
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        };
        const check = () => {
          const element = document.querySelector('[data-message]');
          if (
            element &&
            (kind === 'template'
              ? element.textContent === `REVISION_${revision}`
              : getComputedStyle(element)
                  .getPropertyValue('--fixture-revision')
                  .trim() === `${revision}px`)
          )
            finish();
        };
        const observer = new MutationObserver(check);
        const timeout = setTimeout(
          () => finish(new Error(`${kind} update timed out`)),
          15000,
        );
        observer.observe(document, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        document.addEventListener('load', check, true);
      });
    },
    { kind, revision },
  );
}
try {
  await server.listen();
  if (values['ssr-first']) result.initialSsr = await renderSsr(0);
  await page.goto(origin);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-message]')?.textContent === 'REVISION_0',
  );
  assert.equal(
    await page.locator('[data-child]').count(),
    count - 1,
    'Browser includes every child',
  );
  result.initialSsr ??= await renderSsr(0);
  globalThis.gc();
  capture('ready-gc');
  const windowStart = performance.now();
  sampler = setInterval(() => capture('sample'), 1000);
  for (let revision = 1; revision <= edits; revision++) {
    await page.locator('[data-count]').click();
    const counter = await page.locator('[data-count]').textContent();
    await armBrowserUpdate('template', revision);
    const templateAt = performance.now();
    await fs.writeFile(join(root, 'src/view.html'), template(revision));
    if (values['event-latency'])
      await page.evaluate(() => globalThis.__analogUpdate);
    else
      await page.waitForFunction(
        (n) =>
          document.querySelector('[data-message]')?.textContent ===
          `REVISION_${n}`,
        revision,
        { timeout: 15000 },
      );
    const templateMs = performance.now() - templateAt;
    assert.equal(
      await page.locator('[data-count]').textContent(),
      counter,
      'Template HMR preserves state',
    );
    const immediateSsr = values['race-ssr']
      ? new Promise((resolve, reject) => {
          const listener = (file) => {
            if (file !== join(root, 'src/view.css')) return;
            server.watcher.off('change', listener);
            queueMicrotask(() => renderSsr(revision).then(resolve, reject));
          };
          server.watcher.on('change', listener);
        })
      : undefined;
    // Observe rejection immediately while the browser update is still pending.
    immediateSsr?.catch((error) => errors.push(String(error)));
    await armBrowserUpdate('style', revision);
    const cssAt = performance.now();
    if (splitResourceWriteMs) {
      const stylesheet = await fs.open(join(root, 'src/view.css'), 'w');
      try {
        await new Promise((resolve) =>
          setTimeout(resolve, splitResourceWriteMs),
        );
        await stylesheet.writeFile(css(revision));
      } finally {
        await stylesheet.close();
      }
    } else {
      await fs.writeFile(join(root, 'src/view.css'), css(revision));
    }
    if (values['event-latency'])
      await page.evaluate(() => globalThis.__analogUpdate);
    else
      await page.waitForFunction(
        (n) => {
          const element = document.querySelector('[data-message]');
          return (
            element &&
            getComputedStyle(element)
              .getPropertyValue('--fixture-revision')
              .trim() === `${n}px`
          );
        },
        revision,
        { timeout: 15000 },
      );
    const stylesheetMs = performance.now() - cssAt;
    const immediateStyleStatePreserved =
      (await page.locator('[data-count]').textContent()) === counter;
    if (!immediateSsr && result.ssrIdleMs)
      await new Promise((resolve) => setTimeout(resolve, result.ssrIdleMs));
    const ssr = await (immediateSsr ?? renderSsr(revision));
    // A linked stylesheet can update before an already queued page reload.
    const styleStatePreserved =
      immediateStyleStatePreserved &&
      (await page.locator('[data-count]').textContent()) === counter;
    if (values['expect-style-state'])
      assert.equal(
        styleStatePreserved,
        true,
        'Component CSS HMR preserves state',
      );
    let sourceSsr;
    if (values['race-source']) {
      sourceRevision = revision;
      const file = join(root, 'src/version.ts');
      const browserReload =
        values.mode === 'fast' ? page.waitForEvent('load') : undefined;
      const fresh = new Promise((resolve, reject) => {
        const listener = (changed) => {
          if (changed !== file) return;
          server.watcher.off('change', listener);
          queueMicrotask(() => renderSsr(revision).then(resolve, reject));
        };
        server.watcher.on('change', listener);
      });
      fresh.catch((error) => errors.push(String(error)));
      await fs.writeFile(file, `export const sourceRevision = ${revision};`);
      sourceSsr = await fresh;
      // A behavioral source edit now reloads fast mode automatically. Observe
      // the completed browser boot before checking its rendered children.
      if (browserReload) {
        await browserReload;
        await page.waitForFunction(
          (count) => document.querySelectorAll('[data-child]').length === count,
          count - 1,
        );
      }
    }
    assert.equal(await page.locator('[data-child]').count(), count - 1);
    assert.deepEqual(errors, []);
    records.push({
      revision,
      templateMs,
      stylesheetMs,
      styleStatePreserved,
      ssr,
      ...(sourceSsr ? { sourceSsr } : {}),
    });
    if (restartEvery && revision % restartEvery === 0) {
      const restartAt = performance.now();
      await page.waitForLoadState('load');
      await Promise.all([page.waitForEvent('load'), server.restart()]);
      await page.waitForFunction(
        (n) =>
          document.querySelector('[data-message]')?.textContent ===
          `REVISION_${n}`,
        revision,
      );
      assert.equal(await page.locator('[data-child]').count(), count - 1);
      await renderSsr(revision);
      globalThis.gc();
      capture('restart-gc');
      restarts.push({ revision, ms: performance.now() - restartAt });
    } else if (revision % 10 === 0) {
      globalThis.gc();
      capture('checkpoint-gc');
    }
    await persist();
    const next = windowStart + (duration * revision) / edits;
    if (next > performance.now())
      await new Promise((done) => setTimeout(done, next - performance.now()));
  }
  result.actualWindowMs = performance.now() - windowStart;
  completed = true;
} catch (error) {
  result.failure = {
    message: error.message,
    stack: error.stack,
    html: await page.content(),
    sockets,
    styles: await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((links) => links.map((link) => link.href)),
    cssModules: [
      ...server.environments.client.moduleGraph.idToModuleMap.values(),
    ]
      .filter((module) => module.id?.includes('view.css'))
      .map((module) => ({
        id: module.id,
        url: module.url,
        type: module.type,
        lastInvalidationTimestamp: module.lastInvalidationTimestamp,
      })),
  };
  process.exitCode = 1;
} finally {
  if (sampler) clearInterval(sampler);
  await page.close();
  await browser.close();
  globalThis.gc();
  capture('before-close-gc');
  await persist();
  let settled = 0;
  const compiler = server.environments.client.plugins.find(
    (plugin) => plugin.api?.invalidate,
  );
  const callers = values['close-queued']
    ? Array.from({ length: 100 }, () =>
        compiler.api.invalidate([join(root, 'src/app.ts')]).then(() => {
          settled++;
        }),
      )
    : [];
  result.queuedAtClose = callers.length - settled;
  const closeAt = performance.now();
  await server.close();
  result.shutdownMs = performance.now() - closeAt;
  await Promise.all(callers);
  result.drainedCallers = settled;
  globalThis.gc();
  capture('after-close-gc');
  result.kernelPeakRssBytes = process.resourceUsage().maxRSS * 1024;
  result.passed = completed;
  await persist();
}
result.cpu = process.cpuUsage(initialCpu);
await persist();
console.log(
  JSON.stringify({
    passed: result.passed,
    label: result.label,
    mode: result.mode,
    components: count,
    edits: records.length,
    restarts: restarts.length,
    shutdownMs: result.shutdownMs,
    failure: result.failure?.message,
  }),
);
