import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import * as vite from 'vite';

import {
  createCompilerPlugin,
  createRolldownCompilerPlugin,
} from '../compiler-plugin.js';

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

  if (!existsSync(resolvedPath)) {
    console.error(
      `[@analogjs/vite-plugin-angular]: Unable to resolve tsconfig at ${resolvedPath}. This causes compilation issues. Check the path or set the "tsconfig" property with an absolute path.`,
    );
  }

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

  const rolldownOptions: vite.DepOptimizationOptions['rolldownOptions'] = {
    plugins: [
      createRolldownCompilerPlugin({
        tsconfig: opts.tsconfig,
        sourcemap: !opts.isProd,
        advancedOptimizations: opts.isProd,
        jit: opts.jit,
        incremental: opts.watchMode,
      }),
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
  };
}
