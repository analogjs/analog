import { ViteDevServer } from 'vite';
import { EventHandler, H3, toNodeHandler } from 'h3';
import { globSync } from 'tinyglobby';

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
) {
  const middlewareFiles = globSync(
    [`${root}/${sourceRoot}/server/middleware/**/*.ts`],
    {
      dot: true,
      absolute: true,
    },
  );

  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      const middlewareHandler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default);

      // Bridge h3 event handler to Node.js middleware using a temporary H3 app
      const app = new H3();
      app.use(middlewareHandler);
      const nodeHandler = toNodeHandler(app);

      // Connect middleware needs an explicit `next()` call, so detect whether
      // the bridged h3 handler already finished the response.
      const originalEnd = res.end.bind(res);
      let responded = false;
      res.end = function (
        ...args: Parameters<typeof res.end>
      ): ReturnType<typeof res.end> {
        responded = true;
        return originalEnd(...args);
      } as typeof res.end;

      await nodeHandler(req, res);

      if (!responded) {
        // Restore original end and continue to next middleware
        res.end = originalEnd;
        next();
      }
    });
  });
}
