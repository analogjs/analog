// Run in a packed Angular 22 consumer with Vite, Sass and Playwright installed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import angular from '@analogjs/vite-plugin-angular';

const root = process.cwd();
await mkdir(join(root, 'style-fixture'), { recursive: true });
const dir = join(root, 'style-fixture');
await writeFile(
  join(dir, 'index.html'),
  '<app-root></app-root><script type="module" src="/main.ts"></script>',
);
await writeFile(
  join(dir, 'main.ts'),
  "import 'zone.js'; import { bootstrapApplication } from '@angular/platform-browser'; import { App } from './app'; bootstrapApplication(App);",
);
await writeFile(
  join(dir, 'tsconfig.json'),
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
await writeFile(join(dir, 'view.html'), '<p data-style>child</p>');
await writeFile(
  join(dir, 'view.scss'),
  "@use './tokens'; [data-style] { width: tokens.$width; }",
);
const browser = await chromium.launch();
const results = [];
try {
  for (const mode of ['ngtsc', 'fast', 'api']) {
    for (const encapsulation of ['Emulated', 'None', 'ShadowDom']) {
      await writeFile(join(dir, '_tokens.scss'), '$width: 31px;');
      for (const letter of ['A', 'B'])
        await writeFile(
          join(dir, `child-${letter}.ts`),
          `import {Component, ViewEncapsulation} from '@angular/core'; @Component({selector: 'child-${letter.toLowerCase()}', standalone: true, templateUrl: './view.html', styleUrl: './view.scss', encapsulation: ViewEncapsulation.${encapsulation}}) export class Child${letter} {}`,
        );
      await writeFile(
        join(dir, 'app.ts'),
        `import { Component } from '@angular/core'; import {ChildA} from './child-A'; import {ChildB} from './child-B';
@Component({selector: 'app-root', standalone: true, imports: [ChildA, ChildB], template: '<button (click)="count=count+1">{{count}}</button><child-a/><child-b/>'}) export class App { count = 0; }`,
      );
      const server = await createServer({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: angular({
          workspaceRoot: dir,
          tsconfig: join(dir, 'tsconfig.json'),
          jit: false,
          liveReload: true,
          fastCompile: mode === 'fast',
          experimental: {
            useAngularCompilationAPI: mode === 'api',
            // Keep this legacy state-retention check on the metadata path.
            // The native-style worker separately proves the ShadowDom reload.
            componentStyleHmr:
              encapsulation === 'ShadowDom' ? 'metadata' : 'auto',
          },
        }),
        server: { host: '127.0.0.1', port: 0 },
      });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await server.listen();
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
        const styles = page.locator('[data-style]');
        await styles.first().waitFor();
        await page.locator('button').click();
        await page.waitForFunction(
          () => document.querySelector('button')?.textContent === '1',
        );
        for (const width of [31, 37, 43]) {
          if (width !== 31) {
            // Repeated writes must exceed older watchers' 50 ms throttle.
            await new Promise((resolve) => setTimeout(resolve, 100));
            await writeFile(join(dir, '_tokens.scss'), `$width: ${width}px;`);
          }
          await page.waitForFunction(
            (expected) => {
              const elements = ['child-a', 'child-b'].map((selector) => {
                const host = document.querySelector(selector);
                return (host?.shadowRoot ?? host)?.querySelector(
                  '[data-style]',
                );
              });
              return elements.every(
                (element) =>
                  element &&
                  getComputedStyle(element).width === `${expected}px`,
              );
            },
            width,
            { timeout: 15000 },
          );
          assert.equal(await styles.count(), 2);
          assert.deepEqual(
            await page
              .locator('child-a, child-b')
              .evaluateAll((hosts) => hosts.map((host) => !!host.shadowRoot)),
            [encapsulation === 'ShadowDom', encapsulation === 'ShadowDom'],
          );
          assert.deepEqual(
            await styles.evaluateAll((elements) =>
              elements.map((element) =>
                element
                  .getAttributeNames()
                  .some((name) => name.startsWith('_ngcontent-')),
              ),
            ),
            [encapsulation === 'Emulated', encapsulation === 'Emulated'],
          );
          assert.equal(
            await page.locator('button').textContent(),
            '1',
            `${mode}/${encapsulation}/${width}: state retained`,
          );
        }
        assert.deepEqual(errors, []);
        console.log(mode, encapsulation, 'passed');
        results.push({
          mode,
          encapsulation,
          sharedOwners: 2,
          partialEdits: 2,
          statePreserved: true,
        });
      } finally {
        await page.close();
        await server.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  join(root, 'style-result.json'),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log(JSON.stringify(results));
