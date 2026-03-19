/**
 * Cross-platform script to copy build assets for library packages.
 *
 * Usage:
 *   node --experimental-strip-types tools/scripts/copy-src-assets.mts <pkgDir> <destDir> [options]
 *
 * Options:
 *   --assets file1 file2 ...   Copy listed files flat from pkgDir to destDir
 *   --dirs dir1 dir2 ...       Recursively copy directories from pkgDir to destDir
 *   --src                      Copy non-TS source assets (all files except .ts, plus .d.ts)
 *
 * Examples:
 *   node --experimental-strip-types tools/scripts/copy-src-assets.mts packages/nx-plugin node_modules/@analogjs/platform/src/lib/nx-plugin --assets package.json generators.json executors.json --src
 *   node --experimental-strip-types tools/scripts/copy-src-assets.mts packages/vite-plugin-nitro node_modules/@analogjs/vite-plugin-nitro --assets package.json --dirs migrations
 */
import { copyFileSync, cpSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args: string[] = process.argv.slice(2);
const pkgDir: string = args[0];
const destDir: string = args[1];
const flags: string[] = args.slice(2);

let i = 0;
const assets: string[] = [];
const dirs: string[] = [];
let copySrc = false;

while (i < flags.length) {
  if (flags[i] === '--assets') {
    i++;
    while (i < flags.length && !flags[i].startsWith('--')) {
      assets.push(flags[i]);
      i++;
    }
  } else if (flags[i] === '--dirs') {
    i++;
    while (i < flags.length && !flags[i].startsWith('--')) {
      dirs.push(flags[i]);
      i++;
    }
  } else if (flags[i] === '--src') {
    copySrc = true;
    i++;
  } else {
    i++;
  }
}

// Copy flat files
for (const file of assets) {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(join(pkgDir, file), join(destDir, file));
}

// Copy directories recursively
for (const dir of dirs) {
  cpSync(join(pkgDir, dir), join(destDir, dir), { recursive: true });
}

// Copy non-TS source assets (all files except .ts, plus .d.ts)
if (copySrc) {
  const srcDir: string = join(pkgDir, 'src');
  const srcDestDir: string = join(destDir, 'src');
  cpSync(srcDir, srcDestDir, {
    recursive: true,
    filter: (src: string): boolean => {
      if (statSync(src).isDirectory()) return true;
      if (src.endsWith('.ts') && !src.endsWith('.d.ts')) return false;
      return true;
    },
  });
}
