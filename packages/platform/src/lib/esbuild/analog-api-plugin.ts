import type { Plugin } from 'esbuild';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import { setupDiscoveryManifest } from './discovery-manifest.js';

/**
 * Module specifier server entries import to receive the discovered API
 * route files:
 *
 *   import apiRoutes from 'analog:api-routes';
 *
 * The map is passed to `createApiRoutesHandler` from
 * `@analogjs/router/ssr`. Browser bundles resolve it to an empty map so
 * server handler code never reaches the client build.
 */
export const API_ROUTES_ID = 'analog:api-routes';

/**
 * Module specifier for the discovered `src/server/middleware` files —
 * Nitro's global middleware convention. The map is consumed by
 * `createAnalogRequestHandler`, which runs each file's default handler
 * on every request ahead of everything else.
 */
export const SERVER_MIDDLEWARE_ID = 'analog:server-middleware';

const API_ROUTES_NAMESPACE = 'analog-api-routes';
const SERVER_MIDDLEWARE_NAMESPACE = 'analog-server-middleware';

export interface AnalogApiPluginOptions {
  workspaceRoot?: string;
  projectRoot?: string;
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

export function apiRoutesDir(root: string): string {
  return `${root}/src/server/routes`;
}

export function discoverApiRoutes(root: string): string[] {
  return globSync([`${apiRoutesDir(root)}/**/*.ts`], {
    dot: true,
    absolute: true,
  }).map(normalizeSlashes);
}

export function serverMiddlewareDir(root: string): string {
  return `${root}/src/server/middleware`;
}

export function discoverServerMiddleware(root: string): string[] {
  return globSync([`${serverMiddlewareDir(root)}/**/*.ts`], {
    dot: true,
    absolute: true,
  })
    .map(normalizeSlashes)
    .sort();
}

export function createApiRoutesModule(
  apiRoutes: string[],
  root: string,
): string {
  const entries = apiRoutes.map((file) => {
    const key = file.startsWith(root) ? file.replace(root, '') : file;
    return `  "${key}": () => import('${file}')`;
  });

  return `export default {\n${entries.join(',\n')}\n};\n`;
}

/**
 * Esbuild plugin that resolves the `analog:api-routes` virtual module
 * to a map of lazily imported h3 handlers from `src/server/routes`,
 * following the discovery-manifest pattern so adding or removing a
 * route file rebuilds in watch mode.
 */
export function analogApiPlugin(options?: AnalogApiPluginOptions): Plugin {
  const workspaceRoot = normalizeSlashes(
    options?.workspaceRoot ?? process.cwd(),
  );
  const root = normalizeSlashes(
    resolve(workspaceRoot, options?.projectRoot ?? '.'),
  );

  return {
    name: 'analog-api',
    setup(build) {
      const isBrowser =
        build.initialOptions.define?.['ngServerMode'] !== 'true' &&
        build.initialOptions.platform !== 'node';

      const manifestImport = setupDiscoveryManifest(
        `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/api-routes.json`,
        [apiRoutesDir(root)],
        () => discoverApiRoutes(root),
      );

      build.onResolve({ filter: /^analog:api-routes$/ }, () => ({
        path: API_ROUTES_ID,
        namespace: API_ROUTES_NAMESPACE,
      }));

      build.onLoad({ filter: /.*/, namespace: API_ROUTES_NAMESPACE }, () => ({
        contents: isBrowser
          ? 'export default {};\n'
          : manifestImport +
            createApiRoutesModule(discoverApiRoutes(root), root),
        loader: 'js',
        resolveDir: root,
        watchDirs: [apiRoutesDir(root)].filter((dir) => existsSync(dir)),
      }));

      const middlewareManifestImport = setupDiscoveryManifest(
        `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/server-middleware.json`,
        [serverMiddlewareDir(root)],
        () => discoverServerMiddleware(root),
      );

      build.onResolve({ filter: /^analog:server-middleware$/ }, () => ({
        path: SERVER_MIDDLEWARE_ID,
        namespace: SERVER_MIDDLEWARE_NAMESPACE,
      }));

      build.onLoad(
        { filter: /.*/, namespace: SERVER_MIDDLEWARE_NAMESPACE },
        () => ({
          contents: isBrowser
            ? 'export default {};\n'
            : middlewareManifestImport +
              createApiRoutesModule(discoverServerMiddleware(root), root),
          loader: 'js',
          resolveDir: root,
          watchDirs: [serverMiddlewareDir(root)].filter((dir) =>
            existsSync(dir),
          ),
        }),
      );
    },
  };
}
