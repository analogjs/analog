import type { Plugin } from 'rolldown';
import { extractInlineSourceMap } from './angular-build-optimizer-plugin.js';
import { JavaScriptTransformer } from './utils/devkit.js';

/**
 * Rolldown plugin that links partially-compiled Angular packages through
 * `@angular/build`'s JavaScript transformer, which uses Angular's native
 * (OXC) linker on 22.2+ and the Babel linker on older versions.
 *
 * Intended for dep optimizers (e.g. the SSR / `nitro` environment) so the
 * server bundle doesn't need JIT at runtime, which edge runtimes forbid.
 */
export function angularLinkerPlugin(): Plugin {
  let transformer: InstanceType<typeof JavaScriptTransformer> | undefined;

  return {
    name: '@analogjs/vite-plugin-angular-linker',
    async transform(code, id) {
      if (!/\.m?js$/.test(id) || !code.includes('ɵɵngDeclare')) return;

      transformer ??= new JavaScriptTransformer(
        { sourcemap: true, thirdPartySourcemaps: true },
        1,
      );
      const result = Buffer.from(
        await transformer.transformData(id, code, false),
      ).toString();

      return result === code ? undefined : extractInlineSourceMap(result, id);
    },
    async buildEnd() {
      await transformer?.close();
      transformer = undefined;
    },
  };
}
