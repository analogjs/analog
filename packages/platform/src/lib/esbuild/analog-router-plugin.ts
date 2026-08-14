import type { Plugin } from 'esbuild';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

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
    return `  "${key}": () => import('${file}')`;
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
  env: { DEV: boolean } & Record<string, unknown>,
): Record<string, string> {
  return { 'import.meta.env': JSON.stringify({ SSR: false, ...env }) };
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
      build.onResolve({ filter: /^analog:route-files$/ }, () => ({
        path: ROUTE_FILES_ID,
        namespace: ROUTE_FILES_NAMESPACE,
      }));

      build.onLoad({ filter: /.*/, namespace: ROUTE_FILES_NAMESPACE }, () => {
        const routeFiles = discoverRouteFiles(
          root,
          workspaceRoot,
          options?.additionalPagesDirs,
        );

        const watchDirs = [
          `${root}/app/routes`,
          `${root}/src/app/routes`,
          `${root}/src/app/pages`,
          ...(options?.additionalPagesDirs || []).map(
            (dir) => `${workspaceRoot}${dir}`,
          ),
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
