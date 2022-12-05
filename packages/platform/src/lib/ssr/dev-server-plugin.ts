import { Plugin, ViteDevServer } from 'vite';
import * as path from 'path';
import * as fs from 'fs';

interface ServerOptions {
  index?: string;
  entryServer?: string;
}

export function devServerPlugin(options: ServerOptions): Plugin {
  const entryServer = options.entryServer || 'src/main.server.ts';
  const index = options.index || 'index.html';

  return {
    name: 'analogjs-dev-ssr-plugin',
    config() {
      return {
        resolve: {
          alias: {
            '~analog/entry-server': entryServer,
          },
        },
      };
    },
    configureServer(viteServer) {
      return async () => {
        remove_html_middlewares(viteServer.middlewares);
        viteServer.middlewares.use(async (req, res) => {
          let template = fs.readFileSync(
            path.resolve(viteServer.config.root, index),
            'utf-8'
          );

          template = await viteServer.transformIndexHtml(
            req.originalUrl as string,
            template
          );

          try {
            const entryServer = (
              await viteServer.ssrLoadModule('~analog/entry-server')
            )['default'];
            const result = await entryServer(req.originalUrl, template);
            res.end(result);
          } catch (e: unknown) {
            viteServer && viteServer.ssrFixStacktrace(e as Error);
            res.end(`Error ${e}`);
          }
        });
      };
    },
  };
}

/**
 * Removes Vite internal middleware
 *
 * @param server
 */
function remove_html_middlewares(server: ViteDevServer['middlewares']) {
  const html_middlewares = [
    'viteIndexHtmlMiddleware',
    'vite404Middleware',
    'viteSpaFallbackMiddleware',
  ];
  for (let i = server.stack.length - 1; i > 0; i--) {
    // @ts-ignore
    if (html_middlewares.includes(server.stack[i].handle.name)) {
      server.stack.splice(i, 1);
    }
  }
}
