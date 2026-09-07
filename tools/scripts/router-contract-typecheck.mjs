#!/usr/bin/env node
// Run through: pnpm exec nx run router:consumer-types
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execaSync } from 'execa';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(workspace, 'dist/router-contract-types');
mkdirSync(output, { recursive: true });
const root = mkdtempSync(join(output, 'run-'));
const packed = JSON.parse(
  execaSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', root],
    { cwd: join(workspace, 'packages/router/dist') },
  ).stdout,
)[0];

const dependencies = Object.fromEntries(
  [
    '@angular/common',
    '@angular/compiler',
    '@angular/core',
    '@angular/platform-browser',
    '@angular/platform-server',
    '@angular/router',
    '@standard-schema/spec',
    '@tanstack/angular-query-experimental',
    '@types/node',
    'nitro',
    'rxjs',
    'valibot',
  ].map((name) => [
    name,
    JSON.parse(
      readFileSync(
        join(workspace, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    ).version,
  ]),
);
dependencies['@analogjs/router'] = `file:./${packed.filename}`;
writeFileSync(
  join(root, 'package.json'),
  JSON.stringify(
    {
      name: 'analog-router-contract-fixture',
      private: true,
      type: 'module',
      dependencies,
    },
    null,
    2,
  ) + '\n',
);
for (const mode of ['--no-frozen-lockfile', '--frozen-lockfile']) {
  execaSync(
    'pnpm',
    [
      'install',
      '--ignore-workspace',
      '--ignore-scripts',
      '--prefer-offline',
      mode,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 180000,
    },
  );
}
copyFileSync(
  join(workspace, 'tools/fixtures/router-contracts/consumer.ts'),
  join(root, 'consumer.ts'),
);
writeFileSync(
  join(root, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'preserve',
        moduleResolution: 'bundler',
        // Match the workspace: check consumer contracts, not third-party Bun/Worker
        // ambient declarations pulled in by Nitro's adapter type exports.
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      },
      files: ['consumer.ts'],
    },
    null,
    2,
  ) + '\n',
);
const installed = createRequire(join(root, 'package.json'));
assert.ok(
  installed.resolve('@analogjs/router/package.json').includes('node_modules'),
);
execaSync('pnpm', ['exec', 'tsgo', '-p', join(root, 'tsconfig.json')], {
  cwd: workspace,
  stdio: 'inherit',
  timeout: 60000,
});
writeFileSync(
  join(root, 'result.json'),
  JSON.stringify(
    {
      node: process.version,
      package: '@analogjs/router',
      passed: true,
      checks: [
        'schema input/output',
        'optional AbortSignal',
        'query/body inference',
        'handler and page-load context',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('Installed router positive and negative type contracts passed.');
