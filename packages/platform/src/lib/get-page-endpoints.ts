import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';
import { normalizePath } from 'vite';

type GetPageEndpointsArgs = {
  workspaceRoot: string;
  sourceRoot: string;
  rootDir: string;
  additionalPagesDirs?: string[];
};

export type PageEndpoint = {
  /** Absolute path to the page's `.server.ts` file. */
  file: string;
  /** Route relative to the endpoint root, e.g. `/pages/users/:id`. */
  route: string;
};

/**
 * Discovers server-side page endpoints: every `.server.ts` file under
 * `app/pages/**` and any additional pages directories, mapped to a route
 * pattern. Servers mount them under their own prefix.
 *
 * Route transformation examples:
 * - index.server.ts → /pages/index
 * - users/[id].server.ts → /pages/users/:id
 * - products/[...slug].server.ts → /pages/products/**:slug
 * - (auth)/login.server.ts → /pages/-auth-/login
 */
export function getPageEndpoints({
  workspaceRoot,
  sourceRoot,
  rootDir,
  additionalPagesDirs,
}: GetPageEndpointsArgs): PageEndpoint[] {
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

  return endpointFiles.map((file) => ({
    file,
    route: normalizePath(file)
      .replace(/^(.*?)\/pages/, '/pages')
      .replace(/\.server\.ts$/, '')
      .replace(/\[\.{3}(.+)\]/g, '**:$1')
      .replace(/\[\.{3}(\w+)\]/g, '**:$1')
      // Strip Angular Router group syntax `(group)` from any segment, not
      // just trailing ones. Routes like `(auth)/login.server.ts` need to
      // become `/-auth-/login`, otherwise the literal parens leak through
      // and the endpoint is mounted under an invalid path.
      .replace(/\/\(([^/]+)\)/g, '/-$1-')
      .replace(/\[(\w+)\]/g, ':$1')
      .replace(/\./g, '/'),
  }));
}
