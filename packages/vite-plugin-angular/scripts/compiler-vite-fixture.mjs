import assert from 'node:assert/strict';
import { mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import {
  build,
  createBuilder,
  createServer,
  version as viteVersion,
} from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const require = createRequire(import.meta.url);
const angularVersion = require('@angular/core/package.json').version;
const [major] = angularVersion.split('.').map(Number);
const root = process.cwd();
const results = [];
async function availablePort() {
  const reservation = createNetServer();
  await new Promise((resolve, reject) =>
    reservation.once('error', reject).listen(0, '127.0.0.1', resolve),
  );
  const address = reservation.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
const effectModuleIds = (ids) =>
  [...ids].filter((id) =>
    /(?:node_modules\/.*\beffect(?:@|\/)|^effect(?:\/|$))/.test(id),
  );
function effectGraphGuard(name) {
  return {
    name: 'assert-effect-free-application-graph',
    generateBundle() {
      const modules = [...this.getModuleIds()];
      assert.deepEqual(
        effectModuleIds(modules),
        [],
        `${name}: application graph excludes Effect`,
      );
      results.push({
        name: `${name}-application-graph`,
        passed: true,
        moduleCount: modules.length,
        environment: this.environment?.name,
        effectModules: [],
      });
    },
  };
}
await writeFile(
  join(root, 'public-contract.ts'),
  `
import angular, { type PluginOptions, type AnalogIntegrationPlugin, type ComponentRegistryEntry } from '@analogjs/vite-plugin-angular';
const options = { jit: false, fastCompileMode: 'partial', experimental: { useAngularCompilationAPI: false } } satisfies PluginOptions;
const plugins = angular(options);
const entry: ComponentRegistryEntry = { selector: 'demo', kind: 'component', fileName: 'demo.ts', className: 'Demo' };
const integration: AnalogIntegrationPlugin = { name: 'fixture', analog: { setup(context) { context.registerComponentRegistry(new Map([['Demo', entry]])); } } };
void [plugins, integration];
`,
);
await writeFile(
  join(root, 'tsconfig.types.json'),
  JSON.stringify({
    files: ['public-contract.ts'],
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'es2022',
      lib: ['es2022', 'dom'],
      types: ['node'],
    },
  }),
);
execFileSync(
  process.execPath,
  [
    require.resolve('typescript/lib/tsc.js'),
    '--project',
    'tsconfig.types.json',
  ],
  { stdio: 'inherit' },
);
results.push({
  name: 'public-declarations',
  passed: true,
  skipLibCheck: false,
});
await mkdir(join(root, 'src'));
await writeFile(
  join(root, 'src/configured.ts'),
  'export const configured = true;',
);
await writeFile(join(root, 'src/original.ts'), 'export const original = true;');
await writeFile(
  join(root, 'src/component.ts'),
  `
  import { Component } from '@angular/core';
  @Component({selector: 'app-example', standalone: true, template: '<p>compiler compatibility</p>'})
  export class ExampleComponent {}
  export const sourceMapAnchor = 'ANALOG_SOURCE_MAP_ANCHOR';
`,
);
await writeFile(
  join(root, 'tsconfig.json'),
  JSON.stringify({
    files: ['src/configured.ts'],
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

async function buildCase(name, options, expected) {
  const outDir = join(root, 'output', name);
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      effectGraphGuard(name),
      angular({
        workspaceRoot: root,
        tsconfig: join(root, 'tsconfig.json'),
        jit: false,
        liveReload: false,
        ...options,
      }),
    ],
    build: {
      outDir,
      minify: false,
      sourcemap: true,
      lib: {
        entry: join(root, 'src/original.ts'),
        formats: ['es'],
        fileName: 'component',
      },
      rollupOptions: { external: ['@angular/core'] },
    },
  });
  const output = (await readdir(outDir)).find(
    (name) => name.endsWith('.js') || name.endsWith('.mjs'),
  );
  assert.ok(output, `${name}: JavaScript emitted`);
  const code = await readFile(join(outDir, output), 'utf8');
  assert.ok(
    code.includes(expected),
    `${name}: expected ${expected} in compiler output`,
  );
  assert.ok(
    code.includes('compiler compatibility'),
    `${name}: template retained`,
  );
  if (expected === 'defineComponent')
    assert.ok(
      !code.includes('__decorate'),
      `${name}: AOT compilation did not fall through`,
    );
  const anchor = code.indexOf('ANALOG_SOURCE_MAP_ANCHOR');
  assert.ok(anchor >= 0, `${name}: source-map anchor retained`);
  const prefix = code.slice(0, anchor).split('\n');
  const map = JSON.parse(await readFile(join(outDir, `${output}.map`), 'utf8'));
  const position = originalPositionFor(new TraceMap(map), {
    line: prefix.length,
    column: prefix.at(-1).length,
  });
  const originalSource =
    name === 'normal-replacement' ? 'component.ts' : 'original.ts';
  const original = await readFile(join(root, 'src', originalSource), 'utf8');
  assert.ok(
    position.source?.endsWith(originalSource),
    `${name}: source map points to authored TypeScript`,
  );
  assert.equal(
    position.line,
    original
      .split('\n')
      .findIndex((line) => line.includes('ANALOG_SOURCE_MAP_ANCHOR')) + 1,
    `${name}: source-map line`,
  );
  results.push({ name, passed: true });
}

await buildCase(
  'normal-replacement',
  {
    fileReplacements: [
      { replace: 'src/original.ts', with: 'src/component.ts' },
    ],
    experimental: { useAngularCompilationAPI: false },
  },
  'defineComponent',
);

// Integration includes exercise files that are outside the original tsconfig.
await writeFile(
  join(root, 'src/original.ts'),
  await readFile(join(root, 'src/component.ts'), 'utf8'),
);
await buildCase(
  'normal-include',
  {
    include: [join(root, 'src/original.ts')],
    experimental: { useAngularCompilationAPI: false },
  },
  'defineComponent',
);
await buildCase(
  'fast-full',
  { fastCompile: true, fastCompileMode: 'full' },
  'defineComponent',
);
await buildCase(
  'fast-partial',
  { fastCompile: true, fastCompileMode: 'partial' },
  'ngDeclareComponent',
);

const compilationApiAvailable =
  major >= 18 &&
  typeof require('@angular/build/private').createAngularCompilation ===
    'function';
if (compilationApiAvailable) {
  await buildCase(
    'compilation-api-include',
    {
      include: [join(root, 'src/original.ts')],
      experimental: { useAngularCompilationAPI: true },
    },
    'defineComponent',
  );
} else {
  await assert.rejects(
    () =>
      buildCase(
        'compilation-api-unavailable',
        { experimental: { useAngularCompilationAPI: true } },
        'defineComponent',
      ),
    /requires @angular\/build\/private to export createAngularCompilation/,
  );
  results.push({
    name: 'compilation-api-include',
    supported: false,
    unavailableOptionRejected: true,
    reason: 'Installed @angular/build does not expose createAngularCompilation',
  });
}

async function concurrentEnvironmentCase(mode) {
  const name = `concurrent-${mode}`;
  await writeFile(
    join(root, 'src/marker.ts'),
    'export const marker = "browser-marker";',
  );
  await writeFile(
    join(root, 'src/marker.server.ts'),
    'export const marker = "server-marker";',
  );
  await writeFile(
    join(root, 'src/concurrent.ts'),
    'export { ExampleComponent } from "./component"; export { marker } from "./marker";',
  );
  const clientFinished = Promise.withResolvers();
  const output = (environment) =>
    join(root, 'output', `${name}-${environment}`);
  const options = {
    minify: false,
    lib: {
      entry: join(root, 'src/concurrent.ts'),
      formats: ['es'],
      fileName: 'result',
    },
    rollupOptions: { external: ['@angular/core'] },
  };
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    builder: { sharedPlugins: true },
    environments: {
      client: {
        consumer: 'client',
        build: { ...options, outDir: output('client') },
      },
      ssr: {
        consumer: 'server',
        build: { ...options, ssr: true, outDir: output('ssr') },
      },
    },
    plugins: [
      effectGraphGuard(name),
      {
        name: 'hold-server-transform-until-client-closes',
        enforce: 'pre',
        async transform(_code, id) {
          if (this.environment.name === 'ssr' && id.endsWith('/concurrent.ts'))
            await clientFinished.promise;
        },
      },
      angular({
        workspaceRoot: root,
        tsconfig: join(root, 'tsconfig.json'),
        jit: false,
        liveReload: false,
        fastCompile: mode === 'fast',
        include: ['src/*.ts'],
        fileReplacements: [
          { replace: 'src/marker.ts', ssr: 'src/marker.server.ts' },
        ],
        experimental: { useAngularCompilationAPI: mode === 'api' },
      }),
    ],
  });
  const settled = await Promise.allSettled([
    builder
      .build(builder.environments.client)
      .finally(() => clientFinished.resolve()),
    builder.build(builder.environments.ssr),
  ]);
  const failures = settled.filter((result) => result.status === 'rejected');
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      `${name}: both environments must complete`,
    );
  for (const [environment, marker] of [
    ['client', 'browser-marker'],
    ['ssr', 'server-marker'],
  ]) {
    const file = (await readdir(output(environment))).find((file) =>
      /\.[cm]?js$/.test(file),
    );
    assert.ok(file, `${name}/${environment}: JavaScript output`);
    const code = await readFile(join(output(environment), file), 'utf8');
    assert.ok(
      code.includes(marker),
      `${name}/${environment}: environment-specific replacement`,
    );
    assert.ok(
      code.includes('defineComponent'),
      `${name}/${environment}: Angular compilation`,
    );
  }
  results.push({ name, passed: true, serverTransformAfterClientClose: true });
}

async function browserHmrCase(browser, mode, liveReload) {
  const statefulHmr = liveReload && angularVersion !== '19.0.0';
  const compilationApi = mode.startsWith('api');
  const fast = mode.startsWith('fast');
  const jit = mode.endsWith('jit');
  const name = `browser-${mode}-live-reload-${liveReload}`;
  await writeFile(
    join(root, 'src/browser.ts'),
    `${jit ? "import '@angular/compiler';" : ''} import 'zone.js'; import { provideZoneChangeDetection } from '@angular/core'; import { bootstrapApplication } from '@angular/platform-browser'; import { AppComponent } from './app.component'; bootstrapApplication(AppComponent, { providers: [provideZoneChangeDetection()] });`,
  );
  await writeFile(
    join(root, 'src/view.html'),
    '<p data-testid="message">before</p><button data-testid="count" (click)="count=count+1">{{count}}</button><child-a/><child-b/>',
  );
  await writeFile(
    join(root, 'src/view.css'),
    '[data-testid="message"] { width: 31px; }',
  );
  await writeFile(
    join(root, 'src/shared.html'),
    '<p data-shared>{{label}} before</p>',
  );
  await writeFile(
    join(root, 'src/shared.css'),
    '[data-shared] { width: 41px; }',
  );
  process.env.NODE_ENV = 'development';
  const compiledModules = [];
  const plugins = angular({
    workspaceRoot: root,
    tsconfig: join(root, 'tsconfig.browser.json'),
    jit,
    liveReload,
    fastCompile: fast,
    experimental: { useAngularCompilationAPI: compilationApi },
  });
  const compiler = plugins.find(
    (plugin) =>
      plugin.name ===
      (compilationApi
        ? '@analogjs/vite-plugin-angular-compilation-api'
        : fast
          ? '@analogjs/vite-plugin-angular-fast-compile'
          : '@analogjs/vite-plugin-angular'),
  );
  const transform = compiler.transform;
  const transformHandler =
    typeof transform === 'function' ? transform : transform.handler;
  compiler.transform = {
    ...(typeof transform === 'object' ? transform : {}),
    async handler(...args) {
      const result = await transformHandler.apply(this, args);
      if (String(args[1]).includes('app.component.ts'))
        compiledModules.push({ id: args[1], result });
      return result;
    },
  };
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins,
    server: {
      host: '127.0.0.1',
      port: await availablePort(),
      strictPort: true,
    },
  });
  const page = await browser.newPage();
  const errors = [];
  const consoleMessages = [];
  const socketMessages = [];
  const fileEvents = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) =>
      socketMessages.push(String(frame.payload)),
    ),
  );
  server.watcher.on('all', (event, path) => fileEvents.push({ event, path }));
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="message"]')?.textContent ===
        'before',
    );
    await page.locator('[data-testid="count"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="count"]')?.textContent === '1',
    );
    const effectModules = effectModuleIds(
      server.environments.client.moduleGraph.idToModuleMap.keys(),
    );
    assert.deepEqual(
      effectModules,
      [],
      `${name}: Effect stays outside the browser module graph`,
    );
    await server.transformRequest('/src/app.component.ts', { ssr: true });
    const ssrModules = [
      ...server.environments.ssr.moduleGraph.idToModuleMap.keys(),
    ];
    assert.ok(
      ssrModules.length > 0,
      `${name}: SSR transform creates an application graph`,
    );
    assert.deepEqual(
      effectModuleIds(ssrModules),
      [],
      `${name}: SSR application graph excludes Effect`,
    );
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('[data-testid="message"]'))
          .width === '31px',
    );
    if (!liveReload) {
      await page.waitForLoadState('load');
      await Promise.all([page.waitForEvent('load'), server.restart()]);
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="message"]')?.textContent ===
          'before',
      );
      assert.equal(
        await page.locator('[data-testid="count"]').textContent(),
        '0',
      );
      assert.deepEqual(errors, []);
      results.push({
        name,
        passed: true,
        behavior: 'boot and restart with Angular HMR disabled',
      });
      return;
    }
    await writeFile(
      join(root, 'src/view.html'),
      '<p data-testid="message">after</p><button data-testid="count" (click)="count=count+1">{{count}}</button><child-a/><child-b/>',
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="message"]')?.textContent ===
        'after',
      null,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-testid="count"]').textContent(),
      statefulHmr ? '1' : '0',
      `${name}: expected HMR state preservation or full reload`,
    );
    assert.deepEqual(errors, [], `${name}: no browser runtime errors`);
    await writeFile(
      join(root, 'src/view.css'),
      '[data-testid="message"] { width: 37px; }',
    );
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('[data-testid="message"]'))
          .width === '37px',
      null,
      { timeout: 15000 },
    );
    assert.deepEqual(
      errors,
      [],
      `${name}: stylesheet update has no runtime errors`,
    );
    assert.equal(
      await page.locator('[data-testid="count"]').textContent(),
      statefulHmr ? '1' : '0',
      `${name}: CSS state or compatibility reload`,
    );
    // Older Vite watchers throttle repeated changes to one path for 50 ms.
    // Keep this correctness sequence outside that window; latency is measured separately.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(
      join(root, 'src/view.html'),
      '<p data-testid="message">after CSS</p><button data-testid="count" (click)="count=count+1">{{count}}</button><child-a/><child-b/>',
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="message"]')?.textContent ===
        'after CSS',
    );
    assert.equal(
      await page.locator('[data-testid="count"]').textContent(),
      statefulHmr ? '1' : '0',
    );
    assert.equal(
      await page
        .locator('[data-testid="message"]')
        .evaluate((element) => getComputedStyle(element).width),
      '37px',
      'Later template updates retain the latest stylesheet',
    );
    if (!jit) {
      await writeFile(
        join(root, 'src/shared.html'),
        '<p data-shared>{{label}} after</p>',
      );
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[data-shared]')]
            .map((element) => element.textContent)
            .join(',') === 'a after,b after',
      );
      // A watcher can observe the truncate before the editor finishes writing.
      // The compiler must consume Vite's stabilized HMR read, not emit an
      // empty stylesheet that changes Angular's encapsulation to None.
      const sharedStylesheet = await open(join(root, 'src/shared.css'), 'w');
      try {
        await new Promise((resolve) => setTimeout(resolve, 25));
        await sharedStylesheet.writeFile('[data-shared] { width: 47px; }');
      } finally {
        await sharedStylesheet.close();
      }
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[data-shared]')].length === 2 &&
          [...document.querySelectorAll('[data-shared]')].every(
            (element) =>
              getComputedStyle(element).width === '47px' &&
              element
                .getAttributeNames()
                .some((name) => name.startsWith('_ngcontent-')),
          ),
      );
      if (mode === 'default') {
        const sharedOwnerUpdates = socketMessages
          .flatMap((message) => {
            const payload = JSON.parse(message);
            return payload.type === 'update' ? (payload.updates ?? []) : [];
          })
          .filter(
            (update) =>
              update.type === 'js-update' &&
              ['/src/shared-a.ts', '/src/shared-b.ts'].includes(update.path),
          );
        assert.deepEqual(
          sharedOwnerUpdates,
          [],
          `${name}: resource metadata updates do not re-evaluate shared owners`,
        );
      }
    }
    results.push({
      name,
      passed: true,
      stylesheetUpdated: true,
      countAfterStylesheetUpdate: await page
        .locator('[data-testid="count"]')
        .textContent(),
    });
  } catch (error) {
    console.error(`${name}:`, error);
    await writeFile(
      join(root, `${name}-failure.json`),
      JSON.stringify(
        {
          name,
          failure: {
            name: error?.name,
            message: error?.message,
            stack: error?.stack,
          },
          errors,
          consoleMessages,
          socketMessages,
          fileEvents,
          compiledModules,
          html: await page.content(),
          component: (await server.transformRequest('/src/app.component.ts'))
            ?.code,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await page.close();
    await server.close();
    process.env.NODE_ENV = 'production';
  }
}

if (major >= 19) {
  if (major >= 21)
    for (const mode of [
      'default',
      'fast',
      ...(compilationApiAvailable ? ['api'] : []),
    ])
      await concurrentEnvironmentCase(mode);
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><body><app-root></app-root><script type="module" src="/src/browser.ts"></script></body></html>',
  );
  await writeFile(
    join(root, 'src/app.component.ts'),
    `import { Component } from '@angular/core'; import { SharedA } from './shared-a'; import { SharedB } from './shared-b'; @Component({ selector: 'app-root', standalone: true, imports: [SharedA, SharedB], templateUrl: './view.html', styleUrl: './view.css' }) export class AppComponent { count = 0; }`,
  );
  for (const letter of ['a', 'b'])
    await writeFile(
      join(root, `src/shared-${letter}.ts`),
      `import { Component } from '@angular/core'; @Component({selector: 'child-${letter}', standalone: true, templateUrl: './shared.html', styleUrl: './shared.css'}) export class Shared${letter.toUpperCase()} { label = '${letter}'; }`,
    );
  await writeFile(
    join(root, 'tsconfig.browser.json'),
    JSON.stringify({ extends: './tsconfig.json', files: ['src/browser.ts'] }),
  );
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    for (const mode of [
      'default',
      'fast',
      ...(compilationApiAvailable ? ['api'] : []),
    ]) {
      await browserHmrCase(browser, mode, true);
      await browserHmrCase(browser, mode, false);
    }
    for (const mode of [
      'default-jit',
      'fast-jit',
      ...(compilationApiAvailable ? ['api-jit'] : []),
    ])
      await browserHmrCase(browser, mode, false);
  } finally {
    await browser.close();
  }
}

const report = {
  angular: angularVersion,
  vite: viteVersion,
  node: process.version,
  typescript: require('typescript/package.json').version,
  results,
};
await writeFile(
  join(root, 'result.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
