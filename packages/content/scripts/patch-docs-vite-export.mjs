#!/usr/bin/env node
// Post-ng-packagr patch: ng-packagr regenerates node_modules/@analogjs/content/package.json
// from scratch each build, so we re-add the ./docs/vite subpath
// export pointing at the tsc-built ESM vite plugins.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '../../../node_modules/@analogjs/content');
const pkgJson = resolve(pkgRoot, 'package.json');
const viteDir = resolve(pkgRoot, 'docs/vite');

if (!existsSync(pkgJson)) {
  console.error(`patch-docs-vite-export: ${pkgJson} not found`);
  process.exit(1);
}
if (!existsSync(viteDir)) {
  console.error(`patch-docs-vite-export: ${viteDir} not found — did tsc run?`);
  process.exit(1);
}

const json = JSON.parse(readFileSync(pkgJson, 'utf8'));
json.exports = json.exports ?? {};
json.exports['./docs/vite'] = {
  types: './docs/vite/index.d.ts',
  default: './docs/vite/index.js',
};
writeFileSync(pkgJson, JSON.stringify(json, null, 2) + '\n');

console.log('patch-docs-vite-export: added ./docs/vite export');
