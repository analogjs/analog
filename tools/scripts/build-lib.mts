#!/usr/bin/env node

/**
 * Build script for Angular library packages.
 * Replaces ng-packagr with Vite (FESM bundles) + tsc (declarations).
 *
 * Usage: node tools/scripts/build-lib.mts <package-name>
 * Example: node tools/scripts/build-lib.mts trpc
 */

import { execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';

interface SubEntry {
  path: string;
  name: string;
  typesPath: string;
}

interface NgPackageJson {
  dest?: string;
  assets?: string[];
  lib?: { entryFile?: string };
}

interface ExportConditions {
  types?: string;
  default: string;
}

const packageName: string | undefined = process.argv[2];
if (!packageName) {
  console.error('Usage: node tools/scripts/build-lib.mts <package-name>');
  process.exit(1);
}

const root: string = resolve(import.meta.dirname, '../..');
const pkgDir: string = resolve(root, 'packages', packageName);
const outDir: string = resolve(root, 'node_modules/@analogjs', packageName);

if (!existsSync(pkgDir)) {
  console.error(`Package directory not found: ${pkgDir}`);
  process.exit(1);
}

console.log(`\nBuilding @analogjs/${packageName}...\n`);

// Step 1: Clean output directory (preserve plugin/ for content)
if (existsSync(outDir)) {
  // For content package, preserve the plugin/ directory (built separately)
  if (packageName === 'content' && existsSync(resolve(outDir, 'plugin'))) {
    // Remove everything except plugin/
    const entries: string[] = [
      'fesm2022',
      'types',
      'packages',
      'package.json',
      'README.md',
      '.npmignore',
      'server',
      'tokens',
      'og',
      'prism-highlighter',
      'shiki-highlighter',
      'resources',
      'migrations',
      'LICENSE',
    ];
    for (const entry of entries) {
      const p: string = resolve(outDir, entry);
      if (existsSync(p)) rmSync(p, { recursive: true });
    }
  } else {
    rmSync(outDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });
  }
} else {
  mkdirSync(outDir, { recursive: true });
}

// Step 2: Build FESM bundles with Vite
console.log('  → Building FESM bundles with Vite + Rolldown...');
execSync(
  `npx vite build --config packages/${packageName}/vite.config.lib.ts`,
  { cwd: root, stdio: 'inherit' },
);

// Clean up stale declarations emitted by Angular plugin's auto-declaration mode
// (we generate declarations separately via tsc in the next step)
const staleDecls: string = resolve(outDir, 'packages');
if (existsSync(staleDecls)) rmSync(staleDecls, { recursive: true });

// Step 3: Generate declarations with tsc
console.log('\n  → Generating declarations with tsc...');
const tsconfigProd: string = resolve(pkgDir, 'tsconfig.lib.prod.json');
const tsconfig: string = existsSync(tsconfigProd)
  ? tsconfigProd
  : resolve(pkgDir, 'tsconfig.lib.json');

execSync(
  `npx tsc -p "${tsconfig}" --emitDeclarationOnly --outDir "${resolve(outDir, 'types')}"`,
  { cwd: root, stdio: 'inherit' },
);

// Step 4: Copy package.json and inject exports map
console.log('  → Generating package metadata...');
const srcPkg: Record<string, unknown> = JSON.parse(
  readFileSync(resolve(pkgDir, 'package.json'), 'utf-8'),
);

// Read ng-package.json to discover entry points
const ngPkg: NgPackageJson = JSON.parse(
  readFileSync(resolve(pkgDir, 'ng-package.json'), 'utf-8'),
);
const prefix: string = `analogjs-${packageName}`;

// Discover sub-entries from ng-package.json files in subdirectories
const subEntries: SubEntry[] = [];
const subDirs: string[] = [
  'server',
  'server/actions',
  'tokens',
  'og',
  'prism-highlighter',
  'shiki-highlighter',
  'resources',
];
for (const sub of subDirs) {
  const ngPkgPath: string = resolve(pkgDir, sub, 'ng-package.json');
  if (existsSync(ngPkgPath)) {
    const subNgPkg: NgPackageJson = JSON.parse(
      readFileSync(ngPkgPath, 'utf-8'),
    );
    const entryFile: string = subNgPkg.lib?.entryFile || 'src/index.ts';
    subEntries.push({
      path: `./${sub}`,
      name: `${prefix}-${sub.replace(/\//g, '-')}`,
      typesPath: `${sub}/${entryFile}`.replace('.ts', '.d.ts'),
    });
  }
}

// Build exports map — types point to tsc's per-file output, JS to FESM bundles
const mainEntryFile: string = ngPkg.lib?.entryFile || 'src/index.ts';
const exportsMap: Record<string, ExportConditions> = {
  './package.json': { default: './package.json' },
  '.': {
    types: `./types/${mainEntryFile.replace('.ts', '.d.ts')}`,
    default: `./fesm2022/${prefix}.mjs`,
  },
};

for (const entry of subEntries) {
  exportsMap[entry.path] = {
    types: `./types/${entry.typesPath}`,
    default: `./fesm2022/${entry.name}.mjs`,
  };
}

// Merge into package.json
const outPkg: Record<string, unknown> = {
  ...srcPkg,
  module: `fesm2022/${prefix}.mjs`,
  typings: `types/${mainEntryFile.replace('.ts', '.d.ts')}`,
  exports: exportsMap,
  sideEffects: false,
};

writeFileSync(
  resolve(outDir, 'package.json'),
  JSON.stringify(outPkg, null, 2) + '\n',
);

// Step 5: Copy assets
const assets: string[] = ngPkg.assets || [];
for (const asset of assets) {
  const src: string = resolve(pkgDir, asset);
  if (existsSync(src)) {
    const dest: string = resolve(outDir, asset);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
}

// Copy README and LICENSE if they exist
for (const file of ['README.md', 'LICENSE']) {
  const src: string = resolve(pkgDir, file);
  if (existsSync(src)) {
    cpSync(src, resolve(outDir, file));
  }
  // Also check root for LICENSE
  if (file === 'LICENSE' && !existsSync(src)) {
    const rootLicense: string = resolve(root, 'LICENSE');
    if (existsSync(rootLicense)) {
      cpSync(rootLicense, resolve(outDir, file));
    }
  }
}

// Step 6: Generate sub-entry package.json files (for legacy resolution)
for (const entry of subEntries) {
  const subDir: string = resolve(outDir, entry.path);
  mkdirSync(subDir, { recursive: true });
  const depth: number = entry.path.split('/').length - 1;
  const up: string = '../'.repeat(depth);
  const subPkg: Record<string, string> = {
    module: `${up}fesm2022/${entry.name}.mjs`,
    typings: `${up}types/${entry.typesPath}`,
  };
  writeFileSync(
    resolve(subDir, 'package.json'),
    JSON.stringify(subPkg, null, 2) + '\n',
  );
}

console.log(`\n✓ Built @analogjs/${packageName}\n`);
