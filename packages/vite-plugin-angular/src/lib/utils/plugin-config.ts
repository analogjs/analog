import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
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
