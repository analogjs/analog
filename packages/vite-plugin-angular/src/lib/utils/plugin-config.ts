import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import * as vite from 'vite';
import { defaultClientConditions } from 'vite';

import {
  createCompilerPlugin,
  createRolldownCompilerPlugin,
} from '../compiler-plugin.js';

/**
 * TypeScript file extension regex
 * Match .(c or m)ts, .ts extensions with an optional ? for query params
 * Ignore .tsx extensions
 */
export const TS_EXT_REGEX = /\.[cm]?(ts)[^x]?\??/;

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
    resolve: {
      conditions: ['style'],
    },
  };
}
