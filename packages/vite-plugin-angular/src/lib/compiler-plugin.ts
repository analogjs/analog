/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { DepOptimizationConfig } from 'vite';

import {
  CompilerPluginOptions,
  JavaScriptTransformer,
} from './utils/devkit.js';

type EsbuildOptions = NonNullable<DepOptimizationConfig['esbuildOptions']>;
type EsbuildPlugin = NonNullable<EsbuildOptions['plugins']>[number];

export function createCompilerPlugin(
  pluginOptions: CompilerPluginOptions,
  isTest: boolean
): EsbuildPlugin {
  const javascriptTransformer = new JavaScriptTransformer(
    { ...pluginOptions, jit: true },
    1
  );

  return {
    name: 'analogjs-angular-esbuild-deps-optimizer-plugin',
    async setup(build) {
      if (!isTest) {
        build.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
          const contents = await javascriptTransformer.transformFile(args.path);

          return {
            contents,
            loader: 'js',
          };
        });
      }

      build.onEnd(() => javascriptTransformer.close());
    },
  };
}
