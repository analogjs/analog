import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import type { NitroEventHandler } from 'nitro/types';
import { normalizePath } from 'vite';

type GetHandlersArgs = {
  workspaceRoot: string;
  sourceRoot: string;
  rootDir: string;
  additionalPagesDirs?: string[];
};

/**
 * Discovers and generates Nitro event handlers for server-side page routes.
 *
 * Discovers all `.server.ts` files under `app/pages/**` and any additional
 * pages directories, then maps each file to a Nitro route pattern under
 * `/api/_analog/pages/...`.
 *
 * Route transformation examples:
 * - index.server.ts → /api/_analog/pages/index
 * - users/[id].server.ts → /api/_analog/pages/users/:id
 * - products/[...slug].server.ts → /api/_analog/pages/products/**:slug
 * - (auth)/login.server.ts → /api/_analog/pages/-auth-/login
 */
export function getPageHandlers({
  workspaceRoot,
  sourceRoot,
  rootDir,
  additionalPagesDirs,
}: GetHandlersArgs): NitroEventHandler[] {
  const root = normalizePath(resolve(workspaceRoot, rootDir));

  const endpointFiles: string[] = globSync(
    [
      `${root}/${sourceRoot}/app/pages/**/*.server.ts`,
      ...(additionalPagesDirs || []).map(
        (dir) => `${workspaceRoot}${dir}/**/*.server.ts`,
      ),
    ],
    { dot: true, absolute: true },
  );

  const handlers: NitroEventHandler[] = endpointFiles.map((endpointFile) => {
    const normalized = normalizePath(endpointFile);
    const route = normalized
      .replace(/^(.*?)\/pages/, '/pages')
      .replace(/\.server\.ts$/, '')
      .replace(/\[\.{3}(.+)\]/g, '**:$1')
      .replace(/\[\.{3}(\w+)\]/g, '**:$1')
      // Strip Angular Router group syntax `(group)` from any segment, not
      // just trailing ones. Routes like `(auth)/login.server.ts` need to
      // become `/-auth-/login`, otherwise the literal parens leak through
      // and the handler is mounted under an invalid Nitro path.
      .replace(/\/\(([^/]+)\)/g, '/-$1-')
      .replace(/\[(\w+)\]/g, ':$1')
      .replace(/\./g, '/');

    return {
      handler: endpointFile,
      route: `/api/_analog${route}`,
      lazy: true,
    };
  });

  return handlers;
}
