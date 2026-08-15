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
 * `@analogjs/router/api`. Browser bundles resolve it to an empty map so
 * server handler code never reaches the client build.
 */
export const API_ROUTES_ID = 'analog:api-routes';

const API_ROUTES_NAMESPACE = 'analog-api-routes';

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
    },
  };
}
