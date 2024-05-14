import { VERSION } from '@angular/compiler-cli';
import { normalizePath, Plugin } from 'vite';

/**
 * This plugin invalidates the files for routes when new files
 * are added/deleted.
 *
 * Workaround for: https://github.com/vitejs/vite/issues/10616
 *
 * @returns
 */
export function routerPlugin(): Plugin[] {
  return [
    {
      name: 'analogjs-router-plugin',
      config() {
        return {
          ssr: {
            noExternal: [
              '@analogjs/**',
              '@analogjs/trpc/**',
              '@angular/**',
              '@angular/cdk/**',
              '@angular/fire/**',
              '@ngrx/**',
              '@rx-angular/**',
              '@ng-bootstrap/**',
              '@ngneat/**',
              'apollo-angular/**',
              'primeng/**',
              'rxfire/**',
              '@tanstack/**',
              'ngxtension/**',
            ],
          },
          optimizeDeps: {
            include: [
              '@angular/common',
              '@angular/common/http',
              ...(Number(VERSION.major) > 15
                ? ['@angular/core/rxjs-interop']
                : []),
            ],
            exclude: ['@angular/platform-server', '@analogjs/router'],
          },
        };
      },
    },
    {
      name: 'analogjs-router-invalidate-routes',
      configureServer(server) {
        function invalidateRoutes(path: string) {
          if (
            path.includes(normalizePath(`/app/routes/`)) ||
            path.includes(normalizePath(`/app/pages/`))
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
  ];
}
