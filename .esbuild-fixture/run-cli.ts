/**
 * Full-fidelity check: resolves the builder by name from angular.json
 * through the same WorkspaceNodeModulesArchitectHost the Angular CLI
 * uses, against the built @analogjs/platform package. The fixture app
 * wires routes and content through the public DI bridges, so this also
 * covers withRouteFiles and provideContentFiles in a real bundle.
 */
import { Architect } from '@angular-devkit/architect';
import { WorkspaceNodeModulesArchitectHost } from '@angular-devkit/architect/node/index.js';
import { logging, schema, workspaces } from '@angular-devkit/core';
import { NodeJsSyncHost } from '@angular-devkit/core/node/index.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtureRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

const registry = new schema.CoreSchemaRegistry();
registry.addPostTransform(schema.transforms.addUndefinedDefaults);

const workspaceHost = workspaces.createWorkspaceHost(new NodeJsSyncHost());
const { workspace } = await workspaces.readWorkspace(
  fixtureRoot,
  workspaceHost,
);

const architectHost = new WorkspaceNodeModulesArchitectHost(
  workspace,
  fixtureRoot,
);
const architect = new Architect(architectHost, registry);

const builderName = await architectHost.getBuilderNameForTarget({
  project: 'fixture',
  target: 'build',
});
console.log('=== builder resolved by name:', builderName);
const info = await architectHost.resolveBuilder(builderName);
console.log('=== implementation:', info?.import?.replace(fixtureRoot, '.'));

const logger = new logging.Logger('cli');
logger.subscribe((e) => console.log(`[${e.level}] ${e.message}`));

const run = await architect.scheduleTarget(
  { project: 'fixture', target: 'build' },
  {},
  { logger: logger as never },
);
const result = await run.result;
await run.stop();

console.log('\n=== build success:', result.success);
if (!result.success) {
  console.log('error:', (result as { error?: string }).error);
  process.exit(1);
}

const outDir = join(fixtureRoot, 'dist-cli/browser');
const js = readdirSync(outDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(outDir, f), 'utf8'));

// provideFileRouter installs the meta-tag initializer and cookie
// interceptor, so its presence proves the router bridge is wired in.
const usesFileRouter = js.some((c) => c.includes('_analogContent'));
const usesContentFiles = js.some((c) => c.includes('slug: about'));
// Chunk filenames are hashed, so identify route chunks by content.
const lazyPages = readdirSync(outDir).filter((f) => {
  if (!f.endsWith('.js')) return false;
  const c = readFileSync(join(outDir, f), 'utf8');
  return (
    c.includes('src/app/pages/') ||
    c.includes('src/content/about.md') ||
    c.includes('app-home') ||
    c.includes('app-product')
  );
});

const devServer = await architectHost.resolveBuilder(
  '@analogjs/platform:dev-server',
);

console.log('=== assertions');
console.log('resolved by name from built package:', !!info?.import);
console.log('router markdown route path bundled:', usesFileRouter);
console.log('content files bundled:', usesContentFiles);
console.log('route chunks emitted:', lazyPages.length);
console.log('dev-server builder resolves by name:', !!devServer?.import);

const ok =
  !!info?.import &&
  !!devServer?.import &&
  usesFileRouter &&
  usesContentFiles &&
  lazyPages.length >= 3;
console.log('=== ALL ASSERTIONS PASS:', ok);
process.exit(ok ? 0 : 1);
