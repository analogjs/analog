import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import type { NitroEventHandler } from 'nitro/types';
import { normalizePath } from 'vite';

type GetHandlersArgs = {
  workspaceRoot: string;
  sourceRoot: string;
  rootDir: string;
  additionalPagesDirs?: string[];
  hasAPIDir?: boolean;
  /**
   * API prefix without a leading slash (e.g. `'api'`, `'rpc'`). Mounted in
   * front of the discovered `/_analog/pages/...` routes when `hasAPIDir`
   * is set, mirroring user-defined API routes that already live under the
   * configured prefix.
   */
  apiPrefix?: string;
};

/**
 * Discovers and generates Nitro event handlers for server-side page routes.
 *
 * Discovers all `.server.ts` files under `app/pages/**` and any additional
 * pages directories, then maps each file to a Nitro route pattern under
 * `/_analog/pages/...` (prefixed with the configured `apiPrefix` when the
 * project has an API dir).
 *
 * Route transformation examples:
 * - index.server.ts → /_analog/pages/index
 * - users/[id].server.ts → /_analog/pages/users/:id
 * - products/[...slug].server.ts → /_analog/pages/products/**:slug
 * - (auth)/login.server.ts → /_analog/pages/-auth-/login
 */
export function getPageHandlers({
  workspaceRoot,
  sourceRoot,
  rootDir,
  additionalPagesDirs,
  hasAPIDir,
  apiPrefix = 'api',
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
      .replace(/\/\((.*?)\)$/, '/-$1-')
      .replace(/\[(\w+)\]/g, ':$1')
      .replace(/\./g, '/');

    const prefix = hasAPIDir ? `/${apiPrefix.replace(/^\/+/, '')}` : '';

    return {
      handler: endpointFile,
      route: `${prefix}/_analog${route}`,
      lazy: true,
    };
  });

  return handlers;
}
