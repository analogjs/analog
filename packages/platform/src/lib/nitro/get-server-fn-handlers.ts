import { readFileSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
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
 *
 * The SSR entries (`main.server.ts`, `main-cf.server.ts`, …) sit at the top of
 * the source root and bootstrap the whole Angular application; importing one
 * would pull the entire app into the dispatch bundle. They are matched by
 * directory rather than by name so a page named `main.server.ts` still counts.
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
 * server files. Only modules defining a server function that the client
 * transform can rewrite participate.
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

  const sourceRootDir = `${root}/${sourceRoot}/`;
  const seen = new Set<string>();
  return files
    .filter((file) => !EXCLUDED_SERVER_FILES.some((re) => re.test(file)))
    .filter(
      (file) =>
        !file.startsWith(sourceRootDir) ||
        file.slice(sourceRootDir.length).includes('/'),
    )
    .filter((file) => (seen.has(file) ? false : (seen.add(file), true)))
    .sort()
    .filter(definesServerFn)
    .map((file) => ({ file }));
}

/**
 * Match the client scrub's supported server-function declaration shape. The
 * scrub deliberately falls back to the conventional `serverFn` name when the
 * function is re-exported through a local barrel, so discovery must make the
 * same choice or the browser receives a proxy without a dispatch route.
 */
function definesServerFn(file: string): boolean {
  const code = readFileSync(file, 'utf8');
  if (!code.includes('serverFn')) return false;

  const { program } = parseSync(file, code);
  const localNames = new Set<string>();
  for (const node of program.body) {
    if (
      node.type !== 'ImportDeclaration' ||
      node.source.value !== '@analogjs/router/server'
    ) {
      continue;
    }
    for (const specifier of node.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        (specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : specifier.imported.value) === 'serverFn'
      ) {
        localNames.add(specifier.local.name);
      }
    }
  }
  if (localNames.size === 0) localNames.add('serverFn');

  return program.body.some(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'VariableDeclaration' &&
      node.declaration.declarations.some(
        (declarator) =>
          declarator.id?.type === 'Identifier' &&
          declarator.init?.type === 'CallExpression' &&
          declarator.init.callee?.type === 'Identifier' &&
          localNames.has(declarator.init.callee.name),
      ),
  );
}
