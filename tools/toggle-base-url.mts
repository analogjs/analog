/**
 * Temporarily strips or restores `baseUrl` from tsconfig files.
 *
 * tsgolint (used by oxlint --type-aware) does not support `baseUrl`,
 * but Nx/tsc builds still require it. This script toggles it so that
 * type-aware linting can run cleanly.
 *
 * Usage:
 *   node --experimental-strip-types tools/toggle-base-url.mts --start   # strip baseUrl
 *   node --experimental-strip-types tools/toggle-base-url.mts --end     # restore baseUrl
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const TSCONFIG_FILES = [
  'packages/astro-angular/tsconfig.json',
  'packages/content-plugin/tsconfig.json',
  'packages/nx-plugin/tsconfig.json',
  'packages/platform/tsconfig.json',
  'packages/storybook-angular/tsconfig.json',
  'packages/vite-plugin-angular/tsconfig.json',
  'packages/vite-plugin-angular-tools/tsconfig.json',
  'packages/vite-plugin-nitro/tsconfig.json',
  'packages/vitest-angular/tsconfig.json',
  'packages/vitest-angular-tools/tsconfig.json',
  'apps/astro-app/tsconfig.app.json',
  'apps/docs-app/tsconfig.json',
];

const flag = process.argv[2];

if (flag !== '--start' && flag !== '--end') {
  console.error('Usage: toggle-base-url.mts --start | --end');
  process.exit(1);
}

let changed = 0;

for (const rel of TSCONFIG_FILES) {
  const file = resolve(ROOT, rel);
  const original = readFileSync(file, 'utf-8');
  let result: string;

  if (flag === '--start') {
    // Comment out baseUrl lines, preserving the value for --end.
    result = original.replace(
      /^([ \t]*)"baseUrl"\s*:\s*("[^"]*")(,?)\s*\n/gm,
      '$1// __baseUrl__: $2$3\n',
    );
  } else {
    // Restore baseUrl from commented markers.
    result = original.replace(
      /^([ \t]*)\/\/ __baseUrl__: ("[^"]*")(,?)\s*\n/gm,
      '$1"baseUrl": $2$3\n',
    );
  }

  if (result !== original) {
    writeFileSync(file, result);
    changed++;
  }
}

console.log(
  flag === '--start'
    ? `Stripped baseUrl from ${changed} tsconfig files for type-aware linting.`
    : `Restored baseUrl in ${changed} tsconfig files.`,
);
