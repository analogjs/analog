#!/usr/bin/env node
// Post-ng-packagr patch: ng-packagr regenerates @analogjs/docs/package.json
// from scratch each build, so we re-add the `./vite` subpath export and
// drop a `package.json` next to the compiled vite plugins so Node treats
// them as CommonJS (overriding the parent package's `type: module`).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '../../../node_modules/@analogjs/docs');
const pkgJson = resolve(pkgRoot, 'package.json');
const viteDir = resolve(pkgRoot, 'vite');

if (!existsSync(pkgJson)) {
  console.error(`patch-package-json: ${pkgJson} not found`);
  process.exit(1);
}
if (!existsSync(viteDir)) {
  console.error(`patch-package-json: ${viteDir} not found — did tsc run?`);
  process.exit(1);
}

const json = JSON.parse(readFileSync(pkgJson, 'utf8'));
json.exports = json.exports ?? {};
json.exports['./vite'] = {
  types: './vite/index.d.ts',
  default: './vite/index.js',
};
writeFileSync(pkgJson, JSON.stringify(json, null, 2) + '\n');

console.log('patch-package-json: added ./vite export');
