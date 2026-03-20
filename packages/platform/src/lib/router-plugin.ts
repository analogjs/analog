import { normalizePath, Plugin, UserConfig, ViteDevServer } from 'vite';
import { globSync } from 'tinyglobby';
import { resolve } from 'node:path';

import { Options } from './options.js';

/**
 * Router plugin that handles route file discovery and hot module replacement.
 *
 * This plugin provides three main functionalities:
 * 1. Route invalidation when files are added/deleted (HMR workaround)
 * 2. Dynamic route file discovery and import generation
 * 3. Content route file discovery for markdown and Analog content
 *
 * @param options Configuration options for the router plugin
 * @returns Array of Vite plugins for route handling
 *
 * IMPORTANT: This plugin uses tinyglobby for file discovery.
 * Key behavior with { dot: true, absolute: true }:
 * - Returns absolute paths for ALL discovered files
 * - Path normalization is required to match expected output format
 * - Files within project root must use relative paths in object keys
 * - Files outside project root keep absolute paths in object keys
 */
export function routerPlugin(options?: Options): Plugin[] {
  const workspaceRoot = normalizePath(options?.workspaceRoot ?? process.cwd());
  let config: UserConfig;
  let root: string;
  // These lists are used repeatedly by transform hooks during serve. Keeping
  // them warm avoids a full glob on every route/content invalidation.
  let routeFilesCache: string[] | undefined;
  let contentRouteFilesCache: string[] | undefined;
  let endpointFilesCache: string[] | undefined;
  const isRouteLikeFile = (path: string) =>
    path.includes('/routes/') ||
    path.includes('/pages/') ||
    path.includes('/content/');
  const discoverRouteFiles = () => {
    routeFilesCache ??= globSync(
      [
        `${root}/app/routes/**/*.ts`,
        `${root}/src/app/routes/**/*.ts`,
        `${root}/src/app/pages/**/*.page.ts`,
        ...(options?.additionalPagesDirs || []).map(
          (glob) => `${workspaceRoot}${glob}/**/*.page.ts`,
        ),
      ],
      { dot: true, absolute: true },
    );

    return routeFilesCache;
  };
  const discoverContentRouteFiles = () => {
    contentRouteFilesCache ??= globSync(
      [
        `${root}/src/app/routes/**/*.md`,
        `${root}/src/app/pages/**/*.md`,
        `${root}/src/content/**/*.md`,
        ...(options?.additionalContentDirs || []).map(
          (glob) => `${workspaceRoot}${glob}/**/*.md`,
        ),
      ],
      { dot: true, absolute: true },
    );

    return contentRouteFilesCache;
  };
  const discoverEndpointFiles = () => {
    endpointFilesCache ??= globSync(
      [
        `${root}/src/app/pages/**/*.server.ts`,
        ...(options?.additionalPagesDirs || []).map(
          (glob) => `${workspaceRoot}${glob}/**/*.server.ts`,
        ),
      ],
      { dot: true, absolute: true },
    );

    return endpointFilesCache;
  };
  const invalidateDiscoveryCaches = () => {
    routeFilesCache = undefined;
    contentRouteFilesCache = undefined;
    endpointFilesCache = undefined;
  };
  const invalidateFileModules = (server: ViteDevServer, path: string) => {
    const normalizedPath = normalizePath(path);
    // A newly added page can be discovered before its final contents settle.
    // Invalidate the page module itself so later edits don't keep serving the
    // first incomplete transform from Vite's module graph.
    const fileModules =
      server.moduleGraph.getModulesByFile?.(normalizedPath) ??
      server.moduleGraph.fileToModulesMap.get(normalizedPath);

    fileModules?.forEach((mod) => {
      server.moduleGraph.invalidateModule(mod);

      mod.importers.forEach((imp) => {
        server.moduleGraph.invalidateModule(imp);
      });
    });
  };

  return [
    {
      name: 'analogjs-router-invalidate-routes',
      configureServer(server) {
        /**
         * Invalidates route modules when files are added or deleted.
         * This is a workaround for Vite's HMR limitations with dynamic imports.
         *
         * @param path The file path that was added or deleted
         */
        function invalidateRoutes(
          path: string,
          event: 'add' | 'change' | 'unlink',
        ) {
          if (!isRouteLikeFile(path)) {
            return;
          }

          // Add/remove changes the route graph shape, so the discovery caches
          // must be rebuilt. Plain edits can keep using the current file set.
          if (event !== 'change') {
            invalidateDiscoveryCaches();
          }

          invalidateFileModules(server, path);

          // For an in-place edit we only need module invalidation. Keeping the
          // app alive here lets Angular/Vite attempt the narrower HMR path.
          if (event === 'change') {
            return;
          }

          server.moduleGraph.fileToModulesMap.forEach((mods) => {
            mods.forEach((mod) => {
              if (mod.id?.includes('analogjs') && mod.id?.includes('fesm')) {
                server.moduleGraph.invalidateModule(mod);

                mod.importers.forEach((imp) => {
                  server.moduleGraph.invalidateModule(imp);
                });
              }
            });
          });

          server.ws.send({
            type: 'full-reload',
          });
        }

        server.watcher.on('add', (path) => invalidateRoutes(path, 'add'));
        server.watcher.on('change', (path) => invalidateRoutes(path, 'change'));
        server.watcher.on('unlink', (path) => invalidateRoutes(path, 'unlink'));
      },
    },
    {
      name: 'analog-glob-routes',
      // enforce: 'post' ensures this transform runs AFTER the Angular compiler
      // plugin, which replaces module content with its own compiled output.
      // Without this, the Angular plugin would overwrite the route replacements.
      enforce: 'post',
      config(_config) {
        config = _config;
        root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
      },
      /**
       * Transforms code to replace ANALOG_ROUTE_FILES and ANALOG_CONTENT_ROUTE_FILES
       * placeholders with actual dynamic imports of discovered route and content files.
       *
       * @param code The source code to transform
       * @returns Transformed code with dynamic imports or undefined if no transformation needed
       */
      // Vite 8 / Rolldown filtered transform: the `filter.code` substring
      // pre-filter lets the bundler skip modules that don't contain the
      // marker.  'ANALOG_ROUTE_FILES' also matches 'ANALOG_CONTENT_ROUTE_FILES'
      // (substring), so a single filter covers both placeholders.
      transform: {
        filter: {
          code: 'ANALOG_ROUTE_FILES',
        },
        handler(code) {
          if (
            code.includes('ANALOG_ROUTE_FILES') ||
            code.includes('ANALOG_CONTENT_ROUTE_FILES')
          ) {
            // Discover route files using tinyglobby
            // NOTE: { absolute: true } returns absolute paths for ALL files
            const routeFiles = discoverRouteFiles();

            // Discover content files using tinyglobby
            const contentRouteFiles = discoverContentRouteFiles();

            let result = code.replace(
              'ANALOG_ROUTE_FILES = {};',
              `
              ANALOG_ROUTE_FILES = {${routeFiles.map((module) => {
                // Keys are app-root-relative for in-app files,
                // workspace-relative for library files (additionalPagesDirs).
                // import() keeps absolute paths for Vite's module resolution.
                const key = module.startsWith(root)
                  ? module.replace(root, '')
                  : module.replace(workspaceRoot, '');
                return `"${key}": () => import('${module}')`;
              })}};
            `,
            );

            result = result.replace(
              'ANALOG_CONTENT_ROUTE_FILES = {};',
              `
            ANALOG_CONTENT_ROUTE_FILES = {${contentRouteFiles.map((module) => {
              const key = module.startsWith(root)
                ? module.replace(root, '')
                : module.replace(workspaceRoot, '');
              return `"${key}": () => import('${module}?analog-content-file=true').then(m => m.default)`;
            })}};
            `,
            );

            return {
              code: result,
              map: { mappings: '' },
            };
          }

          return;
        },
      },
    },
    {
      name: 'analog-glob-endpoints',
      // enforce: 'post' ensures this transform runs AFTER the Angular compiler
      // plugin, which replaces module content with its own compiled output.
      // Without this, the Angular plugin would overwrite the endpoint replacements.
      enforce: 'post',
      /**
       * Transforms code to replace ANALOG_PAGE_ENDPOINTS placeholder
       * with actual dynamic imports of discovered server endpoint files.
       *
       * @param code The source code to transform
       * @returns Transformed code with dynamic imports or undefined if no transformation needed
       */
      transform: {
        filter: {
          code: 'ANALOG_PAGE_ENDPOINTS',
        },
        handler(code) {
          if (code.includes('ANALOG_PAGE_ENDPOINTS')) {
            // Discover server endpoint files using tinyglobby
            const endpointFiles = discoverEndpointFiles();

            const result = code.replace(
              'ANALOG_PAGE_ENDPOINTS = {};',
              `
              ANALOG_PAGE_ENDPOINTS = {${endpointFiles.map((module) => {
                const key = module.startsWith(root)
                  ? module.replace(root, '')
                  : module.replace(workspaceRoot, '');
                return `"${key}": () => import('${module}')`;
              })}};
            `,
            );

            return {
              code: result,
              map: { mappings: '' },
            };
          }

          return;
        },
      },
    },
  ];
}
