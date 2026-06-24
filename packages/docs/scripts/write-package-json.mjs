#!/usr/bin/env node
// Writes node_modules/@analogjs/docs/package.json from scratch so the
// `./vite` subpath export resolves at runtime. The @analogjs/docs
// package only ships vite plugins now (no Angular library) — until it
// folds into @analogjs/content/docs/vite, this script stands in for
// the package.json that ng-packagr used to generate.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '../../../node_modules/@analogjs/docs');

const pkgJson = {
  name: '@analogjs/docs',
  version: '0.0.1',
  type: 'module',
  exports: {
    './package.json': './package.json',
    './vite': {
      types: './vite/index.d.ts',
      default: './vite/index.js',
    },
  },
};

mkdirSync(pkgRoot, { recursive: true });
writeFileSync(
  resolve(pkgRoot, 'package.json'),
  JSON.stringify(pkgJson, null, 2) + '\n',
);
console.log('wrote @analogjs/docs/package.json');
