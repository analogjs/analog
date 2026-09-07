#!/usr/bin/env node

// Build the package first: pnpm nx run vite-plugin-angular:build
// Usage: node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=8.0.8 --angular=22.0.0
import { execaSync } from 'execa';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { vite: { type: 'string' }, angular: { type: 'string' } },
});
const supportedVite = ['6.0.0', '7.0.0', '8.0.8'];
const angularTuples = {
  '17.3.12': {
    typescript: '5.4.5',
    builder: '17.3.17',
    package: '@angular-devkit/build-angular',
  },
  '18.2.14': {
    typescript: '5.5.4',
    builder: '18.2.14',
    package: '@angular/build',
  },
  '19.0.0': {
    typescript: '5.6.3',
    builder: '19.0.0',
    package: '@angular/build',
  },
  '20.0.0': {
    typescript: '5.8.3',
    builder: '20.0.0',
    package: '@angular/build',
  },
  '20.1.0': {
    typescript: '5.8.3',
    builder: '20.1.0',
    package: '@angular/build',
  },
  '21.0.0': {
    typescript: '5.9.3',
    builder: '21.0.0',
    package: '@angular/build',
  },
  '22.0.0': {
    typescript: '6.0.2',
    builder: '22.0.0',
    package: '@angular/build',
  },
};
const tuple = Object.hasOwn(angularTuples, values.angular ?? '')
  ? angularTuples[values.angular]
  : undefined;
if (!tuple || !supportedVite.includes(values.vite)) {
  throw new Error(
    `Select --vite=${supportedVite.join('|')} and --angular=${Object.keys(angularTuples).join('|')}`,
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(scriptDirectory, '../../..');
const outputRoot = join(workspace, 'dist/compiler-vite-smoke');
mkdirSync(outputRoot, { recursive: true });
const root = mkdtempSync(
  join(outputRoot, `angular-${values.angular}-vite-${values.vite}-`),
);
const packed = JSON.parse(
  execaSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', root],
    {
      cwd: join(workspace, 'packages/vite-plugin-angular/dist'),
    },
  ).stdout,
);
const packageName = JSON.parse(
  readFileSync(
    join(workspace, 'packages/vite-plugin-angular/package.json'),
    'utf8',
  ),
).name;
const dependencies = {
  [packageName]: `file:./${packed[0].filename}`,
  '@angular/core': values.angular,
  '@angular/common': values.angular,
  '@angular/platform-browser': values.angular,
  '@angular/compiler': values.angular,
  '@angular/compiler-cli': values.angular,
  [tuple.package]: tuple.builder,
  typescript: tuple.typescript,
  vite: values.vite,
  rxjs: '7.8.2',
  tslib: '2.8.1',
  ...(values.angular === '22.0.0'
    ? { playwright: '1.59.1', 'zone.js': '0.16.1' }
    : {}),
};
writeFileSync(
  join(root, 'package.json'),
  JSON.stringify(
    {
      name: 'analog-compiler-compat-fixture',
      private: true,
      type: 'module',
      dependencies,
    },
    null,
    2,
  ),
);
copyFileSync(
  join(scriptDirectory, 'compiler-vite-fixture.mjs'),
  join(root, 'fixture.mjs'),
);
const env = { ...process.env, NODE_ENV: 'production' };
env.PLAYWRIGHT_SKIP_BROWSER_GC = '1';
delete env.VITEST;
execaSync(
  'pnpm',
  [
    'install',
    '--ignore-workspace',
    '--ignore-scripts',
    '--no-frozen-lockfile',
    '--prefer-offline',
  ],
  { cwd: root, env, stdio: 'inherit' },
);
if (values.angular === '22.0.0') {
  execaSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'install',
      'chromium',
      ...(process.env.CI ? ['--with-deps'] : []),
    ],
    { cwd: root, env, stdio: 'inherit' },
  );
}
const consumerNode = process.env.ANALOG_CONSUMER_NODE || process.execPath;
console.log(`Consumer Node: ${execaSync(consumerNode, ['--version']).stdout}`);
execaSync(consumerNode, ['fixture.mjs'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
console.log(`Installed-package evidence retained at ${root}`);
