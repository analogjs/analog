import { resolve, relative } from 'node:path';
import { globSync } from 'tinyglobby';

import { NitroEventHandler } from 'nitropack';
import { normalizePath } from 'vite';

type GetHandlersArgs = {
  workspaceRoot: string;
  sourceRoot: string;
  rootDir: string;
  additionalPagesDirs?: string[];
  hasAPIDir?: boolean;
};

/**
 * Discovers and generates Nitro event handlers for server-side page routes.
 *
 * This function:
 * 1. Discovers all .server.ts files in the app/pages directory and additional pages directories
 * 2. Converts file paths to route patterns using Angular-style route syntax
 * 3. Generates Nitro event handlers with proper route mapping and lazy loading
 * 4. Handles dynamic route parameters and catch-all routes
 *
 * @param workspaceRoot The workspace root directory path
 * @param sourceRoot The source directory path (e.g., 'src')
 * @param rootDir The project root directory relative to workspace
 * @param additionalPagesDirs Optional array of additional pages directories to scan
 * @param hasAPIDir Whether the project has an API directory (affects route prefixing)
 * @returns Array of NitroEventHandler objects with handler paths and route patterns
 *
 * Example usage:
 * const handlers = getPageHandlers({
 *   workspaceRoot: '/workspace',
 *   sourceRoot: 'src',
 *   rootDir: 'apps/my-app',
 *   additionalPagesDirs: ['/libs/shared/pages'],
 *   hasAPIDir: true
 * });
 *
 * Sample discovered file paths:
 * - /workspace/apps/my-app/src/app/pages/index.server.ts
 * - /workspace/apps/my-app/src/app/pages/users/[id].server.ts
 * - /workspace/apps/my-app/src/app/pages/products/[...slug].server.ts
 * - /workspace/apps/my-app/src/app/pages/(auth)/login.server.ts
 *
 * Route transformation examples:
 * - index.server.ts → /_analog/pages/index
 * - users/[id].server.ts → /_analog/pages/users/:id
 * - products/[...slug].server.ts → /_analog/pages/products/**:slug
 * - (auth)/login.server.ts → /_analog/pages/-auth-/login
 *
 * tinyglobby vs fast-glob comparison:
 * - Both support the same glob patterns for file discovery
 * - Both are efficient for finding server-side page files
 * - tinyglobby is now used instead of fast-glob
 * - tinyglobby provides similar functionality with smaller bundle size
 * - tinyglobby's globSync returns absolute paths when absolute: true is set
 *
 * Route transformation rules:
 * 1. Removes .server.ts extension
 * 2. Converts [param] to :param for dynamic routes
 * 3. Converts [...param] to **:param for catch-all routes
 * 4. Converts (group) to -group- for route groups
 * 5. Converts dots to forward slashes
 * 6. Prefixes with /_analog/pages and optionally /api
 */
export function getPageHandlers({
  workspaceRoot,
  sourceRoot,
  rootDir,
  additionalPagesDirs,
  hasAPIDir,
}: GetHandlersArgs) {
  // Normalize the project root path for consistent path handling
  const root = normalizePath(resolve(workspaceRoot, rootDir));

  // Discover all .server.ts files in the app/pages directory and additional pages directories
  // Pattern: looks for any .server.ts files in app/pages/**/*.server.ts and additional directories
  const endpointFiles: string[] = globSync(
    [
      `${root}/${sourceRoot}/app/pages/**/*.server.ts`,
      ...(additionalPagesDirs || []).map(
        (dir) => `${workspaceRoot}${dir}/**/*.server.ts`,
      ),
    ],
    { dot: true, absolute: true },
  );

  // Transform each discovered file into a Nitro event handler
  const handlers: NitroEventHandler[] = endpointFiles.map((endpointFile) => {
    // Convert file path to route pattern using Angular-style route syntax
    const route = endpointFile
      .replace(/^(.*?)\/pages/, '/pages') // Remove everything before /pages
      .replace(/\.server\.ts$/, '') // Remove .server.ts extension
      .replace(/\[\.{3}(.+)\]/g, '**:$1') // Convert [...param] to **:param (catch-all routes)
      .replace(/\[\.{3}(\w+)\]/g, '**:$1') // Alternative catch-all pattern
      .replace(/\/\((.*?)\)$/, '/-$1-') // Convert (group) to -group- (route groups)
      .replace(/\[(\w+)\]/g, ':$1') // Convert [param] to :param (dynamic routes)
      .replace(/\./g, '/'); // Convert dots to forward slashes

    // // Make the handler path relative to the workspace root
    // const relativeHandler = normalizePath(
    //   relative(workspaceRoot, endpointFile),
    // );

    // Return Nitro event handler with absolute handler path and transformed route
    return {
      handler: endpointFile,
      route: `${hasAPIDir ? '/api' : ''}/_analog${route}`,
      lazy: true,
    };
    // return {
    //   handler: relativeHandler,
    //   route: `${hasAPIDir ? '/api' : ''}/_analog${route}`,
    //   lazy: true,
    // };
  });

  return handlers;
}
