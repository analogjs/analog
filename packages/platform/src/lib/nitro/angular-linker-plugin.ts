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
export function angularLinkerPlugin() {
  let linkerBabelPlugin: unknown;
  let needsLinkingFn: ((id: string, code: string) => boolean) | undefined;
  let transformAsyncFn:
    | ((
        code: string,
        options: Record<string, unknown>,
      ) => Promise<{ code?: string; map?: unknown } | null>)
    | undefined;

  async function ensureLoaded() {
    if (linkerBabelPlugin && needsLinkingFn && transformAsyncFn) return;

    const linker = await import('@angular/compiler-cli/linker');
    needsLinkingFn = linker.needsLinking;

    const linkerBabel = await import('@angular/compiler-cli/linker/babel');
    linkerBabelPlugin =
      (linkerBabel as { default?: unknown }).default ?? linkerBabel;

    // @ts-expect-error — @babel/core ships without bundled type declarations
    const babel = await import('@babel/core');
    transformAsyncFn = babel.transformAsync;
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
        plugins: [linkerBabelPlugin],
        sourceMaps: true,
        compact: false,
        configFile: false,
        babelrc: false,
      });

      if (result?.code) {
        return { code: result.code, map: result.map ?? null };
      }
      return;
    },
  };
}
