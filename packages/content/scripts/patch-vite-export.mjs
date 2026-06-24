#!/usr/bin/env node
// Post-ng-packagr patch: ng-packagr regenerates node_modules/@analogjs/content/package.json
// from scratch each build, so we re-add the ./vite subpath export
// pointing at the tsc-built ESM vite plugins.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '../../../node_modules/@analogjs/content');
const pkgJson = resolve(pkgRoot, 'package.json');
const viteDir = resolve(pkgRoot, 'vite');

if (!existsSync(pkgJson)) {
  console.error(`patch-vite-export: ${pkgJson} not found`);
  process.exit(1);
}
if (!existsSync(viteDir)) {
  console.error(`patch-vite-export: ${viteDir} not found — did tsc run?`);
  process.exit(1);
}

const json = JSON.parse(readFileSync(pkgJson, 'utf8'));
json.exports = json.exports ?? {};
json.exports['./vite'] = {
  types: './vite/index.d.ts',
  default: './vite/index.js',
};
writeFileSync(pkgJson, JSON.stringify(json, null, 2) + '\n');

console.log('patch-vite-export: added ./vite export');
