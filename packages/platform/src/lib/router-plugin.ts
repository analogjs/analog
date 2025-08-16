import { normalizePath, Plugin, UserConfig } from 'vite';
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
        function invalidateRoutes(path: string) {
          if (
            path.includes(`routes`) ||
            path.includes(`pages`) ||
            path.includes('content')
          ) {
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
        }

        server.watcher.on('add', invalidateRoutes);
        server.watcher.on('unlink', invalidateRoutes);
      },
    },
    {
      name: 'analog-glob-routes',
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
      transform(code) {
        if (
          code.includes('ANALOG_ROUTE_FILES') ||
          code.includes('ANALOG_CONTENT_ROUTE_FILES')
        ) {
          // Discover route files using tinyglobby
          // NOTE: { absolute: true } returns absolute paths for ALL files
          const routeFiles: string[] = globSync(
            [
              `${root}/app/routes/**/*.ts`,
              `${root}/src/app/routes/**/*.ts`,
              `${root}/src/app/pages/**/*.page.ts`,
              `${root}/src/app/pages/**/*.page.analog`,
              `${root}/src/app/pages/**/*.page.ag`,
              ...(options?.additionalPagesDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.page.{ts,analog,ag}`,
              ),
            ],
            { dot: true, absolute: true },
          );

          // Discover content files using tinyglobby
          const contentRouteFiles: string[] = globSync(
            [
              `${root}/src/app/routes/**/*.md`,
              `${root}/src/app/pages/**/*.md`,
              `${root}/src/content/**/*.md`,
              ...(options?.additionalContentDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.{md,agx}`,
              ),
            ],
            { dot: true, absolute: true },
          );

          let result = code.replace(
            'ANALOG_ROUTE_FILES = {};',
            `
            ANALOG_ROUTE_FILES = {${routeFiles.map((module) => {
              // CRITICAL: tinyglobby returns absolute paths, but we need relative paths for project files
              // to match expected output format. Library files keep absolute paths.
              const key = module.startsWith(root)
                ? module.replace(root, '')
                : module;
              return `"${key}": () => import('${module}')`;
            })}};
          `,
          );

          result = result.replace(
            'ANALOG_CONTENT_ROUTE_FILES = {};',
            `
          ANALOG_CONTENT_ROUTE_FILES = {${contentRouteFiles.map((module) => {
            // Same path normalization as route files
            const key = module.startsWith(root)
              ? module.replace(root, '')
              : module;
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
    {
      name: 'analog-glob-endpoints',
      /**
       * Transforms code to replace ANALOG_PAGE_ENDPOINTS placeholder
       * with actual dynamic imports of discovered server endpoint files.
       *
       * @param code The source code to transform
       * @returns Transformed code with dynamic imports or undefined if no transformation needed
       */
      transform(code) {
        if (code.includes('ANALOG_PAGE_ENDPOINTS')) {
          // Discover server endpoint files using tinyglobby
          const endpointFiles: string[] = globSync(
            [
              `${root}/src/app/pages/**/*.server.ts`,
              ...(options?.additionalPagesDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.server.ts`,
              ),
            ],
            { dot: true, absolute: true },
          );

          const result = code.replace(
            'ANALOG_PAGE_ENDPOINTS = {};',
            `
            ANALOG_PAGE_ENDPOINTS = {${endpointFiles.map((module) => {
              // Same path normalization for consistency
              const key = module.startsWith(root)
                ? module.replace(root, '')
                : module;
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
  ];
}
