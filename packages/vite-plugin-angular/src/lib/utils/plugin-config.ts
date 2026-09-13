import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import * as ts from 'typescript';
import * as vite from 'vite';
import { defaultClientConditions } from 'vite';

import {
  createCompilerPlugin,
  createRolldownCompilerPlugin,
} from '../compiler-plugin.js';
import {
  createPersistentTransformCache,
  resolveTransformCacheDir,
} from './transform-cache.js';

/**
 * TypeScript file extension regex
 * Match .ts / .cts / .mts extensions with an optional ?query suffix.
 * Reject .tsx — and any other `.ts<letter>…` extension like .tsrx — via
 * a negative-lookahead on a following ASCII letter, so only genuine TS
 * files pass.
 *
 * Previous form `/\.[cm]?(ts)[^x]?\??/` was intended to exclude `.tsx`
 * specifically (`[^x]?` = not-an-x), but the `?` quantifier also allows
 * zero characters, and any non-`x` letter was admitted — so `.tsrx`
 * and similar extensions matched by accident.
 */
export const TS_EXT_REGEX = /\.[cm]?ts(?![a-z])/;

// Spec files stay included — a newly added spec must join the program's
// root names in Vitest watch mode.
export const EXCLUDED_TS_EXT_REGEX = /\.d\.[cm]?ts$/;

/**
 * Resolves whether Angular should be compiled for production. An explicit
 * `development` mode wins over an ambient production `NODE_ENV` (e.g. set by
 * `storybook build` at CLI entry), so a build can opt into Angular's
 * development compilation. See #2458 and #2462.
 */
export function isProdMode(mode: string | undefined): boolean {
  if (mode === 'development') {
    return false;
  }

  return mode === 'production' || process.env['NODE_ENV'] === 'production';
}

export interface TsConfigResolutionContext {
  root: string;
  isProd: boolean;
  isLib: boolean;
}

export function getTsConfigPath(
  root: string,
  tsconfig: string,
  isProd: boolean,
  isTest: boolean,
  isLib: boolean,
  workspaceRoot?: string,
) {
  if (tsconfig && isAbsolute(tsconfig)) {
    if (!existsSync(tsconfig)) {
      console.error(
        `[@analogjs/vite-plugin-angular]: Unable to resolve tsconfig at ${tsconfig}. This causes compilation issues. Check the path or set the "tsconfig" property with an absolute path.`,
      );
    }

    return tsconfig;
  }

  let tsconfigFilePath = './tsconfig.app.json';

  if (isLib) {
    tsconfigFilePath = isProd
      ? './tsconfig.lib.prod.json'
      : './tsconfig.lib.json';
  }

  if (isTest) {
    tsconfigFilePath = './tsconfig.spec.json';
  }

  if (tsconfig) {
    tsconfigFilePath = tsconfig;
  }

  const resolvedPath = resolve(root, tsconfigFilePath);

  if (existsSync(resolvedPath)) {
    return resolvedPath;
  }

  // Callers such as Storybook's Angular builder document their `tsConfig` as
  // workspace-relative while setting the Vite root to the project directory,
  // so the path joins onto the project root twice. Fall back to the workspace
  // root before failing.
  const workspacePath = workspaceRoot
    ? resolve(workspaceRoot, tsconfigFilePath)
    : undefined;

  if (workspacePath && existsSync(workspacePath)) {
    return workspacePath;
  }

  const attemptedPaths =
    workspacePath && workspacePath !== resolvedPath
      ? `${resolvedPath} or ${workspacePath}`
      : resolvedPath;

  console.error(
    `[@analogjs/vite-plugin-angular]: Unable to resolve tsconfig at ${attemptedPaths}. This causes compilation issues. Check the path or set the "tsconfig" property with an absolute path.`,
  );

  return resolvedPath;
}

/**
 * Splits a package import specifier into its package name (`@scope/name`
 * when scoped, otherwise just the first segment) and whatever subpath
 * follows it, if any — e.g. `@tsconfig/strictest/tsconfig.json` is the
 * package `@tsconfig/strictest` plus subpath `tsconfig.json`, while
 * `@tsconfig/strictest` alone has no subpath at all.
 */
function splitPackageSpecifier(specifier: string): {
  packageName: string;
  subpath: string | undefined;
} {
  const segments = specifier.split('/');
  const nameSegmentCount = specifier.startsWith('@') ? 2 : 1;
  const packageName = segments.slice(0, nameSegmentCount).join('/');
  const rest = segments.slice(nameSegmentCount);

  return { packageName, subpath: rest.length > 0 ? rest.join('/') : undefined };
}

/**
 * Resolves an `extends` specifier (relative path, absolute path, or a
 * package specifier like `@tsconfig/strictest` or
 * `@tsconfig/strictest/tsconfig.json`) to an absolute config file path,
 * the same way TypeScript itself would when reading the config that
 * references it. Returns `undefined` if it can't be resolved (e.g. an
 * uninstalled package) rather than throwing — a config a real build
 * can't resolve either isn't this function's problem to report.
 *
 * A bare package specifier (no subpath at all, e.g. `@tsconfig/strictest`
 * on its own) is tried as a plain Node module resolution *first* — some
 * config packages expose their bare specifier directly to a config file
 * via their own `exports` map (`"exports": { ".": "./tsconfig.json" }`),
 * which is real, valid package resolution TypeScript itself also follows.
 * Only once that fails is the package's own directory resolved instead
 * (via its `package.json`, which every package has, unless an `exports`
 * map hides that specific subpath too — see below) and a `tsconfig` field
 * there read for the real path, defaulting to `tsconfig.json` in that
 * directory when the field is absent — many published base-config
 * packages (the `@tsconfig/*` ones, most commonly) have a `package.json`
 * but no `main`/`exports` entry at all, since they exist purely to be
 * `extends`ed, so the bare specifier alone fails to resolve as a module
 * even though the package installed fine, and this fallback is what
 * actually finds it.
 *
 * An explicit subpath (`some-config/base` or `some-config/base.json`) is
 * a real file within the package, not its own nested package — resolved
 * directly, trying the subpath exactly as written *first*. A package
 * `exports` map can rewrite an extensionless key to a `.json` target of
 * its own (Astro's does, e.g. `"./tsconfigs/*": "./tsconfigs/*.json"`),
 * in which case appending `.json` ourselves before resolving would ask
 * for a specifier the map was never written to expose
 * (`astro/tsconfigs/strict.json` doesn't match `./tsconfigs/*`, only
 * `astro/tsconfigs/strict` does) and fail even though the file is right
 * there. Only once the exact specifier fails to resolve is `.json`
 * appended as a fallback, for a package with no `exports` map to
 * intercept it (plain Node CJS resolution already tries appending
 * `.json` for a bare relative subpath like this on its own — this
 * fallback only matters when a stricter `exports` map is in play but
 * doesn't cover the extensionless form either).
 */
function resolveExtendsTarget(
  specifier: string,
  fromConfigDir: string,
): string | undefined {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const resolved = isAbsolute(specifier)
      ? specifier
      : resolve(fromConfigDir, specifier);
    // TypeScript only appends `.json` as a fallback for a relative or
    // absolute target that doesn't already exist as given — an
    // extensionless file (`./baseconfig`, no `.json` at all) or one using
    // a different JSON-family extension (`./compiler-options.jsonc`) is a
    // real, existing, valid `extends` target on its own, and appending
    // `.json` unconditionally would ask for the wrong, nonexistent file
    // instead (`baseconfig.json`, `compiler-options.jsonc.json`) — the
    // same mistake `.endsWith('.json')` alone doesn't catch for `.jsonc`.
    if (existsSync(resolved) || resolved.endsWith('.json')) {
      return resolved;
    }
    return `${resolved}.json`;
  }

  const require = createRequire(resolve(fromConfigDir, 'noop.js'));
  const { packageName, subpath } = splitPackageSpecifier(specifier);

  if (subpath !== undefined) {
    try {
      return require.resolve(specifier);
    } catch {
      // fall through to the `.json`-appended fallback below
    }
    if (!subpath.endsWith('.json')) {
      try {
        return require.resolve(`${specifier}.json`);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  // A package can expose its bare specifier directly to a config file via
  // its own `exports` map (`"exports": { ".": "./tsconfig.json" }`) —
  // real Node/TypeScript package resolution, tried first so it wins over
  // the package.json-reading fallback below. Such a map can restrict
  // subpaths to only the ones it lists, hiding `./package.json` entirely
  // (a real, spec-compliant config, not just a hypothetical one) — the
  // fallback below would misreport the whole package as unresolvable if
  // tried on its own.
  //
  // Only accepted when it resolves to a `.json` file, though: TypeScript
  // itself resolves an `extends` package specifier through its own
  // JSON-typed resolution (not a general "resolve this package" one), so
  // it would never land on a package's ordinary JS `main`/`exports`
  // entry point the way plain `require.resolve` can for a package that
  // happens to expose one *and* a `tsconfig` field for this fallback's
  // other branch below — accepting that JS file here would silently
  // shadow the real config the package actually wants extended.
  try {
    const resolved = require.resolve(packageName);
    if (resolved.endsWith('.json')) {
      return resolved;
    }
  } catch {
    // fall through to the package.json-reading fallback below
  }

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      tsconfig?: unknown;
    };
    const tsconfigRelativePath =
      typeof packageJson.tsconfig === 'string'
        ? packageJson.tsconfig
        : 'tsconfig.json';

    return resolve(dirname(packageJsonPath), tsconfigRelativePath);
  } catch {
    return undefined;
  }
}

/**
 * Every config file a tsconfig's `extends` chain pulls settings from
 * (including the leaf path itself), so a caller can watch each one
 * explicitly — Vite's own file watcher only observes its project root and
 * a handful of config dependencies by default, so an `extends` target
 * outside that root (a monorepo's shared `tsconfig.base.json`, most
 * commonly) would otherwise never even reach a `handleHotUpdate`/watcher
 * `'change'` callback to invalidate against. TypeScript allows `extends`
 * to be a single specifier or (5.0+) an array of them, each resolved
 * relative to the config that declares it, and itself possibly extending
 * further configs — so this walks the whole graph, not just one level.
 * A cycle or a target that can't be resolved (e.g. a workspace package
 * not yet installed) just stops that branch rather than throwing, since a
 * config in that state isn't buildable anyway.
 */
export function resolveTsConfigExtendsChain(leafPath: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [leafPath];

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    if (visited.has(currentPath)) {
      continue;
    }
    visited.add(currentPath);
    chain.push(currentPath);

    let config: { extends?: string | string[] } | undefined;
    try {
      config = ts.readConfigFile(currentPath, ts.sys.readFile).config;
    } catch {
      continue;
    }

    const extendsValue = config?.extends;
    if (!extendsValue) {
      continue;
    }
    const specifiers = Array.isArray(extendsValue)
      ? extendsValue
      : [extendsValue];
    for (const specifier of specifiers) {
      const resolved = resolveExtendsTarget(specifier, dirname(currentPath));
      if (resolved) {
        queue.push(resolved);
      }
    }
  }

  return chain;
}

export function createTsConfigGetter(
  tsconfigOrGetter?: string | (() => string),
) {
  if (typeof tsconfigOrGetter === 'function') {
    return tsconfigOrGetter;
  }

  return () => tsconfigOrGetter || '';
}

export interface DepOptimizerOptions {
  tsconfig: string;
  isProd: boolean;
  jit: boolean;
  watchMode: boolean;
  isTest: boolean;
  isAstroIntegration: boolean;
}

export function createDepOptimizerConfig(opts: DepOptimizerOptions) {
  const defineOptions = {
    ngJitMode: 'false',
    ngI18nClosureMode: 'false',
    ...(opts.watchMode ? {} : { ngDevMode: 'false' }),
  };

  // Persist linked dependency output across dep-optimizer runs. The
  // transformer's own key covers file bytes + options, and the directory
  // is namespaced by Angular version, so entries never go stale.
  const transformCacheDir = resolveTransformCacheDir(dirname(opts.tsconfig));
  const transformCache = transformCacheDir
    ? createPersistentTransformCache(transformCacheDir)
    : undefined;

  const rolldownOptions: vite.DepOptimizationOptions['rolldownOptions'] = {
    plugins: [
      createRolldownCompilerPlugin(
        {
          tsconfig: opts.tsconfig,
          sourcemap: !opts.isProd,
          advancedOptimizations: opts.isProd,
          jit: opts.jit,
          incremental: opts.watchMode,
        },
        opts.isTest,
        !opts.isAstroIntegration,
        transformCache,
      ),
    ],
  };

  const esbuildOptions: vite.DepOptimizationOptions['esbuildOptions'] = {
    plugins: [
      createCompilerPlugin(
        {
          tsconfig: opts.tsconfig,
          sourcemap: !opts.isProd,
          advancedOptimizations: opts.isProd,
          jit: opts.jit,
          incremental: opts.watchMode,
        },
        opts.isTest,
        !opts.isAstroIntegration,
        transformCache,
      ),
    ],
    define: defineOptions,
  };

  return {
    optimizeDeps: {
      include: ['rxjs/operators', 'rxjs'],
      exclude: ['@angular/platform-server'],
      ...(vite.rolldownVersion ? { rolldownOptions } : { esbuildOptions }),
    },
    resolve: {
      conditions: ['style'],
    },
  };
}

/**
 * Walks up from `startDir` looking for the nearest ancestor directory
 * containing a `package.json`, returning that file's path — the real
 * npm/pnpm/yarn package a file at or under `startDir` belongs to,
 * independent of directory *shape* (an Nx-integrated-style library with
 * no `package.json` of its own resolves to the very same package root as
 * the app consuming it) and independent of whether Vite handed a
 * `node_modules` symlink path or its resolved real one for a workspace
 * dependency that *does* have its own `package.json` (both paths sit
 * under that same package's real directory either way). Returns
 * `undefined` if none is found before the filesystem root.
 */
export function findNearestPackageJson(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    const candidate = resolve(dir, 'package.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Reads and fully resolves (following its own `extends` chain) the
 * nearest `tsconfig.json` to `startDir`, searching upward only as far as
 * `boundaryDir` (inclusive) — a different real package's own directory,
 * once a candidate file has already been found to belong to it rather
 * than to the app consuming it. Bounding the search this way keeps it
 * from walking *past* that package's own root and accidentally picking
 * up some unrelated ancestor tsconfig instead (the app's own, most
 * commonly, which is exactly the file this function exists to avoid
 * misapplying). Returns `undefined` if no `tsconfig.json` exists
 * anywhere in that range, or it fails to parse — a config a real build
 * can't resolve either isn't this function's problem to report.
 */
export function resolveNearestTsConfigOptions(
  startDir: string,
  boundaryDir: string,
): ts.CompilerOptions | undefined {
  const normalizedBoundary = resolve(boundaryDir);
  let dir = resolve(startDir);
  while (true) {
    const candidate = resolve(dir, 'tsconfig.json');
    if (existsSync(candidate)) {
      try {
        const { config } = ts.readConfigFile(candidate, ts.sys.readFile);
        return ts.parseJsonConfigFileContent(config, ts.sys, dirname(candidate))
          .options;
      } catch {
        return undefined;
      }
    }
    if (dir === normalizedBoundary) {
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
