import type { Plugin } from 'esbuild';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import { setupDiscoveryManifest } from './discovery-manifest.js';

/**
 * Module specifier for the discovered `.server.ts` page endpoints:
 *
 *   import pageEndpoints from 'analog:page-endpoints';
 *
 * Server bundles receive lazy imports for
 * `createPageEndpointsHandler`; browser bundles receive the same keys
 * mapped to `true` — enough for `withPageEndpoints` to mark which
 * routes fetch server load data, with no server code in the client.
 */
export const PAGE_ENDPOINTS_ID = 'analog:page-endpoints';

const PAGE_ENDPOINTS_NAMESPACE = 'analog-page-endpoints';

export interface AnalogPageEndpointsPluginOptions {
  workspaceRoot?: string;
  projectRoot?: string;
  additionalPagesDirs?: string[];
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

export function discoverPageEndpoints(
  root: string,
  workspaceRoot: string,
  additionalPagesDirs?: string[],
): string[] {
  return globSync(
    [
      `${root}/src/app/pages/**/*.server.ts`,
      ...(additionalPagesDirs || []).map(
        (glob) => `${workspaceRoot}${glob}/**/*.server.ts`,
      ),
    ],
    { dot: true, absolute: true },
  ).map(normalizeSlashes);
}

export function createPageEndpointsModule(
  endpointFiles: string[],
  root: string,
  browser: boolean,
): string {
  const entries = endpointFiles.map((file) => {
    const key = file.startsWith(root) ? file.replace(root, '') : file;
    return browser ? `  "${key}": true` : `  "${key}": () => import('${file}')`;
  });

  return `export default {\n${entries.join(',\n')}\n};\n`;
}

/**
 * Esbuild plugin that resolves the `analog:page-endpoints` virtual
 * module, following the discovery-manifest pattern so adding or
 * removing a `.server.ts` file rebuilds in watch mode.
 */
export function analogPageEndpointsPlugin(
  options?: AnalogPageEndpointsPluginOptions,
): Plugin {
  const workspaceRoot = normalizeSlashes(
    options?.workspaceRoot ?? process.cwd(),
  );
  const root = normalizeSlashes(
    resolve(workspaceRoot, options?.projectRoot ?? '.'),
  );

  return {
    name: 'analog-page-endpoints',
    setup(build) {
      const isBrowser =
        build.initialOptions.define?.['ngServerMode'] !== 'true' &&
        build.initialOptions.platform !== 'node';

      const manifestImport = setupDiscoveryManifest(
        `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/page-endpoints.json`,
        [`${root}/src/app/pages`],
        () =>
          discoverPageEndpoints(
            root,
            workspaceRoot,
            options?.additionalPagesDirs,
          ),
      );

      build.onResolve({ filter: /^analog:page-endpoints$/ }, () => ({
        path: PAGE_ENDPOINTS_ID,
        namespace: PAGE_ENDPOINTS_NAMESPACE,
      }));

      build.onLoad(
        { filter: /.*/, namespace: PAGE_ENDPOINTS_NAMESPACE },
        () => ({
          contents:
            manifestImport +
            createPageEndpointsModule(
              discoverPageEndpoints(
                root,
                workspaceRoot,
                options?.additionalPagesDirs,
              ),
              root,
              isBrowser,
            ),
          loader: 'js',
          resolveDir: root,
          watchDirs: [`${root}/src/app/pages`].filter((dir) => existsSync(dir)),
        }),
      );
    },
  };
}
