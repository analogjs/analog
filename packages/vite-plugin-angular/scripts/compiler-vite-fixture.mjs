import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  build,
  createBuilder,
  createServer,
  version as viteVersion,
} from 'vite';
import angular from '@analogjs/vite-plugin-angular';

const require = createRequire(import.meta.url);
const angularVersion = require('@angular/core/package.json').version;
const [major] = angularVersion.split('.').map(Number);
const root = process.cwd();
const results = [];
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
  results.push({ name, passed: true });
}

async function environmentDefinesCase() {
  const entry = join(root, 'src/environment.ts');
  await writeFile(
    entry,
    'declare const ngServerMode: boolean; export const server = typeof ngServerMode !== "undefined" && ngServerMode;',
  );
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      angular({
        workspaceRoot: root,
        tsconfig: join(root, 'tsconfig.json'),
        include: [entry],
        jit: false,
        liveReload: false,
      }),
    ],
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
    environments: {
      client: { consumer: 'client' },
      ssr: { consumer: 'server', build: { ssr: true } },
    },
  });
  for (const [name, expected] of [
    ['client', false],
    ['ssr', true],
  ]) {
    const result = await builder.build(builder.environments[name]);
    const bundles = Array.isArray(result) ? result : [result];
    const chunk = bundles
      .flatMap((bundle) => bundle.output ?? [])
      .find((file) => file.type === 'chunk' && file.isEntry);
    assert.ok(chunk, `${name}: environment entry emitted`);
    const output = await import(
      `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
    );
    assert.equal(
      output.server,
      expected,
      `${name}: environment-specific Angular server mode`,
    );
  }
  results.push({ name: 'environment-server-mode', passed: true });
}

await environmentDefinesCase();

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

async function browserHmrCase(browser, compilationApi, liveReload) {
  const name = `browser-api-${compilationApi}-live-reload-${liveReload}`;
  await writeFile(
    join(root, 'src/view.html'),
    '<p data-testid="message">before</p><button data-testid="count" (click)="count=count+1">{{count}}</button>',
  );
  process.env.NODE_ENV = 'development';
  const compiledModules = [];
  const plugins = angular({
    workspaceRoot: root,
    tsconfig: join(root, 'tsconfig.browser.json'),
    jit: false,
    liveReload,
    experimental: { useAngularCompilationAPI: compilationApi },
  });
  const compiler = plugins.find(
    (plugin) =>
      plugin.name ===
      (compilationApi
        ? '@analogjs/vite-plugin-angular-compilation-api'
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
    server: { host: '127.0.0.1', port: 0, strictPort: true },
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
    if (!liveReload) {
      await page.reload();
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
        behavior: 'boot and manual reload with Angular HMR disabled',
      });
      return;
    }
    await writeFile(
      join(root, 'src/view.html'),
      '<p data-testid="message">after</p><button data-testid="count" (click)="count=count+1">{{count}}</button>',
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
      liveReload ? '1' : '0',
      `${name}: expected HMR state preservation or full reload`,
    );
    assert.deepEqual(errors, [], `${name}: no browser runtime errors`);
    results.push({ name, passed: true });
  } catch (error) {
    await writeFile(
      join(root, `${name}-failure.json`),
      JSON.stringify(
        {
          name,
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

if (major === 22) {
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><body><app-root></app-root><script type="module" src="/src/browser.ts"></script></body></html>',
  );
  await writeFile(
    join(root, 'src/app.component.ts'),
    `import { Component } from '@angular/core'; @Component({ selector: 'app-root', standalone: true, templateUrl: './view.html' }) export class AppComponent { count = 0; }`,
  );
  await writeFile(
    join(root, 'src/browser.ts'),
    `import 'zone.js'; import { provideZoneChangeDetection } from '@angular/core'; import { bootstrapApplication } from '@angular/platform-browser'; import { AppComponent } from './app.component'; bootstrapApplication(AppComponent, { providers: [provideZoneChangeDetection()] });`,
  );
  await writeFile(
    join(root, 'tsconfig.browser.json'),
    JSON.stringify({ extends: './tsconfig.json', files: ['src/browser.ts'] }),
  );
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    await browserHmrCase(browser, false, true);
    await browserHmrCase(browser, true, true);
    await browserHmrCase(browser, false, false);
    await browserHmrCase(browser, true, false);
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
