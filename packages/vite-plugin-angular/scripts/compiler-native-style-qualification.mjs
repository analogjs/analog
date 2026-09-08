// Copy into a packed consumer with Sass and Playwright; run with Node 24.15.0.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { createServer, version as viteVersion } from 'vite';
import { chromium } from 'playwright';
import angular from '@analogjs/vite-plugin-angular';

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'ngtsc' },
    encapsulation: { type: 'string', default: 'Emulated' },
    strategy: { type: 'string', default: 'auto' },
    externalize: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
});
const root = await fs.mkdtemp(join(process.cwd(), 'native-style-'));
const write = (file, text) => fs.writeFile(join(root, file), text);
const angularVersion = createRequire(import.meta.url)(
  '@angular/core/package.json',
).version;
const native =
  values.externalize &&
  (values.mode !== 'api' || Number(viteVersion.split('.')[0]) >= 7) &&
  Number(angularVersion.split('.')[0]) >= (values.mode === 'api' ? 21 : 20) &&
  values.mode !== 'fast' &&
  values.encapsulation !== 'ShadowDom' &&
  values.strategy === 'auto';
const records = [],
  events = [],
  errors = [];
await write(
  'index.html',
  '<app-root></app-root><script type="module" src="/main.ts"></script>',
);
await write(
  'main.ts',
  "import 'zone.js'; import { bootstrapApplication } from '@angular/platform-browser'; import { App } from './app'; bootstrapApplication(App);",
);
await write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
    },
    angularCompilerOptions: { strictTemplates: true },
    files: ['main.ts'],
  }),
);
await write(
  'view.scss',
  "@use './tokens'; [data-style] { width: tokens.$width; }",
);
await write('_tokens.scss', '$width: 31px;');
const template = (revision) =>
  `<p data-style>${revision}</p><input value="selection"><button data-child (click)="count=count+1">{{count}}</button><grand-child/>`;
await write('view.html', template(0));
await write(
  'grand.ts',
  "import {Component} from '@angular/core'; @Component({selector:'grand-child', standalone:true, template:'<button data-grand (click)=\"count=count+1\">{{count}}</button>'}) export class Grand { count = 0; }",
);
for (const name of ['A', 'B', 'C'])
  await write(
    `child-${name}.ts`,
    `import {Component, ViewEncapsulation} from '@angular/core'; import {Grand} from './grand'; @Component({selector:'child-${name.toLowerCase()}', standalone:true, imports:[Grand], templateUrl:'./view.html', styleUrl:'./view.scss', encapsulation: ViewEncapsulation.${values.encapsulation}}) export class Child${name} { count = 0; }`,
  );
await write(
  'app.ts',
  `import {Component} from '@angular/core'; import {ChildA} from './child-A'; import {ChildB} from './child-B'; import {ChildC} from './child-C'; @Component({selector:'app-root', standalone:true, imports:[ChildA,ChildB,ChildC], template:'<button data-parent (click)="count=count+1">{{count}}</button><button data-lazy (click)="lazy=!lazy">lazy</button><child-a/><child-b/>@if (lazy) {<child-c/>}'}) export class App { count = 0; lazy = false; }`,
);
const browser = await chromium.launch();
const server = await createServer({
  root,
  cacheDir: join(root, '.vite-cache'),
  configFile: false,
  logLevel: 'warn',
  plugins: [
    ...angular({
      workspaceRoot: root,
      tsconfig: join(root, 'tsconfig.json'),
      jit: false,
      fastCompile: values.mode === 'fast',
      experimental: {
        useAngularCompilationAPI: values.mode === 'api',
        componentStyleHmr: values.strategy,
      },
    }),
    ...(values.externalize
      ? [
          {
            name: 'qualify-component-externalization',
            analog: {
              setup(context) {
                context.externalizeComponentStyles();
              },
            },
          },
        ]
      : []),
  ],
  server: { host: '127.0.0.1', port: 0 },
});
const send = server.ws.send.bind(server.ws);
server.ws.send = (...args) => {
  events.push(args);
  return send(...args);
};
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const result = {
  ...values,
  angularVersion,
  viteVersion,
  native,
  records,
  events,
  errors,
  passed: false,
};
try {
  await server.listen();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.locator('[data-style]').first().waitFor();
  await page.locator('[data-parent]').click();
  const width = async (expected, owners = 2) => {
    await page.waitForFunction(
      ({ expected, owners }) =>
        ['child-a', 'child-b', 'child-c'].slice(0, owners).every((selector) => {
          const host = document.querySelector(selector);
          const element = (host?.shadowRoot ?? host)?.querySelector(
            '[data-style]',
          );
          return element && getComputedStyle(element).width === `${expected}px`;
        }),
      { expected, owners },
    );
  };
  await width(31);
  result.encapsulationProof = await page
    .locator('child-a')
    .evaluate((host) => ({
      shadowRoot: !!host.shadowRoot,
      scoped: [
        ...(host.shadowRoot ?? host).querySelector('[data-style]').attributes,
      ].some((attribute) => attribute.name.startsWith('_ngcontent-')),
    }));
  assert.equal(
    result.encapsulationProof.shadowRoot,
    values.encapsulation === 'ShadowDom',
  );
  assert.equal(
    result.encapsulationProof.scoped,
    values.encapsulation === 'Emulated',
  );
  for (const [index, expected] of [37, 43, 49].entries()) {
    if (index !== 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await write('view.html', template(index));
      await page.waitForFunction((revision) => {
        const host = document.querySelector('child-a');
        return (
          (host?.shadowRoot ?? host)?.querySelector('[data-style]')
            ?.textContent === String(revision)
        );
      }, index);
    }
    await page.locator('child-a [data-child]').click();
    await page.locator('child-a [data-grand]').click();
    await page.waitForFunction(() => {
      const host = document.querySelector('child-a');
      return (
        (host.shadowRoot ?? host).querySelector('[data-grand]').textContent ===
        '1'
      );
    });
    const before = await page.locator('child-a').evaluate((host) => {
      const root = host.shadowRoot ?? host;
      const input = root.querySelector('input');
      input.focus();
      input.setSelectionRange(1, 4);
      window.__styleProof = {
        host,
        input,
        paragraph: root.querySelector('[data-style]'),
        grand: root.querySelector('grand-child'),
        parent: document.querySelector('[data-parent]').textContent,
        count: root.querySelector('[data-child]').textContent,
        child: root.querySelector('[data-grand]').textContent,
      };
      return {
        count: window.__styleProof.count,
        child: window.__styleProof.child,
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (index === 1)
      await write(
        'view.scss',
        `@use './tokens'; [data-style] { width: ${expected}px; }`,
      );
    else {
      if (index > 1) {
        await write(
          'view.scss',
          "@use './tokens'; [data-style] { width: tokens.$width; }",
        );
        await width(37);
      }
      await write('_tokens.scss', `$width: ${expected}px;`);
    }
    await width(expected);
    const proof = await page.locator('child-a').evaluate((host) => {
      const root = host.shadowRoot ?? host,
        input = root.querySelector('input'),
        old = window.__styleProof;
      return {
        identity:
          !!old &&
          old.host === host &&
          old.input === input &&
          old.paragraph === root.querySelector('[data-style]') &&
          old.grand === root.querySelector('grand-child'),
        focus: (host.shadowRoot ?? document).activeElement === input,
        selection: [input.selectionStart, input.selectionEnd],
        parent: document.querySelector('[data-parent]').textContent,
        count: root.querySelector('[data-child]').textContent,
        child: root.querySelector('[data-grand]').textContent,
      };
    });
    records.push({ expected, before, ...proof });
    if (native) {
      assert.equal(proof.identity, true, 'native CSS preserves DOM nodes');
      assert.equal(proof.focus, true, 'native CSS preserves focus');
      assert.deepEqual(proof.selection, [1, 4]);
      assert.equal(proof.parent, '1');
      assert.equal(proof.count, before.count);
      assert.equal(proof.child, before.child);
    }
    await page.locator('[data-lazy]').click();
    await width(expected, 3);
    await page.locator('[data-lazy]').click();
    await page.locator('child-c').waitFor({ state: 'detached' });
    await width(expected);
  }
  assert.deepEqual(errors, []);
  result.passed = true;
} catch (error) {
  result.failure = {
    message: error.message,
    stack: error.stack,
    rendered: await page
      .locator('child-a, child-b, child-c')
      .evaluateAll((hosts) =>
        hosts.map((host) => ({
          tag: host.tagName,
          width: getComputedStyle(
            (host.shadowRoot ?? host).querySelector('[data-style]'),
          ).width,
          links: [
            ...(host.shadowRoot ?? document).querySelectorAll(
              'link[rel="stylesheet"]',
            ),
          ].map((link) => link.href),
        })),
      ),
    modules: [...server.environments.client.moduleGraph.idToModuleMap.values()]
      .filter((module) => module.id?.includes('.scss'))
      .map((module) => ({
        id: module.id,
        file: module.file,
        url: module.url,
        importers: [...module.importers].map((importer) => importer.id),
      })),
  };
  throw error;
} finally {
  await page.close();
  await browser.close();
  await server.close();
  await fs.writeFile(
    resolve(values.output ?? 'native-style-result.json'),
    JSON.stringify(result, null, 2),
  );
}
