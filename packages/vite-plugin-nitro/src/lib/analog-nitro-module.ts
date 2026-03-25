/**
 * Proof-of-concept: Analog as a Nitro Module
 *
 * This module demonstrates how @analogjs/vite-plugin-nitro's core
 * functionality would be expressed as a NitroModule that plugs into
 * Nitro's first-party Vite plugin (`nitro/vite`).
 *
 * Instead of manually creating Nitro instances and orchestrating builds,
 * this module hooks into an existing Nitro instance via `setup()` and
 * configures Angular-specific behavior through Nitro's hook system.
 *
 * Usage with nitro/vite:
 *
 * ```ts
 * import { nitro } from 'nitro/vite';
 * import { analogNitroModule } from '@analogjs/vite-plugin-nitro/module';
 *
 * export default defineConfig({
 *   plugins: [
 *     nitro({ preset: 'node-server' }),
 *     {
 *       name: '@analogjs/nitro',
 *       nitro: analogNitroModule({ ssr: true, prerender: { routes: ['/'] } }),
 *     },
 *   ],
 * });
 * ```
 */
import type { NitroEventHandler } from 'nitro/types';
import { resolve } from 'node:path';

import type { Options } from './options.js';
import { getPageHandlers } from './utils/get-page-handlers.js';
import { ssrRenderer, clientRenderer } from './utils/renderers.js';

interface NitroModule {
  name?: string;
  setup: (nitro: any) => void | Promise<void>;
}

export function analogNitroModule(options: Options = {}): NitroModule {
  return {
    name: 'analog',
    async setup(nitro) {
      const rootDir = options.workspaceRoot || process.cwd();
      const sourceRoot = options.sourceRoot || 'src';

      // --- Renderer ---
      // Register SSR or client-only renderer as the catch-all handler.
      const rendererCode =
        options.ssr !== false ? ssrRenderer() : clientRenderer();

      nitro.options.virtual = nitro.options.virtual || {};
      nitro.options.virtual['#analog/renderer'] = rendererCode;

      nitro.options.renderer = nitro.options.renderer || {};
      (nitro.options.renderer as any).handler = '#analog/renderer';

      // --- Page Endpoint Handlers ---
      // Discover .server.ts files and register them as Nitro handlers.
      const pageHandlers = await getPageHandlers(
        resolve(rootDir, sourceRoot),
        resolve(rootDir, sourceRoot, 'app/pages'),
        options.additionalPagesDirs,
      );
      nitro.options.handlers = nitro.options.handlers || [];
      nitro.options.handlers.push(...pageHandlers);

      // --- API Routes ---
      // Add API route directories to Nitro's scan dirs.
      const serverDir = resolve(rootDir, sourceRoot, 'server');
      nitro.options.scanDirs = nitro.options.scanDirs || [];
      nitro.options.scanDirs.push(serverDir);
      if (options.additionalAPIDirs) {
        for (const dir of options.additionalAPIDirs) {
          nitro.options.scanDirs.push(resolve(rootDir, dir));
        }
      }

      // --- Prerendering ---
      if (options.prerender?.routes) {
        nitro.hooks.hook('prerender:routes', (routes: Set<string>) => {
          const prerenderRoutes = options.prerender!.routes!;
          for (const route of prerenderRoutes) {
            if (typeof route === 'string') {
              routes.add(route);
            } else {
              routes.add(route.route);
            }
          }
        });
      }

      // --- Externals for Prerendering ---
      // Angular packages need to be external during prerendering
      // to avoid bundling issues with zone.js, rxjs, etc.
      nitro.hooks.hook('rollup:before', (_n: unknown, config: any) => {
        const externals = ['rxjs', 'zone.js'];
        const existing = config.external;
        if (typeof existing === 'function') {
          config.external = (source: string) => {
            if (
              externals.some((e) => source === e || source.startsWith(e + '/'))
            ) {
              return true;
            }
            return existing(source);
          };
        } else if (Array.isArray(existing)) {
          config.external = [...existing, ...externals];
        } else {
          config.external = externals;
        }
      });
    },
  };
}
