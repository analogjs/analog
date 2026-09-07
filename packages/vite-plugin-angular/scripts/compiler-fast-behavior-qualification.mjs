// Copy into a packed consumer with Playwright, then run without manual reloads.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import angular from '@analogjs/vite-plugin-angular';

const root = await fs.mkdtemp(join(process.cwd(), 'fast-behavior-'));
const files = {
  'index.html':
    '<app-root></app-root><script type="module" src="/main.ts"></script>',
  'main.ts':
    "import 'zone.js'; import {bootstrapApplication} from '@angular/platform-browser'; import {App} from './app'; bootstrapApplication(App);",
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
    },
    files: ['main.ts'],
  }),
  'dependency.ts': "export const dependency = 'dependency-1';",
  'directive.ts':
    "import {Directive} from '@angular/core'; @Directive({selector:'[marker]', standalone:true, host:{'[attr.data-marker]':'value'}}) export class Marker { value = 'directive-1'; }",
  'pipe.ts':
    "import {Pipe} from '@angular/core'; @Pipe({name:'mark', standalone:true}) export class Mark { transform() { return 'pipe-1'; } }",
  'app.ts': `import {Component} from '@angular/core'; import {dependency} from './dependency'; import {Marker} from './directive'; import {Mark} from './pipe';
@Component({selector:'app-root', standalone:true, imports:[Marker,Mark], template:'<p data-result>{{method()}} {{field}} {{constructed}} {{dependency}} {{"" | mark}}</p><i marker></i>'})
export class App { field = 'field-1'; constructed = ''; dependency = dependency; constructor() {this.constructed = 'constructor-1';} method() { return 'method-1'; } }`,
};
for (const [file, code] of Object.entries(files))
  await fs.writeFile(join(root, file), code);
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  plugins: angular({
    workspaceRoot: root,
    tsconfig: join(root, 'tsconfig.json'),
    jit: false,
    fastCompile: true,
  }),
  server: { host: '127.0.0.1', port: 0 },
});
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [],
  events = [],
  records = [];
page.on('pageerror', (error) => errors.push(error.message));
const send = server.ws.send.bind(server.ws);
server.ws.send = (...args) => {
  events.push(args);
  return send(...args);
};
const result = { records, errors, passed: false };
try {
  await server.listen();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.locator('[data-result]').waitFor();
  for (const [kind, file] of [
    ['method', 'app.ts'],
    ['field', 'app.ts'],
    ['constructor', 'app.ts'],
    ['dependency', 'dependency.ts'],
    ['directive', 'directive.ts'],
    ['pipe', 'pipe.ts'],
  ]) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    events.length = 0;
    files[file] = files[file].replace(`${kind}-1`, `${kind}-2`);
    await fs.writeFile(join(root, file), files[file]);
    await page.waitForFunction(
      (kind) =>
        kind === 'directive'
          ? document
              .querySelector('[data-marker]')
              ?.getAttribute('data-marker') === 'directive-2'
          : document
              .querySelector('[data-result]')
              ?.textContent.includes(`${kind}-2`),
      kind,
    );
    assert.ok(
      events.some(([event]) => event.type === 'full-reload'),
      `${kind} triggers automatic reload`,
    );
    records.push({ kind, updated: true, automaticReload: true });
  }
  assert.deepEqual(errors, []);
  result.passed = true;
} finally {
  await page.close();
  await browser.close();
  await server.close();
  await fs.writeFile(
    resolve(process.argv[2] ?? 'fast-behavior-result.json'),
    JSON.stringify(result, null, 2),
  );
}
