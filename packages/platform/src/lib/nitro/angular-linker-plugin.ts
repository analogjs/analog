import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { PluginItem, transformAsync } from '@babel/core';
import type { Plugin, SourceMapInput } from 'rolldown';

const require = createRequire(import.meta.url);

type BabelCore = { transformAsync: typeof transformAsync };

/**
 * Loads the `@babel/core` release that `@angular/compiler-cli` depends on.
 * The linker Babel plugin asserts the Babel major it was built against
 * (Angular 22.0 needs Babel 7, Angular 22.1+ needs Babel 8), so resolving
 * through compiler-cli keeps both in sync, including in strict pnpm layouts.
 */
async function loadBabel(): Promise<BabelCore> {
  const compilerCliRequire = createRequire(
    require.resolve('@angular/compiler-cli/package.json'),
  );
  const babelEntry = compilerCliRequire.resolve('@babel/core');
  const babel = await import(pathToFileURL(babelEntry).href);
  return babel.transformAsync ? babel : babel.default;
}

/**
 * Rolldown plugin that runs the Angular Linker against partially-compiled
 * Angular npm packages.
 *
 * Wired into `ssr.optimizeDeps.rolldownOptions.plugins` so the SSR /
 * `nitro` environment's dep optimizer turns `ɵɵngDeclare*` partial
 * declarations into fully-compiled definitions. Without this, the
 * server bundle would need JIT (eval) at runtime — forbidden on
 * `workerd` / edge runtimes and unnecessary anywhere else.
 *
 * Loaded lazily so apps that never trigger the SSR optimizer don't
 * incur the babel + compiler-cli/linker cost.
 */
export function angularLinkerPlugin(): Plugin {
  let linkerBabelPlugin: PluginItem | undefined;
  let needsLinkingFn: ((id: string, code: string) => boolean) | undefined;
  let transformAsyncFn: BabelCore['transformAsync'] | undefined;

  async function ensureLoaded() {
    if (linkerBabelPlugin && needsLinkingFn && transformAsyncFn) return;

    const linker = await import('@angular/compiler-cli/linker');
    needsLinkingFn = linker.needsLinking;

    const linkerBabel = await import('@angular/compiler-cli/linker/babel');
    linkerBabelPlugin =
      (linkerBabel as { default?: PluginItem }).default ??
      (linkerBabel as PluginItem);

    transformAsyncFn = (await loadBabel()).transformAsync;
  }

  return {
    name: 'analogjs-platform-angular-linker',
    async transform(code: string, id: string) {
      if (!id.endsWith('.mjs') && !id.endsWith('.js')) return;

      // Cheap pre-check before pulling babel/compiler-cli into memory.
      if (!code.includes('ɵɵngDeclare')) return;

      await ensureLoaded();
      if (!needsLinkingFn!(id, code)) return;

      const result = await transformAsyncFn!(code, {
        filename: id,
        plugins: [linkerBabelPlugin!],
        sourceMaps: true,
        compact: false,
        configFile: false,
        babelrc: false,
      });

      if (result?.code) {
        return {
          code: result.code,
          map: (result.map ?? null) as SourceMapInput,
        };
      }
      return;
    },
  };
}
