import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import { normalizePath } from 'vite';

export type GetServerFnHandlersArgs = {
  workspaceRoot: string;
  sourceRoot: string;
  rootDir: string;
  additionalServerFnDirs?: string[];
};

export type ServerFnHandlerModule = {
  /** Absolute, normalized path to a discovered `*.server.ts` module. */
  file: string;
};

/**
 * `*.server.ts` files that are matched by the glob but are never server-function
 * hosts, so importing them for registration side-effects would be wrong.
 */
const EXCLUDED_SERVER_FILES: RegExp[] = [/\/app\.config\.server\.ts$/];

/**
 * Discovers the `*.server.ts` modules that may define server functions.
 *
 * Unlike page endpoints (one Nitro handler per file), server functions all
 * share a single `/_analog/fn/:id` dispatch route. The discovered modules are
 * imported for their registration side-effects — each `serverFn(...)` call
 * registers itself into the server-side registry at import time — after which
 * dispatch looks up the requested function by id.
 *
 * Scope is `<projectRoot>/<sourceRoot>/**\/*.server.ts` because the RFC allows a
 * server function to live in any `.server.ts` module, including existing page
 * server files. Files that define no server function simply register nothing.
 * Angular SSR config (`app.config.server.ts`) is excluded — it is not a route or
 * function module and must not be pulled into the dispatch bundle.
 *
 * @returns discovered modules, de-duplicated and sorted for deterministic output
 */
export function getServerFnHandlers({
  workspaceRoot,
  sourceRoot,
  rootDir,
  additionalServerFnDirs,
}: GetServerFnHandlersArgs): ServerFnHandlerModule[] {
  const root = normalizePath(resolve(workspaceRoot, rootDir));

  const files = globSync(
    [
      `${root}/${sourceRoot}/**/*.server.ts`,
      ...(additionalServerFnDirs || []).map(
        (dir) => `${workspaceRoot}${dir}/**/*.server.ts`,
      ),
    ],
    { dot: true, absolute: true },
  ).map((file) => normalizePath(file));

  const seen = new Set<string>();
  return files
    .filter((file) => !EXCLUDED_SERVER_FILES.some((re) => re.test(file)))
    .filter((file) => (seen.has(file) ? false : (seen.add(file), true)))
    .sort()
    .map((file) => ({ file }));
}
