import type { Plugin } from 'esbuild';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import { discoverContentFiles } from './analog-content-plugin.js';

/**
 * Module specifier applications import to receive the discovered
 * route files map:
 *
 *   import routeFiles from 'analog:route-files';
 *
 * The map is passed to `provideFileRouter(withRouteFiles(routeFiles))`.
 */
export const ROUTE_FILES_ID = 'analog:route-files';

const ROUTE_FILES_NAMESPACE = 'analog-route-files';

export interface AnalogRouterPluginOptions {
  /**
   * Workspace root. Defaults to process.cwd().
   */
  workspaceRoot?: string;
  /**
   * Project root containing the app source, relative to or resolved
   * against the workspace root. Defaults to the workspace root.
   */
  projectRoot?: string;
  /**
   * Additional directories relative to the workspace root
   * to scan for page routes.
   */
  additionalPagesDirs?: string[];
  /**
   * Additional directories relative to the workspace root
   * to scan for markdown content routes.
   */
  additionalContentDirs?: string[];
  /**
   * Value of `import.meta.env.DEV` in the bundle. Defaults to false.
   */
  dev?: boolean;
  /**
   * Extra `import.meta.env` values, e.g. VITE_ANALOG_PUBLIC_BASE_URL.
   */
  env?: Record<string, unknown>;
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Discovers route files on the filesystem using the same globs as the
 * Vite router plugin. Markdown content routes are not yet supported
 * in the esbuild integration.
 */
export function discoverRouteFiles(
  root: string,
  workspaceRoot: string,
  additionalPagesDirs?: string[],
): string[] {
  return globSync(
    [
      `${root}/app/routes/**/*.ts`,
      `${root}/src/app/routes/**/*.ts`,
      `${root}/src/app/pages/**/*.page.ts`,
      ...(additionalPagesDirs || []).map(
        (glob) => `${workspaceRoot}${glob}/**/*.page.ts`,
      ),
    ],
    { dot: true, absolute: true },
  ).map(normalizeSlashes);
}

/**
 * Generates the virtual module source for the route files map. Keys use
 * the same normalization as the Vite router plugin: project files are
 * keyed relative to the project root, files outside it keep absolute
 * paths. Values are dynamic imports so esbuild code-splits each route
 * into a lazy chunk.
 */
export function createRouteFilesModule(
  routeFiles: string[],
  root: string,
): string {
  const entries = routeFiles.map((file) => {
    const key = file.startsWith(root) ? file.replace(root, '') : file;
    // Markdown route modules resolve to the raw content string, matching
    // the Vite ?analog-content-file=true import shape that createRoutes
    // hands to toMarkdownModule.
    return file.endsWith('.md')
      ? `  "${key}": () => import('${file}').then((m) => m.default)`
      : `  "${key}": () => import('${file}')`;
  });

  return `export default {\n${entries.join(',\n')}\n};\n`;
}

/**
 * `define` entries required by @analogjs/router at runtime outside of
 * Vite. The whole `import.meta.env` object is replaced so bracket access
 * (e.g. import.meta.env['VITE_ANALOG_PUBLIC_BASE_URL']) is covered along
 * with dotted access like import.meta.env.DEV.
 */
export function routerDefine(
  env: { DEV: boolean; SSR: boolean } & Record<string, unknown>,
): Record<string, string> {
  return { 'import.meta.env': JSON.stringify(env) };
}

/**
 * The application builder emits a browser and a server bundle from one
 * set of options, so `SSR` cannot come from the shared `define`. Angular
 * marks the server bundle by overriding `ngServerMode`, which is the
 * same signal used here.
 */
function isServerBundle(initialOptions: {
  define?: Record<string, string>;
  platform?: string;
}): boolean {
  return (
    initialOptions.define?.['ngServerMode'] === 'true' ||
    initialOptions.platform === 'node'
  );
}

/**
 * Esbuild plugin that resolves the `analog:route-files` virtual module
 * to a map of lazily imported route files. The route file map is
 * regenerated on rebuilds, and the page directories are registered as
 * watch directories so adding or removing a page triggers a rebuild
 * in watch mode.
 */
export function analogRouterPlugin(
  options?: AnalogRouterPluginOptions,
): Plugin {
  const workspaceRoot = normalizeSlashes(
    options?.workspaceRoot ?? process.cwd(),
  );
  const root = normalizeSlashes(
    resolve(workspaceRoot, options?.projectRoot ?? '.'),
  );

  return {
    name: 'analog-router',
    setup(build) {
      // setup() runs once per esbuild build, so the browser and server
      // bundles each get their own import.meta.env.
      build.initialOptions.define = {
        ...build.initialOptions.define,
        ...routerDefine({
          DEV: options?.dev ?? false,
          SSR: isServerBundle(build.initialOptions),
          ...options?.env,
        }),
      };

      build.onResolve({ filter: /^analog:route-files$/ }, () => ({
        path: ROUTE_FILES_ID,
        namespace: ROUTE_FILES_NAMESPACE,
      }));

      build.onLoad({ filter: /.*/, namespace: ROUTE_FILES_NAMESPACE }, () => {
        const routeFiles = [
          ...discoverRouteFiles(
            root,
            workspaceRoot,
            options?.additionalPagesDirs,
          ),
          // Markdown content routes merge into the same map, mirroring
          // ANALOG_CONTENT_ROUTE_FILES in the Vite router plugin. Loading
          // .md imports requires analogContentPlugin to be registered.
          ...discoverContentFiles(
            root,
            workspaceRoot,
            options?.additionalContentDirs,
          ),
        ];

        const watchDirs = [
          `${root}/app/routes`,
          `${root}/src/app/routes`,
          `${root}/src/app/pages`,
          `${root}/src/content`,
          ...[
            ...(options?.additionalPagesDirs || []),
            ...(options?.additionalContentDirs || []),
          ].map((dir) => `${workspaceRoot}${dir}`),
        ].filter((dir) => existsSync(dir));

        return {
          contents: createRouteFilesModule(routeFiles, root),
          loader: 'js',
          resolveDir: root,
          watchDirs,
        };
      });
    },
  };
}
