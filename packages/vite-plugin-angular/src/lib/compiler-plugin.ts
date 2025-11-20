/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { DepOptimizationConfig, Rolldown } from 'vite';
import type { PluginBuild } from 'esbuild';

import {
  CompilerPluginOptions,
  JavaScriptTransformer,
} from './utils/devkit.js';

type EsbuildOptions = NonNullable<DepOptimizationConfig['esbuildOptions']>;
type EsbuildPlugin = NonNullable<EsbuildOptions['plugins']>[number];

export function createCompilerPlugin(
  pluginOptions: CompilerPluginOptions,
  isTest: boolean,
  closeTransformer: boolean,
): EsbuildPlugin {
  const javascriptTransformer = new JavaScriptTransformer(
    { ...pluginOptions, jit: true },
    1,
  );

  return {
    name: 'analogjs-angular-esbuild-deps-optimizer-plugin',
    async setup(build: PluginBuild) {
      if (!isTest) {
        build.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
          const contents = await javascriptTransformer.transformFile(args.path);

          return {
            contents,
            loader: 'js',
          };
        });
      }

      if (closeTransformer) {
        build.onEnd(() => javascriptTransformer.close());
      }
    },
  };
}

export function createRolldownCompilerPlugin(
  pluginOptions: CompilerPluginOptions,
): Rolldown.Plugin {
  const javascriptTransformer = new JavaScriptTransformer(
    { ...pluginOptions, jit: true },
    1,
  );
  return {
    name: 'analogjs-rolldown-deps-optimizer-plugin',
    async load(id) {
      if (/\.[cm]?js$/.test(id)) {
        const contents = await javascriptTransformer.transformFile(id);

        return {
          code: Buffer.from(contents).toString('utf-8'),
          loader: 'js',
        } as any;
      }

      return;
    },
  };
}
