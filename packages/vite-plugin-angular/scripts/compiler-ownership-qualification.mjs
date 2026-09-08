// Copy into a packed Angular 22 consumer, then run with Node 24.15.0 --expose-gc.
// --mode=ngtsc|fast|api --output=result.json [--edits=3] [--label=candidate]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { createServer, version as vite } from 'vite';
import { chromium } from 'playwright';
import angular from '@analogjs/vite-plugin-angular';

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'ngtsc' },
    output: { type: 'string' },
    edits: { type: 'string', default: '3' },
    label: { type: 'string', default: 'candidate' },
  },
});
assert.ok(values.output);
assert.ok(['ngtsc', 'fast', 'api'].includes(values.mode));
assert.equal(process.version, 'v24.15.0');
assert.equal(typeof globalThis.gc, 'function');
const require = createRequire(import.meta.url);
const root = await fs.mkdtemp(join(process.cwd(), 'ownership-'));
const output = resolve(values.output);
const records = [],
  errors = [],
  sockets = [];
const result = {
  label: values.label,
  mode: values.mode,
  node: process.version,
  angular: require('@angular/core/package.json').version,
  vite,
  records,
  errors,
  passed: false,
};
await fs.mkdir(join(root, 'src'));
const write = (file, text) => fs.writeFile(join(root, file), text);
const template = (revision) =>
  `<p data-message>REV_${revision}</p><button data-count (click)="increment()">{{count()}}</button><input [value]="value()"><span data-instance>{{instance}}</span>`;
await write('src/shared.html', template(0));
await write('src/shared.css', '[data-message] { width: 31px; }');
for (const name of ['A', 'B', 'Lazy']) {
  await write(
    `src/${name}.ts`,
    `import {Component, signal} from '@angular/core';
@Component({selector:'child-${name.toLowerCase()}',standalone:true,templateUrl:'./shared.html',styleUrl:'./shared.css'})
export class ${name} { count=signal(0); value=signal('initial'); instance=Math.random(); increment(){this.count.update(n=>n+1); this.value.set('retained');} }`,
  );
}
await write(
  'src/app.ts',
  `import {Component, signal, Type} from '@angular/core'; import {NgComponentOutlet} from '@angular/common'; import {A} from './A'; import {B} from './B';
@Component({selector:'app-root',standalone:true,imports:[A,B,NgComponentOutlet],template:'<child-a/><child-b/><button data-lazy (click)="load()">Load</button><ng-container [ngComponentOutlet]="lazy()"/>'})
export class App {lazy=signal<Type<unknown>|null>(null);async load(){this.lazy.set((await import('./Lazy')).Lazy);}}`,
);
await write(
  'src/main.ts',
  "import 'zone.js'; import {bootstrapApplication} from '@angular/platform-browser'; import {provideZoneChangeDetection} from '@angular/core'; import {App} from './app'; bootstrapApplication(App,{providers:[provideZoneChangeDetection()]});",
);
await write(
  'index.html',
  '<html><head></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
);
await write('src/untouched.ts', 'export const token = {};');
await write(
  'src/ssr.ts',
  `import 'zone.js/node'; import '@angular/compiler'; import {bootstrapApplication} from '@angular/platform-browser'; import {provideZoneChangeDetection} from '@angular/core'; import {renderApplication,provideServerRendering} from '@angular/platform-server';
export function render(Component,selector){return renderApplication(context=>bootstrapApplication(Component,{providers:[provideZoneChangeDetection(),provideServerRendering()]},context),{document:'<html><head></head><body><'+selector+'></'+selector+'></body></html>',url:'http://localhost/',allowedHosts:['localhost']});}`,
);
await write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      types: [],
    },
    files: ['src/main.ts', 'src/ssr.ts', 'src/untouched.ts'],
  }),
);
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  cacheDir: join(root, '.vite'),
  plugins: angular({
    workspaceRoot: root,
    tsconfig: join(root, 'tsconfig.json'),
    jit: false,
    liveReload: true,
    fastCompile: values.mode === 'fast',
    experimental: { useAngularCompilationAPI: values.mode === 'api' },
  }),
  server: { host: '127.0.0.1', port: 0 },
});
const browser = await chromium.launch();
const page = await browser.newPage();
let navigations = 0;
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) navigations++;
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('websocket', (socket) =>
  socket.on('framereceived', (frame) => sockets.push(String(frame.payload))),
);
const ids = ['/src/A.ts', '/src/A.ts?one', '/src/A.ts?two', '/src/B.ts'];
async function renderOwners(revision, width, selected = ids) {
  const started = performance.now();
  const modules = await Promise.all(
    selected.map((id) => server.ssrLoadModule(id)),
  );
  const renderer = await server.ssrLoadModule('/src/ssr.ts');
  const fresh = [];
  // Native module reads are concurrent; render serially because Zone owns global rendering state.
  for (let index = 0; index < modules.length; index++) {
    const name = selected[index].includes('Lazy')
      ? 'Lazy'
      : selected[index].includes('/B.')
        ? 'B'
        : 'A';
    const html = await renderer.render(
      modules[index][name],
      `child-${name.toLowerCase()}`,
    );
    fresh.push(
      html.includes(`REV_${revision}`) &&
        new RegExp(`width: ?${width}px`).test(html),
    );
  }
  return { ms: performance.now() - started, fresh };
}
async function edit(file, content, revision, width) {
  const graph = server.environments.ssr.moduleGraph;
  const untouched = await server.ssrLoadModule('/src/untouched.ts');
  const node = graph.getModuleById(join(root, 'src/untouched.ts'));
  const cached = node.transformResult;
  const previousLoads = navigations;
  const reloadMessages = () =>
    sockets.filter((s) => JSON.parse(s).type === 'full-reload').length;
  const previousMessages = reloadMessages();
  let retainedAtWatcher;
  const immediate = new Promise((resolveRead, rejectRead) => {
    const listener = (changed) => {
      if (changed !== join(root, file)) return;
      server.watcher.off('change', listener);
      queueMicrotask(() => {
        retainedAtWatcher = node.transformResult === cached;
        renderOwners(revision, width).then(resolveRead, rejectRead);
      });
    };
    server.watcher.on('change', listener);
  });
  immediate.catch((e) => errors.push(e.message));
  const instance = await page.locator('child-a [data-instance]').textContent();
  const input = await page.locator('child-a input').inputValue();
  const count = await page.locator('child-a [data-count]').textContent();
  await page.evaluate(() => {
    window.previousInput = document.querySelector('child-a input');
  });
  const started = performance.now();
  await write(file, content);
  await page.waitForFunction(
    ({ revision, width }) =>
      [
        ...document.querySelectorAll(
          'child-a [data-message], child-b [data-message]',
        ),
      ].every(
        (e) =>
          e.textContent === `REV_${revision}` &&
          getComputedStyle(e).width === `${width}px`,
      ),
    { revision, width },
    { timeout: 15000 },
  );
  const browserMs = performance.now() - started;
  const ssr = await immediate;
  const tokenRetained =
    (await server.ssrLoadModule('/src/untouched.ts')).token === untouched.token;
  const record = {
    file,
    revision,
    width,
    browserMs,
    ssr,
    retainedAtWatcher,
    tokenRetained,
    reloads: navigations - previousLoads,
    reloadMessages: reloadMessages() - previousMessages,
    instanceRetained:
      instance ===
      (await page.locator('child-a [data-instance]').textContent()),
    signalRetained:
      count === (await page.locator('child-a [data-count]').textContent()),
    formValueRetained:
      input === (await page.locator('child-a input').inputValue()),
    viewRecreated: await page.evaluate(
      () => window.previousInput !== document.querySelector('child-a input'),
    ),
  };
  records.push(record);
  // Record every failure before asserting, so controls remain useful evidence.
  return record;
}
try {
  await server.listen();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.locator('child-a [data-count]').click();
  await page.waitForFunction(
    () => document.querySelector('child-a [data-count]')?.textContent === '1',
  );
  result.initialSsr = await renderOwners(0, 31);
  assert.ok(result.initialSsr.fresh.every(Boolean));
  assert.equal(
    server.environments.ssr.moduleGraph.getModulesByFile(
      join(root, 'src/Lazy.ts'),
    ),
    undefined,
  );
  globalThis.gc();
  result.readyMemory = process.memoryUsage();
  let width = 31;
  for (let revision = 1; revision <= Number(values.edits); revision++) {
    await edit('src/shared.html', template(revision), revision, width);
    width = 31 + revision;
    await edit(
      'src/shared.css',
      `[data-message] { width: ${width}px; }`,
      revision,
      width,
    );
  }
  const revision = Number(values.edits);
  result.lazySsr = await renderOwners(revision, width, ['/src/Lazy.ts']);
  await page.locator('[data-lazy]').click();
  await page.locator('child-lazy [data-message]').waitFor();
  result.lazyBrowser =
    (await page.locator('child-lazy [data-message]').textContent()) ===
    `REV_${revision}`;
  assert.ok(result.lazySsr.fresh.every(Boolean));
  assert.ok(result.lazyBrowser);
  result.passed =
    records.every(
      (r) =>
        r.ssr.fresh.every(Boolean) &&
        r.retainedAtWatcher &&
        r.tokenRetained &&
        r.instanceRetained &&
        r.signalRetained &&
        r.formValueRetained &&
        r.reloads === 0,
    ) && errors.length === 0;
} catch (error) {
  result.failure = { message: error.message, stack: error.stack };
} finally {
  const started = performance.now();
  await server.close();
  result.closeMs = performance.now() - started;
  await browser.close();
  globalThis.gc();
  result.closedMemory = process.memoryUsage();
  result.sockets = sockets;
  await fs.writeFile(output, JSON.stringify(result, null, 2));
}
console.log(
  JSON.stringify({
    passed: result.passed,
    mode: values.mode,
    output,
    records: records.length,
    failure: result.failure,
  }),
);
if (!result.passed) process.exitCode = 1;
