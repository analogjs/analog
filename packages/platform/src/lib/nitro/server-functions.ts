import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';
import { parseSync } from 'oxc-parser';
import { normalizePath } from 'vite';
import type { Nitro } from 'nitro/types';
import { injectServerFnIds } from '../inject-server-fn-ids.js';
import { scrubServerFnModule } from '../server-fn-client-transform.js';
import { serverFnFileId } from '../server-fn-id.js';

export const SERVER_FUNCTION_HANDLER = '#analog/server-functions';
const SERVER_FUNCTION_MODE = '#analog/server-function-mode';

function importsServerFn(source: string, file: string): boolean {
  const parsed = parseSync(file, source);
  if (parsed.errors.length > 0)
    throw new Error(
      `[analog] Cannot parse server-function candidate ${file}: ${parsed.errors[0].message}`,
    );
  return parsed.program.body.some(
    (node) =>
      node.type === 'ImportDeclaration' &&
      node.source.value === '@analogjs/router/server' &&
      node.specifiers.some(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          (specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value) === 'serverFn',
      ),
  );
}

/** Discover actual, directly exported server functions without importing unrelated server modules. */
export function discoverServerFunctions(
  projectRoot: string,
  directories: string[],
): string[] {
  return [
    ...new Set(
      globSync(
        directories.map(
          (directory) => `${normalizePath(directory)}/**/*.server.ts`,
        ),
        { absolute: true, dot: true },
      ),
    ),
  ]
    .map(normalizePath)
    .sort()
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      if (!importsServerFn(source, file)) return false;
      // Shares the client transform's shape validation so discovery cannot
      // silently register a function whose browser proxy cannot be generated.
      return (
        scrubServerFnModule(source, serverFnFileId(file, projectRoot)) !== null
      );
    });
}

export function serverFunctionIdsPlugin(projectRoot: string) {
  return {
    name: 'analogjs-platform-server-function-ids',
    transform(
      source: string,
      id: string,
    ): { code: string; map: null } | undefined {
      if (!id.endsWith('.server.ts')) return;
      const transformed = injectServerFnIds(
        source,
        serverFnFileId(id, projectRoot),
      );
      return transformed === null
        ? undefined
        : { code: transformed.code, map: null };
    },
  };
}

export function serverFunctionHandlerSource(
  files: string[],
  appConfig?: string,
): string {
  return `import ${JSON.stringify(SERVER_FUNCTION_MODE)};
import '@angular/compiler';
import 'zone.js/node';
import '@angular/platform-server/init';
import { createServerFnAppInjector, createServerFnEventHandler } from '@analogjs/router/server';
${files.map((file) => `import ${JSON.stringify(file)};`).join('\n')}
${appConfig ? `import { config } from ${JSON.stringify(appConfig)};` : 'const config = { providers: [] };'}
export default createServerFnEventHandler(createServerFnAppInjector(config));
`;
}

/** The split Nitro integration owns registration independently of whether the host renders HTML. */
export function registerServerFunctions(
  nitro: { options: Pick<Nitro['options'], 'handlers' | 'virtual'> },
  input: { projectRoot: string; directories: string[] },
): boolean {
  const files = discoverServerFunctions(input.projectRoot, input.directories);
  if (files.length === 0) return false;
  const configs = ['src/app/app.config.server.ts', 'src/app.config.server.ts']
    .map((file) => normalizePath(resolve(input.projectRoot, file)))
    .filter(existsSync);
  if (configs.length > 1)
    throw new Error(
      '[analog] Server-function app config is ambiguous: keep one app.config.server.ts under src/ or src/app/.',
    );
  const appConfig = configs[0];
  nitro.options.virtual[SERVER_FUNCTION_MODE] =
    'globalThis.ngServerMode = true; export {};';
  nitro.options.virtual[SERVER_FUNCTION_HANDLER] = () =>
    serverFunctionHandlerSource(files, appConfig);
  nitro.options.handlers.push({
    route: '/_analog/fn/:id',
    handler: SERVER_FUNCTION_HANDLER,
    lazy: true,
  });
  return true;
}
