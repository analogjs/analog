import { Architect } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing/index.js';
import { logging, schema } from '@angular-devkit/core';
import { writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import applicationBuilder from '../packages/platform/src/lib/esbuild/application.impl';

const fixtureRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const newPage = join(fixtureRoot, 'src/app/pages/added-later.page.ts');
const outDir = join(fixtureRoot, 'dist-watch/browser');

rmSync(newPage, { force: true });

const registry = new schema.CoreSchemaRegistry();
registry.addPostTransform(schema.transforms.addUndefinedDefaults);
const logger = new logging.Logger('watch');

const host = new TestingArchitectHost(fixtureRoot, fixtureRoot);
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
    outputPath: 'dist-watch',
    optimization: false,
    sourceMap: false,
    progress: false,
    outputHashing: 'none',
    watch: true,
  } as never,
  { logger: logger as never },
);

function chunkNames(): string[] {
  return readdirSync(outDir)
    .filter((f) => f.endsWith('.js'))
    .flatMap((f) => {
      const content = readFileSync(join(outDir, f), 'utf8');
      return content.includes('added-later') ? ['HAS_ADDED_LATER'] : [];
    });
}

let builds = 0;
let sawAddedLater = false;

const done = new Promise<void>((resolve) => {
  run.output.subscribe((out) => {
    builds++;
    console.log(`[build ${builds}] success=${out.success}`);

    if (builds === 1) {
      // Adding a page file that no existing module imports. Only the
      // plugin's watchDirs can make esbuild notice it.
      console.log('--- writing new page file, expecting a rebuild');
      writeFileSync(
        newPage,
        `import { Component } from '@angular/core';\n\n@Component({ selector: 'app-added', template: '<p>added-later</p>' })\nexport default class AddedLaterPage {}\n`,
      );
      return;
    }

    sawAddedLater = chunkNames().includes('HAS_ADDED_LATER');
    resolve();
  });
});

const timeout = new Promise<void>((resolve) => setTimeout(resolve, 45_000));
await Promise.race([done, timeout]);
await run.stop();
rmSync(newPage, { force: true });

console.log('\n=== rebuilds observed:', builds);
console.log('=== new page picked up without an import:', sawAddedLater);
process.exit(builds >= 2 && sawAddedLater ? 0 : 1);
