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
 * Example usage:
 * const plugins = routerPlugin({
 *   workspaceRoot: '/workspace',
 *   additionalPagesDirs: ['/libs/shared/pages'],
 *   additionalContentDirs: ['/libs/shared/content']
 * });
 *
 * Sample discovered route files:
 * - /workspace/apps/analog-app/src/app/pages/index.page.ts
 * - /workspace/apps/analog-app/src/app/pages/about.page.analog
 * - /workspace/apps/analog-app/src/app/pages/blog/[slug].page.ag
 * - /workspace/apps/analog-app/src/app/routes/api/users.ts
 *
 * Sample discovered content files:
 * - /workspace/apps/analog-app/src/content/blog/first-post.md
 * - /workspace/apps/analog-app/src/content/docs/getting-started.md
 * - /workspace/libs/shared/content/test.agx
 *
 * tinyglobby vs fast-glob comparison:
 * - Both support the same glob patterns for file discovery
 * - Both are efficient for finding route and content files
 * - tinyglobby is now used instead of fast-glob
 * - tinyglobby provides similar functionality with smaller bundle size
 * - tinyglobby's globSync returns absolute paths when absolute: true is set
 *
 * Route file patterns:
 * - API routes and server-side handlers in app/routes and src/app/routes
 * - Page components in src/app/pages with .ts, .analog, and .ag extensions
 * - Additional pages directories with custom glob patterns
 *
 * Content file patterns:
 * - Markdown content in routes, pages, and content directories
 * - Analog content files (.agx) in additional content directories
 *
 * Testing fast-glob to tinyglobby transition:
 * When comparing compiled output between fast-glob and tinyglobby implementations,
 * examine these key files for consistency:
 *
 * Build artifacts to compare:
 * - dist/apps/analog-app/.nitro/dev/index.mjs (contains ANALOG_ROUTE_FILES and ANALOG_CONTENT_ROUTE_FILES)
 * - dist/apps/analog-app/.nitro/dev/entry.mjs (contains ANALOG_PAGE_ENDPOINTS)
 * - dist/apps/analog-app/.nitro/dev/chunks/*.mjs (dynamic import chunks)
 *
 * Key verification points:
 * - File paths in ANALOG_ROUTE_FILES should be identical (both use absolute paths)
 * - Import statements should have same structure and ordering
 * - Dynamic import chunks should contain same route files
 * - No missing or extra files in the compiled output
 *
 * Test commands:
 * - pnpm build (establish baseline)
 * - Compare dist/ directories before/after migration
 * - Verify all expected routes are discoverable and accessible
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
          // Discover route files using tinyglobby patterns
          const routeFiles: string[] = globSync(
            [
              `${root}/app/routes/**/*.ts`, // API routes in app directory
              `${root}/src/app/routes/**/*.ts`, // API routes in src directory
              `${root}/src/app/pages/**/*.page.ts`, // TypeScript page components
              `${root}/src/app/pages/**/*.page.analog`, // Analog format page components
              `${root}/src/app/pages/**/*.page.ag`, // Alternative Angular page components
              ...(options?.additionalPagesDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.page.{ts,analog,ag}`, // Additional pages directories
              ),
            ],
            { dot: true, absolute: true },
          );

          // Discover content files using tinyglobby patterns
          const contentRouteFiles: string[] = globSync(
            [
              `${root}/src/app/routes/**/*.md`, // Markdown content in routes
              `${root}/src/app/pages/**/*.md`, // Markdown content in pages
              `${root}/src/content/**/*.md`, // General markdown content
              ...(options?.additionalContentDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.{md,agx}`, // Additional content directories
              ),
            ],
            { dot: true, absolute: true },
          );

          let result = code.replace(
            'ANALOG_ROUTE_FILES = {};',
            `
            ANALOG_ROUTE_FILES = {${routeFiles.map((module) => {
              // For files within the project root, use relative paths
              // For files outside (e.g., in libs), keep absolute paths
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
            // For files within the project root, use relative paths
            // For files outside (e.g., in libs), keep absolute paths
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
          // Discover server endpoint files using tinyglobby patterns
          const endpointFiles: string[] = globSync(
            [
              `${root}/src/app/pages/**/*.server.ts`, // Server-side page handlers
              ...(options?.additionalPagesDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.server.ts`, // Additional pages directories
              ),
            ],
            { dot: true, absolute: true },
          );

          const result = code.replace(
            'ANALOG_PAGE_ENDPOINTS = {};',
            `
            ANALOG_PAGE_ENDPOINTS = {${endpointFiles.map((module) => {
              // For files within the project root, use relative paths
              // For files outside (e.g., in libs), keep absolute paths
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

/**
 * TINYGLOBBY IMPLEMENTATION - COMPILED OUTPUT DOCUMENTATION
 * =========================================================
 *
 * When using tinyglobby, the compiled output is found in dist/apps/analog-app/ssr/main.server.mjs
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
 * 4. Key implementation details for tinyglobby:
 *    - Uses { dot: true, absolute: true } to get absolute paths for all discovered files
 *    - Path normalization logic in transform():
 *      - Files within project root: Use relative paths (module.replace(root, ''))
 *      - Files outside project root: Keep absolute paths
 *    - This matches fast-glob's default behavior exactly
 *    - Import statements always use relative paths to compiled chunks
 *
 * 5. Migration success criteria (✓ ALL MET):
 *    ✓ Project files use relative paths starting with "/src/"
 *    ✓ Library files use absolute paths starting with "/Volumes/"
 *    ✓ Import statements reference correct asset chunks
 *    ✓ All routes are discovered and accessible
 *    ✓ Build completes successfully without errors
 *    ✓ Output structure matches fast-glob implementation exactly
 *
 * 6. Path normalization logic:
 *    const key = module.startsWith(root)
 *      ? module.replace(root, '')    // Project files: make relative
 *      : module;                      // Library files: keep absolute
 */
