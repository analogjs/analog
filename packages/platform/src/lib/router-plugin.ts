import { normalizePath, Plugin, UserConfig, ViteDevServer } from 'vite';
import { globSync } from 'tinyglobby';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { Options } from './options.js';
import {
  analyzeAnalogRouteFile,
  formatAnalogRouteIdiomDiagnostic,
} from './route-idiom-diagnostics.js';

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
  const workspaceRoot = normalizePath(
    options?.workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd(),
  );
  let config: UserConfig;
  let root: string;
  // Option dirs are workspace-relative, often written with a leading `/`.
  // Normalize them once into absolute workspace paths so watcher events,
  // glob patterns, and key generation all compare against the same shape.
  const normalizeWatchedDir = (dir: string) => {
    const normalizedDir = normalizePath(
      dir.startsWith(`${workspaceRoot}/`) || dir === workspaceRoot
        ? dir
        : dir.startsWith('/')
          ? `${workspaceRoot}${dir}`
          : resolve(workspaceRoot, dir),
    );
    return normalizedDir.endsWith('/')
      ? normalizedDir.slice(0, -1)
      : normalizedDir;
  };
  // Computed eagerly — these depend only on `options` and `workspaceRoot`,
  // both of which are fixed at construction time.
  const additionalPagesDirs = (options?.additionalPagesDirs || []).map((dir) =>
    normalizeWatchedDir(dir),
  );
  const additionalContentDirs = (options?.additionalContentDirs || []).map(
    (dir) => normalizeWatchedDir(dir),
  );
  // Returns every directory that can contain route-like files. The root-
  // relative entries are only available after the Vite `config` hook sets
  // `root`. The short-form fallbacks (`/app/routes`, etc.) let watcher
  // events match before `config` runs — they cover the common convention
  // where paths start with these prefixes.
  const getRouteLikeDirs = () => [
    ...(root
      ? [
          normalizeWatchedDir(`${root}/app/routes`),
          normalizeWatchedDir(`${root}/src/app/routes`),
          normalizeWatchedDir(`${root}/src/app/pages`),
          normalizeWatchedDir(`${root}/src/content`),
        ]
      : []),
    '/app/routes',
    '/src/app/routes',
    '/src/app/pages',
    '/src/content',
    ...additionalPagesDirs,
    ...additionalContentDirs,
  ];
  // These lists are used repeatedly by transform hooks during serve. Keeping
  // them warm avoids a full glob on every route/content invalidation.
  let routeFilesCache: string[] | undefined;
  let contentRouteFilesCache: string[] | undefined;
  let endpointFilesCache: string[] | undefined;
  const routeDiagnosticCache = new Map<string, string>();
  const isRouteLikeFile = (path: string) => {
    // Watcher paths from chokidar are already absolute — `normalizePath`
    // (forward-slash only) is sufficient; `resolve()` would be a no-op.
    const normalizedPath = normalizePath(path);

    return getRouteLikeDirs().some(
      (dir) => normalizedPath === dir || normalizedPath.startsWith(`${dir}/`),
    );
  };
  const discoverRouteFiles = () => {
    routeFilesCache ??= globSync(
      [
        `${root}/app/routes/**/*.ts`,
        `${root}/src/app/routes/**/*.ts`,
        `${root}/src/app/pages/**/*.page.ts`,
        ...additionalPagesDirs.map((dir) => `${dir}/**/*.page.ts`),
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
        ...additionalContentDirs.map((dir) => `${dir}/**/*.md`),
      ],
      { dot: true, absolute: true },
    );

    return contentRouteFilesCache;
  };
  const discoverEndpointFiles = () => {
    endpointFilesCache ??= globSync(
      [
        `${root}/src/app/pages/**/*.server.ts`,
        ...additionalPagesDirs.map((dir) => `${dir}/**/*.server.ts`),
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
  const reportRouteDiagnostics = (path: string) => {
    if (!path.endsWith('.page.ts')) {
      return;
    }

    try {
      const code = readFileSync(path, 'utf-8');
      const routeFiles = discoverRouteFiles().filter((file) =>
        file.endsWith('.page.ts'),
      );
      const diagnostics = analyzeAnalogRouteFile({
        filename: path,
        code,
        routeFiles,
      });

      const rendered = diagnostics.map((diagnostic) =>
        formatAnalogRouteIdiomDiagnostic(diagnostic, path, workspaceRoot),
      );
      const fingerprint = rendered.join('\n\n');

      if (!fingerprint) {
        routeDiagnosticCache.delete(path);
        return;
      }

      if (routeDiagnosticCache.get(path) === fingerprint) {
        return;
      }

      routeDiagnosticCache.set(path, fingerprint);
      rendered.forEach((message) => console.warn(message));
    } catch {
      routeDiagnosticCache.delete(path);
    }
  };
  const getModuleKey = (module: string) => {
    // Before config sets `root`, fall back to workspace-relative keys.
    if (!root) {
      return `/${normalizePath(relative(workspaceRoot, module))}`;
    }

    const relToRoot = normalizePath(relative(root, module));
    // Use true path containment instead of a raw prefix check so siblings like
    // `/apps/my-app-tools/...` are not mistaken for files inside `/apps/my-app`.
    const isInRoot = !relToRoot.startsWith('..') && !isAbsolute(relToRoot);

    if (isInRoot) {
      return `/${relToRoot}`;
    }

    return `/${normalizePath(relative(workspaceRoot, module))}`;
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

          if (event === 'unlink') {
            routeDiagnosticCache.delete(path);
          } else {
            reportRouteDiagnostics(path);
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

          server.ws.send('analog:debug-full-reload', {
            plugin: 'platform:router-plugin',
            reason: 'route-graph-shape-changed',
            event,
            path,
          });
          server.ws.send({
            type: 'full-reload',
          });
        }

        server.watcher.on('add', (path) => invalidateRoutes(path, 'add'));
        server.watcher.on('change', (path) => invalidateRoutes(path, 'change'));
        server.watcher.on('unlink', (path) => invalidateRoutes(path, 'unlink'));

        // Vite's watcher only covers the app root by default.
        // additionalPagesDirs / additionalContentDirs live outside the
        // root (e.g. libs/shared/feature in a monorepo), so file
        // add/rename/delete events are never fired for them.  Explicitly
        // add these directories to chokidar so route invalidation works.
        for (const dir of [...additionalPagesDirs, ...additionalContentDirs]) {
          server.watcher.add(dir);
        }

        discoverRouteFiles()
          .filter((file) => file.endsWith('.page.ts'))
          .forEach((file) => reportRouteDiagnostics(file));
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
      // marker.  '_ROUTE_FILES' is a common substring of both
      // 'ANALOG_ROUTE_FILES' and 'ANALOG_CONTENT_ROUTE_FILES'.
      //
      // IMPORTANT: Do NOT change this to 'ANALOG_ROUTE_FILES' — that is NOT
      // a substring of 'ANALOG_CONTENT_ROUTE_FILES' (they diverge at
      // position 7: 'ANALOG_C...' vs 'ANALOG_R...').  When tsconfig path
      // aliases resolve @analogjs/router and @analogjs/router/content to
      // separate source files, each variable lives in its own module and
      // the filter must match both independently.
      transform: {
        filter: {
          code: '_ROUTE_FILES',
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
                const key = getModuleKey(module);
                return `"${key}": () => import('${module}')`;
              })}};
            `,
            );

            result = result.replace(
              'ANALOG_CONTENT_ROUTE_FILES = {};',
              `
            ANALOG_CONTENT_ROUTE_FILES = {${contentRouteFiles.map((module) => {
              const key = getModuleKey(module);
              return `"${key}": () => import('${module}?analog-content-file=true').then(m => m.default)`;
            })}};
            `,
            );

            result = result.replace(
              'ANALOG_CONTENT_FILE_COUNT = 0',
              `ANALOG_CONTENT_FILE_COUNT = ${contentRouteFiles.length}`,
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
                const key = getModuleKey(module);
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
