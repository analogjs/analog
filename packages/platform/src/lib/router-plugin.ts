import { normalizePath, Plugin, UserConfig } from 'vite';
import { globSync } from 'tinyglobby';
import { resolve } from 'node:path';
import fg from 'fast-glob';

import { Options } from './options.js';

/**
 * This plugin invalidates the files for routes when new files
 * are added/deleted.
 *
 * Workaround for: https://github.com/vitejs/vite/issues/10616
 *
 * @returns
 */
export function routerPlugin(options?: Options): Plugin[] {
  const workspaceRoot = normalizePath(options?.workspaceRoot ?? process.cwd());
  let config: UserConfig;
  let root: string;

  return [
    {
      name: 'analogjs-router-invalidate-routes',
      configureServer(server) {
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
      transform(code) {
        if (
          code.includes('ANALOG_ROUTE_FILES') ||
          code.includes('ANALOG_CONTENT_ROUTE_FILES')
        ) {
          const routeFiles: string[] = fg.sync(
            //const routeFiles: string[] = globSync(
            [
              `${root}/app/routes/**/*.ts`,
              `${root}/src/app/routes/**/*.ts`,
              `${root}/src/app/pages/**/*.page.ts`,
              `${root}/src/app/pages/**/*.page.analog`,
              `${root}/src/app/pages/**/*.page.ag`,
              ...(options?.additionalPagesDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.page.{ts,analog,ag}`,
              ),
            ],
            { dot: true },
            // { dot: true, absolute: true },
          );

          const contentRouteFiles: string[] = fg.sync(
            // const contentRouteFiles: string[] = globSync(
            [
              `${root}/src/app/routes/**/*.md`,
              `${root}/src/app/pages/**/*.md`,
              `${root}/src/content/**/*.md`,
              ...(options?.additionalContentDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.{md,agx}`,
              ),
            ],
            { dot: true },
            // { dot: true, absolute: true },
          );

          let result = code.replace(
            'ANALOG_ROUTE_FILES = {};',
            `
            ANALOG_ROUTE_FILES = {${routeFiles.map(
              (module) =>
                `"${module.replace(root, '')}": () => import('${module}')`,
            )}};
          `,
          );

          result = result.replace(
            'ANALOG_CONTENT_ROUTE_FILES = {};',
            `
          ANALOG_CONTENT_ROUTE_FILES = {${contentRouteFiles.map(
            (module) =>
              `"${module.replace(
                root,
                '',
              )}": () => import('${module}?analog-content-file=true').then(m => m.default)`,
          )}};
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
      transform(code) {
        if (code.includes('ANALOG_PAGE_ENDPOINTS')) {
          const endpointFiles: string[] = fg.sync(
            // const endpointFiles: string[] = globSync(
            [
              `${root}/src/app/pages/**/*.server.ts`,
              ...(options?.additionalPagesDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.server.ts`,
              ),
            ],
            { dot: true },
            // { dot: true, absolute: true },
          );

          const result = code.replace(
            'ANALOG_PAGE_ENDPOINTS = {};',
            `
            ANALOG_PAGE_ENDPOINTS = {${endpointFiles.map(
              (module) =>
                `"${module.replace(root, '')}": () => import('${module}')`,
            )}};
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

/**
 * FAST-GLOB COMPILED OUTPUT DOCUMENTATION
 * =======================================
 *
 * When using fast-glob, the compiled output is found in dist/apps/analog-app/ssr/main.server.mjs
 *
 * 1. ANALOG_ROUTE_FILES structure:
 *    let ANALOG_ROUTE_FILES = {
 *      "/src/app/pages/(auth).page.ts": () => import("./assets/(auth).page-B4zVpMAX.mjs"),
 *      "/src/app/pages/(home).page.ts": () => import("./assets/(home).page-MHK_gyF-.mjs"),
 *      "/src/app/pages/[...slug].page.ts": () => import("./assets/_...slug_.page-BsifI1jK.mjs"),
 *      "/src/app/pages/cart.page.ts": () => import("./assets/cart.page-B5y1Ec_a.mjs"),
 *      "/src/app/pages/goodbye.page.analog": () => import("./assets/goodbye.page-1oaJ6LiZ.mjs"),
 *      "/src/app/pages/newsletter.page.ts": () => import("./assets/newsletter.page-DMm2G9Ps.mjs"),
 *      "/src/app/pages/shipping/index.page.ts": () => import("./assets/index.page-BmFboAwm.mjs"),
 *      // Additional page files from libs with absolute paths:
 *      "/Volumes/SnyderDev/@benpsnyder/analog/libs/shared/feature/src/pages/about-me.page.ts": () => import("./assets/about-me.page-7uWyPo5W.mjs"),
 *      "/Volumes/SnyderDev/@benpsnyder/analog/libs/shared/feature/src/pages/about-you.page.analog": () => import("./assets/about-you.page-YjnlaC-V.mjs")
 *    };
 *
 * 2. ANALOG_CONTENT_ROUTE_FILES structure:
 *    let ANALOG_CONTENT_ROUTE_FILES = {};  // Empty in this build
 *
 * 3. ANALOG_PAGE_ENDPOINTS structure:
 *    let ANALOG_PAGE_ENDPOINTS = {
 *      "/src/app/pages/(home).server.ts": () => import("./assets/(home).server-to_c29Ql.mjs"),
 *      "/src/app/pages/[...slug].server.ts": () => Promise.resolve().then(() => ____slug__server$1),
 *      "/src/app/pages/newsletter.server.ts": () => import("./assets/newsletter.server-BhMMftjm.mjs"),
 *      "/src/app/pages/products.[productId].server.ts": () => Promise.resolve().then(() => products__productId__server),
 *      "/src/app/pages/search.server.ts": () => import("./assets/search.server-CJlXx8ZA.mjs"),
 *      "/src/app/pages/shipping/[...slug].server.ts": () => Promise.resolve().then(() => ____slug__server),
 *      "/src/app/pages/shipping/index.server.ts": () => Promise.resolve().then(() => index_server),
 *      // Additional server files from libs with absolute paths:
 *      "/Volumes/SnyderDev/@benpsnyder/analog/libs/shared/feature/src/pages/test.server.ts": () => Promise.resolve().then(() => test_server)
 *    };
 *
 * 4. Key characteristics of fast-glob output:
 *    - Returns relative paths by default for files in the project root
 *    - Returns absolute paths for files outside the project root (e.g., from libs)
 *    - Object keys use the discovered paths (relative starting with "/" or absolute)
 *    - Import statements use relative paths to compiled chunks (./assets/*)
 *    - Some imports use Promise.resolve().then() for code splitting
 *    - Compiled assets include hash suffixes for cache busting
 *
 * 5. Path patterns observed:
 *    - Regular routes: "/src/app/pages/[name].page.ts"
 *    - Dynamic routes: "/src/app/pages/[...slug].page.ts"
 *    - Grouped routes: "/src/app/pages/(auth).page.ts"
 *    - Nested routes: "/src/app/pages/shipping/index.page.ts"
 *    - Server endpoints: "/src/app/pages/[name].server.ts"
 *    - Library files: Full absolute paths starting with "/Volumes/..."
 *
 * 6. Comparison notes for tinyglobby migration:
 *    - fast-glob returns relative paths for project files by default
 *    - tinyglobby with { absolute: true } would return absolute paths for all files
 *    - Keys would need to be normalized to relative paths for consistency
 *    - Import paths remain relative to the output bundle location
 */
