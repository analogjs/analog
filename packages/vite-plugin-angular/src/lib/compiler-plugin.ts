/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import type { Plugin, PluginBuild } from 'esbuild';

import { CompilerPluginOptions, JavaScriptTransformer } from './utils/devkit';

export function createCompilerPlugin(
  pluginOptions: CompilerPluginOptions
): Plugin {
  return {
    name: 'analogjs-angular-esbuild-deps-optimizer-plugin',
    async setup(build: PluginBuild): Promise<void> {
      const javascriptTransformer = new JavaScriptTransformer(pluginOptions, 1);

      build.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
        const contents = await javascriptTransformer.transformFile(args.path);

        return {
          contents,
          loader: 'js',
        };
      });

      build.onEnd(() => javascriptTransformer.close());
    },
  };
}
