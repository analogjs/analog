// SSR dev server, middleware and error page source modified from
// https://github.com/solidjs/solid-start/blob/main/packages/start/dev/server.js

import { Connect, Plugin, ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createEvent, sendWebResponse } from 'h3';

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
          let template = readFileSync(
            resolve(viteServer.config.root, index),
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
            const result: string | Response = await entryServer(
              req.originalUrl,
              template,
              {
                req,
                res,
              }
            );

            if (result instanceof Response) {
              sendWebResponse(createEvent(req, res), result);
              return;
            }

            res.setHeader('Content-Type', 'text/html');
            res.end(result);
          } catch (e) {
            viteServer && viteServer.ssrFixStacktrace(e as Error);
            res.statusCode = 500;
            res.end(`
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <title>Error</title>
                  <script type="module">
                    import { ErrorOverlay } from '/@vite/client'
                    document.body.appendChild(new ErrorOverlay(${JSON.stringify(
                      prepareError(req, e)
                    ).replace(/</g, '\\u003c')}))
                  </script>
                </head>
                <body>
                </body>
              </html>
            `);
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

/**
 * Formats error for SSR message in error overlay
 * @param req
 * @param error
 * @returns
 */
function prepareError(req: Connect.IncomingMessage, error: unknown) {
  const e = error as Error;
  return {
    message: `An error occured while server rendering ${req.url}:\n\n\t${
      typeof e === 'string' ? e : e.message
    } `,
    stack: typeof e === 'string' ? '' : e.stack,
  };
}
