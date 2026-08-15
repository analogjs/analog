import type { Plugin } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  injectDeferStreamingHook,
  inspectAngularCoreModule,
} from '../ssr/defer-streaming-plugin.js';

const DEFER_STREAMING_NAMESPACE = 'analog-defer-streaming';

/**
 * Esbuild delivery of the streaming-SSR patch (EXPERIMENTAL): applies
 * `injectDeferStreamingHook` to `@angular/core`'s `@defer` runtime
 * module in server bundles, so `renderStream` can flush blocks as they
 * resolve. The Angular build's own JS loader claims module loads and
 * cannot be chained, so the module carrying the runtime is captured at
 * resolve time into a private namespace (extensionless path, out of
 * reach of namespace-less `.mjs` filters) and served patched. Skips the
 * Angular babel pass for that one module — a no-op for correctness
 * (`@angular/core` ships fully compiled) at a small optimization cost.
 */
export function analogDeferStreamingPlugin(): Plugin {
  return {
    name: 'analog-defer-streaming',
    setup(build) {
      const isBrowser =
        build.initialOptions.define?.['ngServerMode'] !== 'true' &&
        build.initialOptions.platform !== 'node';
      if (isBrowser) {
        return;
      }

      let warnedDrift = false;
      const inspected = new Map<
        string,
        'not-target' | 'patchable' | 'drifted'
      >();

      build.onResolve({ filter: /\.mjs$/ }, (args) => {
        if (!args.resolveDir?.replace(/\\/g, '/').includes('/@angular/core/')) {
          return undefined;
        }

        const absPath = resolve(args.resolveDir, args.path).replace(/\\/g, '/');
        let kind = inspected.get(absPath);
        if (kind === undefined) {
          const info = inspectAngularCoreModule(readFileSync(absPath, 'utf8'));
          kind = info.kind;
          inspected.set(absPath, kind);
          if (kind === 'drifted' && !warnedDrift) {
            warnedDrift = true;
            console.warn(
              `[analog] experimental streaming SSR: found @angular/core's ` +
                `@defer runtime but could not apply the resolution hook ` +
                `(${(info as { reason: string }).reason}). Streaming will ` +
                `fall back to buffered rendering.`,
            );
          }
        }

        if (kind !== 'patchable') {
          return undefined;
        }

        return {
          path: absPath.replace(/\.mjs$/, ''),
          namespace: DEFER_STREAMING_NAMESPACE,
        };
      });

      build.onLoad(
        { filter: /.*/, namespace: DEFER_STREAMING_NAMESPACE },
        (args) => {
          const file = `${args.path}.mjs`;
          const code = readFileSync(file, 'utf8');
          return {
            contents: injectDeferStreamingHook(code) ?? code,
            loader: 'js',
            resolveDir: dirname(file),
            watchFiles: [file],
          };
        },
      );
    },
  };
}
