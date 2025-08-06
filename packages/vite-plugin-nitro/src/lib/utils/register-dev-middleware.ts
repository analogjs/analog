import { ViteDevServer } from 'vite';
import { EventHandler, createEvent } from 'h3';
import { globSync } from 'tinyglobby';

/**
 * Registers development server middleware by discovering and loading middleware files.
 *
 * This function:
 * 1. Discovers all TypeScript middleware files in the server/middleware directory
 * 2. Dynamically loads each middleware module using Vite's SSR module loader
 * 3. Registers each middleware handler with the Vite development server
 * 4. Handles middleware execution flow and error handling
 *
 * @param root The project root directory path
 * @param sourceRoot The source directory path (e.g., 'src')
 * @param viteServer The Vite development server instance
 *
 * Example usage:
 * await registerDevServerMiddleware('/workspace/my-app', 'src', viteServer);
 *
 * Sample middleware file paths that would be discovered:
 * - /workspace/my-app/src/server/middleware/auth.ts
 * - /workspace/my-app/src/server/middleware/cors.ts
 * - /workspace/my-app/src/server/middleware/logging.ts
 * - /workspace/my-app/src/server/middleware/validation.ts
 *
 * tinyglobby vs fast-glob comparison:
 * - Both support the same glob patterns for file discovery
 * - Both are efficient for finding middleware files
 * - tinyglobby is now used instead of fast-glob
 * - tinyglobby provides similar functionality with smaller bundle size
 * - tinyglobby's globSync returns absolute paths when absolute: true is set
 *
 * globSync options explained:
 * - dot: true - Includes files/directories that start with a dot (e.g., .env.middleware)
 * - absolute: true - Returns absolute file paths instead of relative paths
 *
 * Middleware execution flow:
 * 1. Request comes to Vite dev server
 * 2. Each registered middleware is executed in order
 * 3. If middleware returns a result, request processing stops
 * 4. If middleware returns no result, next middleware is called
 * 5. If no middleware handles the request, it continues to normal Vite processing
 */
export async function registerDevServerMiddleware(
  root: string,
  sourceRoot: string,
  viteServer: ViteDevServer,
) {
  // Discover all TypeScript middleware files in the server/middleware directory
  // Pattern: looks for any .ts files in server/middleware/**/*.ts
  const middlewareFiles = globSync(
    [`${root}/${sourceRoot}/server/middleware/**/*.ts`],
    {
      dot: true,
      absolute: true,
    },
  );

  // Register each discovered middleware file with the Vite dev server
  middlewareFiles.forEach((file) => {
    viteServer.middlewares.use(async (req, res, next) => {
      // Dynamically load the middleware module using Vite's SSR module loader
      // This allows for hot module replacement during development
      const middlewareHandler: EventHandler = await viteServer
        .ssrLoadModule(file)
        .then((m: unknown) => (m as { default: EventHandler }).default);

      // Execute the middleware handler with the request/response event
      const result = await middlewareHandler(createEvent(req, res));

      // If middleware doesn't return a result, continue to next middleware
      // If middleware returns a result, stop processing (middleware handled the request)
      if (!result) {
        next();
      }
    });
  });
}
