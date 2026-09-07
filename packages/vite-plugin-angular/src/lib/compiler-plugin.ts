/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import type { DepOptimizationConfig, Rolldown } from 'vite';
import type { PluginBuild } from 'esbuild';
import { Context, Effect, Fiber, Layer, ManagedRuntime } from 'effect';

import {
  CompilerPluginOptions,
  JavaScriptTransformer,
} from './utils/devkit.js';
import type { TransformCacheStore } from './utils/transform-cache.js';

type EsbuildOptions = NonNullable<DepOptimizationConfig['esbuildOptions']>;
type EsbuildPlugin = NonNullable<EsbuildOptions['plugins']>[number];

export interface DependencyCompilerOptions {
  compiler: CompilerPluginOptions;
  isTest: boolean;
  closeTransformer: boolean;
  cache?: TransformCacheStore;
}

interface Transformer {
  transformFile(file: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

class DependencyTransformer extends Context.Service<
  DependencyTransformer,
  { transformFile: (file: string) => Effect.Effect<Uint8Array> }
>()('@analogjs/vite-plugin-angular/DependencyTransformer') {}

function createTransformer(
  options: CompilerPluginOptions,
  cache?: TransformCacheStore,
) {
  const layer = Layer.effect(
    DependencyTransformer,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const transformer = yield* Effect.acquireRelease(
        Effect.sync(
          (): Transformer =>
            new JavaScriptTransformer({ ...options, jit: true }, 1, cache),
        ),
        (value) => Effect.promise(() => value.close()),
      );
      return DependencyTransformer.of({
        transformFile: (file) =>
          Effect.promise(() => transformer.transformFile(file)).pipe(
            Effect.uninterruptible,
            Effect.forkIn(scope),
            Effect.flatMap(Fiber.join),
          ),
      });
    }),
  );
  let runtime:
    | ManagedRuntime.ManagedRuntime<DependencyTransformer, never>
    | undefined;
  return {
    transformFile(file: string): Promise<Uint8Array> {
      runtime ??= ManagedRuntime.make(layer);
      return runtime.runPromise(
        Effect.flatMap(DependencyTransformer, (transformer) =>
          transformer.transformFile(file),
        ),
      );
    },
    async close(): Promise<void> {
      const current = runtime;
      runtime = undefined;
      await current?.dispose();
    },
  };
}

export function createCompilerPlugin({
  compiler,
  isTest,
  closeTransformer,
  cache,
}: DependencyCompilerOptions): EsbuildPlugin {
  const javascriptTransformer = createTransformer(compiler, cache);

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
  cache,
}: DependencyCompilerOptions): Rolldown.Plugin {
  const javascriptTransformer = createTransformer(compiler, cache);

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
          loader: 'js',
        } as any;
      },
    };
  }

  if (closeTransformer) {
    plugin.buildEnd = () => javascriptTransformer.close();
  }

  return plugin;
}
