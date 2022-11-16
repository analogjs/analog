import type { Plugin } from 'vite';

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
      name: 'analogjs-router-invalidate-routes',
      configureServer(server) {
        function invalidateRoutes(path: string) {
          if (path.includes(`${server.config.root}/app/routes`)) {
            server.moduleGraph.fileToModulesMap.forEach((mods) => {
              mods.forEach((mod) => {
                if (mod.id?.includes('@analogjs_router.js')) {
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
