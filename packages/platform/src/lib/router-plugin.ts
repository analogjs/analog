import { VERSION } from '@angular/compiler-cli';
import { normalizePath, Plugin, UserConfig } from 'vite';
import fg from 'fast-glob';
import { resolve } from 'node:path';

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
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  let config: UserConfig;
  let root: string;

  return [
    {
      name: 'analogjs-router-invalidate-routes',
      configureServer(server) {
        function invalidateRoutes(path: string) {
          if (
            path.includes(normalizePath(`/app/routes/`)) ||
            path.includes(normalizePath(`/pages/`))
          ) {
            server.moduleGraph.fileToModulesMap.forEach((mods) => {
              mods.forEach((mod) => {
                if (
                  mod.id?.includes('analogjs') &&
                  mod.id?.includes('router')
                ) {
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
        root = resolve(workspaceRoot, config.root || '.') || '.';
      },
      transform(code, id) {
        if (
          (code.includes('ANALOG_ROUTE_FILES') ||
            code.includes('ANALOG_CONTENT_ROUTE_FILES')) &&
          id.includes('analogjs')
        ) {
          const routeFiles: string[] = fg.sync(
            [
              `${root}/app/routes/**/*.ts`,
              `${root}/src/app/routes/**/*.ts`,
              `${root}/src/app/pages/**/*.page.ts`,
              `${root}/src/app/pages/**/*.page.analog`,
              ...(options?.additionalPagesDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.page.ts`
              ),
            ],
            { dot: true }
          );

          const contentRouteFiles: string[] = fg.sync(
            [
              `${root}/src/app/routes/**/*.md`,
              `${root}/src/app/pages/**/*.md`,
              `${root}/src/content/**/*.md`,
              ...(options?.additionalContentDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.md`
              ),
            ],
            { dot: true }
          );

          let result = code.replace(
            'let ANALOG_ROUTE_FILES = {};',
            `
            let ANALOG_ROUTE_FILES = {${routeFiles.map(
              (module) =>
                `"${module.replace(root, '')}": () => import('${module}')`
            )}};
          `
          );

          result = result.replace(
            'let ANALOG_CONTENT_ROUTE_FILES = {};',
            `
          let ANALOG_CONTENT_ROUTE_FILES = {${contentRouteFiles.map(
            (module) =>
              `"${module.replace(
                root,
                ''
              )}": () => import('${module}?analog-content-file=true').then(m => m.default)`
          )}};
          `
          );

          return {
            code: result,
            map: null,
          };
        }

        return;
      },
    },
    {
      name: 'analog-glob-endpoints',
      transform(code, id) {
        if (code.includes('PAGE_ENDPOINTS') && id.includes('analogjs')) {
          const endpointFiles: string[] = fg.sync(
            [
              `${root}/src/app/pages/**/*.server.ts`,
              ...(options?.additionalPagesDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.server.ts`
              ),
            ],
            { dot: true }
          );

          const result = code.replace(
            'let PAGE_ENDPOINTS = {};',
            `
            let PAGE_ENDPOINTS = {${endpointFiles.map(
              (module) =>
                `"${module.replace(root, '')}": () => import('${module}')`
            )}};
          `
          );

          return {
            code: result,
            map: null,
          };
        }

        return;
      },
    },
  ];
}
