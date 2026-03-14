/**
 * Validates that package.json dependencies match actual source code usage.
 *
 * Replaces @nx/dependency-checks ESLint rule.
 *
 * Checks:
 * - Missing dependencies: imported in code but not in package.json
 * - Obsolete dependencies: listed in package.json but not imported in code
 *
 * Usage: node --experimental-strip-types tools/check-dependency-accuracy.mts [package-dir...]
 * If no dirs given, checks all packages/ directories that have package.json.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { glob } from 'node:fs/promises';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Packages to ignore in missing-dependency checks (framework-injected, build-time-only, etc.)
const GLOBAL_IGNORED = new Set([
  'tslib',
  'zone.js',
  'rxjs',
  '@angular/core',
  '@angular/common',
  '@angular/compiler',
  '@angular/platform-browser',
  '@angular/platform-browser-dynamic',
  '@angular/platform-server',
  '@angular/router',
  '@angular/forms',
  '@angular/animations',
]);

// Per-package ignored dependencies (matches ESLint config)
const PACKAGE_IGNORED: Record<string, Set<string>> = {
  'content-plugin': new Set(['ts-morph']),
};

const errors: string[] = [];
const warnings: string[] = [];
let checkedCount = 0;

function extractImports(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf-8');
  const imports = new Set<string>();

  // Match: import ... from 'package'
  //        import 'package'
  //        require('package')
  //        export ... from 'package'
  const importRe = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const match of content.matchAll(importRe)) {
    imports.add(match[1]);
  }
  for (const match of content.matchAll(requireRe)) {
    imports.add(match[1]);
  }

  return imports;
}

// Node.js built-in modules
const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

function getPackageName(specifier: string): string | null {
  // Skip relative imports, node: protocol builtins, and template literal fragments
  if (specifier.startsWith('.') || specifier.startsWith('node:')) return null;
  if (specifier.startsWith('#')) return null; // package.json imports field alias
  if (specifier.includes('${')) return null; // template literal fragment

  // Skip Node.js builtins
  const bare = specifier.split('/')[0];
  if (NODE_BUILTINS.has(bare)) return null;

  // Scoped package: @scope/name or @scope/name/subpath
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  }

  // Regular package: name or name/subpath
  return bare;
}

async function checkPackage(pkgDir: string): Promise<void> {
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return;

  const pkgJson: PackageJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  if (!pkgJson.name) return;

  const dirName = basename(pkgDir);
  const srcDir = join(pkgDir, 'src');
  if (!existsSync(srcDir)) return;

  const declaredDeps = new Set<string>([
    ...Object.keys(pkgJson.dependencies || {}),
    ...Object.keys(pkgJson.peerDependencies || {}),
  ]);

  const ignoredForPkg = PACKAGE_IGNORED[dirName] || new Set();

  // Scan source files for imports
  const usedPackages = new Set<string>();
  for await (const file of glob(`${srcDir}/**/*.{ts,tsx,js,mjs,cjs}`, {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.spec.ts',
      '**/*.test.ts',
    ],
  })) {
    const imports = extractImports(file);
    for (const specifier of imports) {
      const pkg = getPackageName(specifier);
      if (pkg && !GLOBAL_IGNORED.has(pkg) && !pkg.startsWith('@analogjs/')) {
        usedPackages.add(pkg);
      }
    }
  }

  // Check for missing dependencies
  for (const used of usedPackages) {
    if (!declaredDeps.has(used) && !ignoredForPkg.has(used)) {
      warnings.push(
        `${pkgJson.name}: "${used}" is imported but not in package.json`,
      );
    }
  }

  // Check for obsolete dependencies
  for (const declared of declaredDeps) {
    if (
      !usedPackages.has(declared) &&
      !GLOBAL_IGNORED.has(declared) &&
      !ignoredForPkg.has(declared)
    ) {
      warnings.push(
        `${pkgJson.name}: "${declared}" is in package.json but not imported in source`,
      );
    }
  }

  checkedCount++;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Check specific directories
    for (const dir of args) {
      await checkPackage(join(root, dir));
    }
  } else {
    // Check all packages/
    const packagesDir = join(root, 'packages');
    if (existsSync(packagesDir)) {
      for await (const pkgJson of glob(`${packagesDir}/*/package.json`)) {
        await checkPackage(dirname(pkgJson));
      }
    }
  }

  console.log(`Checked ${checkedCount} packages.`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):\n`);
    for (const err of errors) {
      console.error(`  ${err}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} warning(s):\n`);
    for (const w of warnings) {
      console.warn(`  ${w}`);
    }
  }

  if (errors.length > 0) {
    process.exit(1);
  } else if (warnings.length === 0) {
    console.log('All dependency checks passed.');
  }
}

main().catch((err) => {
  console.error('Failed to check dependencies:', err);
  process.exit(1);
});
