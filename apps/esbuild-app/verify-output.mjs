/**
 * Asserts what the Analog esbuild plugins produce through the real
 * Angular application builder. Run with `nx verify esbuild-app`, which
 * builds first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = new URL('../../dist/apps/esbuild-app/', import.meta.url)
  .pathname;
const browserDir = join(outDir, 'browser');
const serverDir = join(outDir, 'server');

const read = (dir, file) => readFileSync(join(dir, file), 'utf8');
const jsFiles = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));

/** The whole import.meta.env object is replaced, so esbuild emits a shim. */
function envOf(dir) {
  for (const file of jsFiles(dir)) {
    const match = read(dir, file).match(
      /define_import_meta_env_default = (\{[^}]*\})/,
    );
    if (match) return match[1];
  }
  return undefined;
}

const browserJs = jsFiles(browserDir).map((f) => read(browserDir, f));
const indexHtml = read(browserDir, 'index.html');
const aboutHtml = read(join(browserDir, 'about'), 'index.html');

const checks = [
  [
    'route files discovered and code split per route',
    ['index-page', 'productId', 'about-md'].every((name) =>
      browserJs.some(
        (c) => c.includes(name) || c.includes(name.replace('-', '.')),
      ),
    ),
  ],
  [
    'pages compiled AOT by the Angular compiler',
    browserJs.some((c) => c.includes('ɵɵdefineComponent')),
  ],
  [
    'markdown rendered to HTML at build time with highlighting',
    browserJs.some(
      (c) => c.includes('<h1 id="about">') && c.includes('token keyword'),
    ),
  ],
  [
    'front matter preserved in content output',
    browserJs.some((c) => c.includes('title: About')),
  ],
  [
    'browser bundle env is SSR: false',
    envOf(browserDir)?.includes('SSR: false'),
  ],
  ['server bundle env is SSR: true', envOf(serverDir)?.includes('SSR: true')],
  ['ssr renders the page component', indexHtml.includes('<h1>Home</h1>')],
  [
    'ssr renders markdown content',
    aboutHtml.includes('<h1 id="about">About</h1>') &&
      aboutHtml.includes('class="token keyword"'),
  ],
  [
    'ssr applies the front matter title',
    aboutHtml.includes('<title>About</title>'),
  ],
  ['ssr transfers state for hydration', aboutHtml.includes('id="ng-state"')],
  [
    // The marked heading-id slugger is stateful; without a reset per
    // render the same file gets different ids in each bundle.
    'heading ids match between the browser bundle and the ssr output',
    browserJs.some((c) => c.includes('<h1 id="about">')) &&
      aboutHtml.includes('<h1 id="about">'),
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
