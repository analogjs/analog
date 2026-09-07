/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { DepOptimizationConfig, Rolldown } from 'vite';
import type { PluginBuild } from 'esbuild';
import { createJavaScriptTransformer } from './javascript-transformer.js';

import { CompilerPluginOptions } from './utils/devkit.js';
import type { Layer } from 'effect';
import type { TransformCache } from './utils/transform-cache.js';

type EsbuildOptions = NonNullable<DepOptimizationConfig['esbuildOptions']>;
type EsbuildPlugin = NonNullable<EsbuildOptions['plugins']>[number];

export interface DependencyCompilerOptions {
  compiler: CompilerPluginOptions;
  isTest: boolean;
  closeTransformer: boolean;
  own(finalizer: () => Promise<void>): void;
  cache?: Layer.Layer<TransformCache>;
}

export function createCompilerPlugin({
  compiler,
  isTest,
  closeTransformer,
  own,
  cache,
}: DependencyCompilerOptions): EsbuildPlugin {
  const javascriptTransformer = createJavaScriptTransformer(
    () => ({ ...compiler, jit: true }),
    cache,
  );
  own(javascriptTransformer.close);

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

export function createRolldownCompilerPlugin({
  compiler,
  isTest,
  closeTransformer,
  own,
  cache,
}: DependencyCompilerOptions): Rolldown.Plugin {
  const javascriptTransformer = createJavaScriptTransformer(
    () => ({ ...compiler, jit: true }),
    cache,
  );
  own(javascriptTransformer.close);

  const plugin: Rolldown.Plugin = {
    name: 'analogjs-rolldown-deps-optimizer-plugin',
  };

  if (!isTest) {
    plugin.load = {
      filter: {
        id: /\.[cm]?js$/,
      },
      async handler(id) {
        const contents = await javascriptTransformer.transformFile(id);

        return {
          code: Buffer.from(contents).toString('utf-8'),
        };
      },
    };
  }

  if (closeTransformer) {
    plugin.buildEnd = () => javascriptTransformer.close();
  }

  return plugin;
}
