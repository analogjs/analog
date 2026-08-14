import { Architect } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing/index.js';
import { logging, schema } from '@angular-devkit/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import applicationBuilder from '../packages/platform/src/lib/esbuild/application.impl';

const fixtureRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

const registry = new schema.CoreSchemaRegistry();
registry.addPostTransform(schema.transforms.addUndefinedDefaults);

const logger = new logging.Logger('build');
logger.subscribe((entry) => console.log(`[${entry.level}] ${entry.message}`));

const host = new TestingArchitectHost(fixtureRoot, fixtureRoot);
// The testing host has no workspace file; mirror what a real angular.json
// project would report so context.getProjectMetadata resolves.
host.getProjectMetadata = async () => ({ root: '' });
const architect = new Architect(host, registry);

host.addBuilder('@analogjs/platform:application', applicationBuilder);
host.addTarget(
  { project: 'fixture', target: 'build' },
  '@analogjs/platform:application',
);

const run = await architect.scheduleTarget(
  { project: 'fixture', target: 'build' },
  {
    browser: 'src/main.ts',
    index: 'src/index.html',
    tsConfig: 'tsconfig.app.json',
    outputPath: 'dist',
    optimization: false,
    sourceMap: false,
    progress: false,
    outputHashing: 'none',
  } as never,
  { logger: logger as never },
);

const result = await run.result;
await run.stop();

console.log('\n=== build success:', result.success);
if (!result.success) {
  console.log('error:', (result as { error?: string }).error);
  process.exit(1);
}

const outDir = join(fixtureRoot, 'dist/browser');
const files = readdirSync(outDir);
console.log('=== emitted files:\n' + files.join('\n'));

const lazyChunks = files.filter((f) => f.startsWith('chunk-'));
const all = files
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(outDir, f), 'utf8'));

const hasHome = all.some((c) => c.includes('Home'));
const hasProduct = all.some((c) => c.includes('Product '));
const hasRenderedMarkdown = all.some(
  (c) => c.includes('<h1') && c.includes('About'),
);
const hasFrontMatter = all.some((c) => c.includes('slug: about'));
const routeKeys = all.some((c) => c.includes('/src/app/pages/index.page.ts'));

console.log('=== assertions');
console.log('lazy chunks emitted:', lazyChunks.length);
console.log('home page compiled into output:', hasHome);
console.log('product page compiled into output:', hasProduct);
console.log('markdown rendered to HTML at build time:', hasRenderedMarkdown);
console.log('front matter preserved:', hasFrontMatter);
console.log('route file keys present:', routeKeys);

const ok =
  hasHome && hasProduct && hasRenderedMarkdown && hasFrontMatter && routeKeys;
console.log('=== ALL ASSERTIONS PASS:', ok);
process.exit(ok ? 0 : 1);
