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
  openSync,
  closeSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    vite: { type: 'string' },
    angular: { type: 'string' },
    'node-executable': { type: 'string' },
  },
});
const supportedVite = [
  '6.0.0',
  '6.4.3',
  '7.0.0',
  '7.3.6',
  '8.0.0',
  '8.0.8',
  '8.2.2',
];
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
const consumerNode = values['node-executable'] ?? process.execPath;
const oldAngular = Number(values.angular.split('.')[0]) < 21;
const expectedNode = oldAngular ? 'v20.19.5' : 'v24.15.0';
const actualNode = execaSync(consumerNode, ['--version']).stdout.trim();
if (actualNode !== expectedNode)
  throw new Error(
    `Angular ${values.angular} qualification requires ${expectedNode}; received ${actualNode}. Select --node-executable or run this script with the pinned consumer Node.`,
  );
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
  ...(values.angular === '22.0.0'
    ? { '@angular/platform-server': values.angular }
    : {}),
  '@angular/compiler': values.angular,
  '@angular/compiler-cli': values.angular,
  '@types/node': oldAngular ? '20.12.14' : '24.13.3',
  '@jridgewell/trace-mapping': '0.3.31',
  [tuple.package]: tuple.builder,
  typescript: tuple.typescript,
  vite: values.vite,
  rxjs: '7.8.2',
  tslib: '2.8.1',
  ...(!oldAngular
    ? {
        playwright: '1.59.1',
        'zone.js': values.angular === '22.0.0' ? '0.16.1' : '0.15.1',
      }
    : {}),
};
writeFileSync(
  join(root, 'package.json'),
  JSON.stringify(
    {
      name: 'analog-compiler-compat-fixture',
      private: true,
      type: 'module',
      packageManager: 'pnpm@10.33.0',
      pnpm: {
        onlyBuiltDependencies: [
          'esbuild',
          '@parcel/watcher',
          'lmdb',
          'msgpackr-extract',
        ],
      },
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
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
if (!pathKey)
  throw new Error('The consumer runner requires PATH to locate pnpm');
env[pathKey] = `${dirname(consumerNode)}${delimiter}${env[pathKey]}`;
env.PLAYWRIGHT_SKIP_BROWSER_GC = '1';
delete env.VITEST;
execaSync(
  'pnpm',
  ['install', '--ignore-workspace', '--no-frozen-lockfile', '--prefer-offline'],
  { cwd: root, env, stdio: 'inherit' },
);
if (!oldAngular) {
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
execaSync(consumerNode, ['fixture.mjs'], {
  cwd: root,
  env,
  stdio: 'inherit',
  timeout: 180000,
  killSignal: 'SIGKILL',
});
console.log(`Installed-package evidence retained at ${root}`);
if (values.angular === '22.0.0' && values.vite === '8.2.2') {
  copyFileSync(
    join(scriptDirectory, 'compiler-runtime-qualification.mjs'),
    join(root, 'runtime.mjs'),
  );
  for (const mode of ['ngtsc', 'fast', 'api']) {
    const logPath = join(root, `runtime-${mode}.log`);
    const log = openSync(logPath, 'w');
    try {
      execaSync(
        consumerNode,
        [
          '--expose-gc',
          'runtime.mjs',
          `--output=runtime-${mode}.json`,
          `--mode=${mode}`,
          '--components=100',
          '--edits=3',
          '--restart-every=3',
          '--close-queued',
        ],
        {
          cwd: root,
          env: { ...env, NODE_ENV: 'development' },
          stdio: ['ignore', log, log],
          timeout: 180000,
          killSignal: 'SIGKILL',
        },
      );
      console.log(
        `Runtime qualification passed: ${mode}, 100 components, restart and queued shutdown`,
      );
    } catch (error) {
      console.error(
        readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n'),
      );
      throw error;
    } finally {
      closeSync(log);
    }
  }
}
