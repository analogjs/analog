import { ViteDevServer } from 'vite';
import { EventHandler, H3 } from 'nitro/h3';
import { globSync } from 'tinyglobby';

import { toWebRequest, writeWebResponseToNode } from './node-web-bridge.js';

const PASSTHROUGH_HEADER = 'x-analog-passthrough';

/**
 * Registers development server middleware by discovering and loading middleware files.
 *
 * Each discovered h3 middleware module is loaded through Vite's SSR loader,
 * wrapped in a temporary H3 app, then bridged back into Vite's Connect stack.
 * If the middleware does not write a response, control falls through to the
 * next Vite middleware.
 *
 * @param root The project root directory path
 * @param sourceRoot The source directory path (e.g., 'src')
 * @param viteServer The Vite development server instance
 */
export async function registerDevServerMiddleware(
  root: string,
  sourceRoot: string,
  viteServer: ViteDevServer,
): Promise<void> {
  const middlewareFiles = globSync(
    [`${root}/${sourceRoot}/server/middleware/**/*.ts`],
    {
      dot: true,
      absolute: true,
    },
  );

  middlewareFiles.forEach((file) => {
    // Create the H3 app once per middleware file (not per request).
    // The dynamic handler inside still loads the module fresh each request
    // via ssrLoadModule, preserving HMR.
    const app = new H3();
    app.use(async (event) => {
      const handler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default);
      return handler(event);
    });
    // Sentinel catch-all: when the middleware returns undefined (does not
    // handle the request), h3 does not emit its default 404 — instead we
    // detect the passthrough header and let the Connect stack continue.
    app.use(
      () =>
        new Response(null, {
          status: 204,
          headers: { [PASSTHROUGH_HEADER]: '1' },
        }),
    );

    viteServer.middlewares.use(async (req, res, next) => {
      const response = await app.fetch(toWebRequest(req));

      if (response.headers.get(PASSTHROUGH_HEADER) === '1') {
        next();
        return;
      }

      await writeWebResponseToNode(res, response);
    });
  });
}
