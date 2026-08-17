import type { Plugin } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';
import { parseSync } from 'oxc-parser';

import { discoverContentFiles } from './analog-content-plugin.js';
import { setupDiscoveryManifest } from './discovery-manifest.js';

/**
 * Module specifier applications import to receive the discovered
 * route files map:
 *
 *   import routeFiles from 'analog:route-files';
 *
 * The injected boot module registers the map for `provideFileRouter`
 * to fold in at DI time.
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

  // Build-time route metadata: the server route configuration and the
  // request handler are both built before any page module loads, so the
  // per-page settings they need are extracted here.
  const metaEntries = routeFiles.flatMap((file) => {
    if (file.endsWith('.md')) {
      return [];
    }
    const meta = readRouteMetaFlags(file);
    if (Object.keys(meta).length === 0) {
      return [];
    }
    const key = file.startsWith(root) ? file.replace(root, '') : file;
    return [`  "${key}": ${JSON.stringify(meta)}`];
  });

  return (
    `export default {\n${entries.join(',\n')}\n};\n\n` +
    `export const routeFilesMeta = {\n${metaEntries.join(',\n')}\n};\n`
  );
}

export interface RouteMetaFlags {
  /** `routeMeta.prerender: false` — render this page per request. */
  prerender?: boolean;
  /** `routeMeta.streaming: true` — render through renderStream. */
  streaming?: boolean;
}

/**
 * Reads the boolean routeMeta flags the build needs from a page file's
 * AST, rather than by executing the module — only literals are honored,
 * matching how the server-fn transforms read call shapes. `streaming`
 * implies `prerender: false`, since a streamed page needs a live
 * request.
 */
export function readRouteMetaFlags(file: string): RouteMetaFlags {
  const code = readFileSync(file, 'utf8');
  if (!code.includes('routeMeta')) {
    return {};
  }

  const flags: RouteMetaFlags = {};
  const { program } = parseSync(file, code);
  for (const node of (program as { body: any[] }).body) {
    if (
      node.type !== 'ExportNamedDeclaration' ||
      node.declaration?.type !== 'VariableDeclaration'
    ) {
      continue;
    }
    for (const declarator of node.declaration.declarations) {
      if (
        declarator.id?.type !== 'Identifier' ||
        declarator.id.name !== 'routeMeta' ||
        declarator.init?.type !== 'ObjectExpression'
      ) {
        continue;
      }
      for (const prop of declarator.init.properties ?? []) {
        const key =
          prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value;
        if (prop.type !== 'Property' || prop.value?.type !== 'Literal') {
          continue;
        }
        if (key === 'prerender' && prop.value.value === false) {
          flags.prerender = false;
        } else if (key === 'streaming' && prop.value.value === true) {
          flags.streaming = true;
          flags.prerender = false;
        }
      }
    }
  }
  return flags;
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
  // PROD is the complement of DEV, as on the Vite path — consumers read
  // both (e.g. renderStream's enableProdMode guard).
  return { 'import.meta.env': JSON.stringify({ PROD: !env.DEV, ...env }) };
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
 * regenerated on rebuilds, and a discovery manifest kept fresh by a
 * filesystem watcher makes adding or removing a route file trigger a
 * rebuild in watch mode and the dev server.
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
  const watchDirs = [
    `${root}/app/routes`,
    `${root}/src/app/routes`,
    `${root}/src/app/pages`,
    `${root}/src/content`,
    ...[
      ...(options?.additionalPagesDirs || []),
      ...(options?.additionalContentDirs || []),
    ].map((dir) => `${workspaceRoot}${dir}`),
  ];

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

      // Not under a dot-directory: the Angular watcher ignores those.
      const manifestImport = setupDiscoveryManifest(
        `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/route-files.json`,
        watchDirs,
        () => [
          ...discoverRouteFiles(
            root,
            workspaceRoot,
            options?.additionalPagesDirs,
          ),
          ...discoverContentFiles(
            root,
            workspaceRoot,
            options?.additionalContentDirs,
          ),
        ],
      );

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

        return {
          // The manifest import makes route discovery a watchable build
          // input, so adding or removing a route file rebuilds.
          contents: manifestImport + createRouteFilesModule(routeFiles, root),
          loader: 'js',
          resolveDir: root,
          // For esbuild's native watch mode.
          watchDirs: watchDirs.filter((dir) => existsSync(dir)),
        };
      });
    },
  };
}
