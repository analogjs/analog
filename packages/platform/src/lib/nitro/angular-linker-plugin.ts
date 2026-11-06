import { createRequire } from 'node:module';

import type { JavaScriptTransformer } from '@angular/build/private';
import type { Plugin } from 'rolldown';

// Resolve `@angular/build` through `@analogjs/vite-plugin-angular`, which
// declares it as a peer, so strict pnpm layouts find the consumer's copy.
const require = createRequire(
  createRequire(import.meta.url).resolve(
    '@analogjs/vite-plugin-angular/package.json',
  ),
);

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
 * Links through `@angular/build`'s JavaScript transformer, which uses
 * Angular's native (OXC) linker on 22.2+ and the Babel linker before that.
 * The constructor and `transformData` calls stay within the subset shared
 * by every supported `@angular/build` version.
 */
export function angularLinkerPlugin(): Plugin {
  let transformer: JavaScriptTransformer | undefined;

  return {
    name: 'analogjs-platform-angular-linker',
    async transform(code: string, id: string) {
      if (!id.endsWith('.mjs') && !id.endsWith('.js')) return;

      // Cheap pre-check before starting the transformer's worker pool.
      if (!code.includes('ɵɵngDeclare')) return;

      transformer ??= new (require('@angular/build/private')
        .JavaScriptTransformer as typeof JavaScriptTransformer)({
        sourcemap: true,
        thirdPartySourcemaps: true,
        maxConcurrency: 1,
      });
      const result = Buffer.from(
        await transformer.transformData(id, code),
      ).toString();

      return result === code ? undefined : splitInlineSourceMap(result);
    },
    async buildEnd() {
      await transformer?.close();
      transformer = undefined;
    },
  };
}

function splitInlineSourceMap(code: string): { code: string; map?: string } {
  const match = code.match(
    /\n?\/\/# sourceMappingURL=data:application\/json(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)\s*$/,
  );
  if (match?.index === undefined) return { code };
  return {
    code: code.slice(0, match.index),
    map: Buffer.from(match[1]!, 'base64').toString(),
  };
}
