import type { Plugin } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { globSync } from 'tinyglobby';
import { serverFnFileId } from '@analogjs/vite-plugin-nitro/server-fn-id';
import { injectServerFnIds } from '@analogjs/vite-plugin-nitro/server-fn-transform';

import { scrubServerFnModule } from '../server-fn-client-transform.js';
import { setupDiscoveryManifest } from './discovery-manifest.js';

/**
 * Module specifier for server-function registration:
 *
 *   import 'analog:server-fns';
 *
 * In the server bundle it imports every discovered `*.server.ts` module
 * for its registration side effects — each `serverFn(...)` call
 * registers itself — so `createServerFnsHandler` can dispatch by id.
 * In the browser bundle it is empty.
 */
export const SERVER_FNS_ID = 'analog:server-fns';

const SERVER_FNS_NAMESPACE = 'analog-server-fns';
const SERVER_FN_MODULE_NAMESPACE = 'analog-server-fn-module';

/**
 * `*.server.ts` files under the app that are never server-function or
 * page-endpoint modules (matches the Vite path's exclusions).
 */
const EXCLUDED_SERVER_FILES: RegExp[] = [/\/app\.config\.server\.ts$/];

export interface AnalogServerFnsPluginOptions {
  workspaceRoot?: string;
  projectRoot?: string;
  additionalPagesDirs?: string[];
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

export function discoverServerFnFiles(
  root: string,
  workspaceRoot: string,
  additionalPagesDirs?: string[],
): string[] {
  return globSync(
    [
      `${root}/src/app/**/*.server.ts`,
      ...(additionalPagesDirs || []).map(
        (glob) => `${workspaceRoot}${glob}/**/*.server.ts`,
      ),
    ],
    { dot: true, absolute: true },
  )
    .map(normalizeSlashes)
    .filter((file) => !EXCLUDED_SERVER_FILES.some((re) => re.test(file)))
    .sort();
}

/**
 * Esbuild plugin bringing server functions to the esbuild application
 * builder. Two responsibilities:
 *
 * 1. Substitute `*.server.ts` modules at resolve time, per bundle. The
 *    Angular compiler plugin owns TypeScript loads and cannot be
 *    chained, so whole-module substitution is the mechanism: captured
 *    imports resolve into a private namespace under an extensionless
 *    path (so the compiler plugin's namespace-less `.ts` loader cannot
 *    match) and are served transformed. Browser bundles get the client
 *    scrub — each exported `serverFn(...)` becomes a `createServerFnRef`
 *    proxy, handlers and server imports drop out — and pure page
 *    endpoints under `pages/` become empty modules. Server bundles keep
 *    the real implementation with the derived id stamped into each
 *    `serverFn` config, so registration and the client proxy agree on
 *    the opaque `/_analog/fn/<id>` route.
 *
 * 2. Resolve `analog:server-fns`, the registration module the server
 *    entry imports for side effects, following the discovery-manifest
 *    pattern so adding or removing a `*.server.ts` rebuilds in watch.
 */
export function analogServerFnsPlugin(
  options?: AnalogServerFnsPluginOptions,
): Plugin {
  const workspaceRoot = normalizeSlashes(
    options?.workspaceRoot ?? process.cwd(),
  );
  const root = normalizeSlashes(
    resolve(workspaceRoot, options?.projectRoot ?? '.'),
  );
  const scopeDirs = [
    `${root}/src/app/`,
    ...(options?.additionalPagesDirs || []).map(
      (dir) => `${workspaceRoot}${dir}/`,
    ),
  ];

  return {
    name: 'analog-server-fns',
    setup(build) {
      const isBrowser =
        build.initialOptions.define?.['ngServerMode'] !== 'true' &&
        build.initialOptions.platform !== 'node';

      const manifestImport = setupDiscoveryManifest(
        `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/server-fns.json`,
        [`${root}/src/app`],
        () =>
          discoverServerFnFiles(
            root,
            workspaceRoot,
            options?.additionalPagesDirs,
          ),
      );

      build.onResolve({ filter: /^analog:server-fns$/ }, () => ({
        path: SERVER_FNS_ID,
        namespace: SERVER_FNS_NAMESPACE,
      }));

      build.onLoad({ filter: /.*/, namespace: SERVER_FNS_NAMESPACE }, () => {
        const files = discoverServerFnFiles(
          root,
          workspaceRoot,
          options?.additionalPagesDirs,
        );
        const contents = isBrowser
          ? 'export default undefined;\n'
          : manifestImport +
            files.map((file) => `import '${file}';`).join('\n') +
            '\n';

        return {
          contents,
          loader: 'js',
          resolveDir: root,
        };
      });

      // Captures imports of `*.server.ts` modules (extensionless
      // `./x.server` specifiers from pages and explicit `.ts` paths from
      // the analog:* virtual modules alike). Capture is decided by a
      // cheap sniff; the actual transform runs in the loader so every
      // rebuild sees the current file contents. Modules defining no
      // serverFn pass through untouched, except pure page endpoints in
      // browser bundles, which are emptied (as on the Vite path).
      build.onResolve({ filter: /\.server(\.ts)?$/ }, (args) => {
        if (args.kind === 'entry-point' || !args.resolveDir) {
          return undefined;
        }

        const absPath = normalizeSlashes(
          args.path.endsWith('.ts')
            ? resolve(args.resolveDir, args.path)
            : `${resolve(args.resolveDir, args.path)}.ts`,
        );
        if (
          !scopeDirs.some((dir) => absPath.startsWith(dir)) ||
          EXCLUDED_SERVER_FILES.some((re) => re.test(absPath)) ||
          !existsSync(absPath)
        ) {
          return undefined;
        }

        const mayDefineServerFn = readFileSync(absPath, 'utf8').includes(
          'serverFn',
        );
        if (!mayDefineServerFn && !(isBrowser && absPath.includes('/pages/'))) {
          return undefined;
        }

        return {
          // Extensionless: the Angular compiler plugin's namespace-less
          // onLoad matches any `.ts`-suffixed path, in every namespace.
          path: absPath.replace(/\.ts$/, ''),
          namespace: SERVER_FN_MODULE_NAMESPACE,
        };
      });

      build.onLoad(
        { filter: /.*/, namespace: SERVER_FN_MODULE_NAMESPACE },
        (args) => {
          const file = `${args.path}.ts`;
          const code = readFileSync(file, 'utf8');
          // Ids derive from the project-root-relative path, so the
          // client proxy and the server registration agree on the route.
          const fileId = serverFnFileId(file, root);

          let contents = code;
          let loader: 'js' | 'ts' = 'ts';
          if (isBrowser) {
            const scrubbed = scrubServerFnModule(code, fileId);
            if (scrubbed) {
              contents = scrubbed.code;
              loader = 'js';
            } else if (file.includes('/pages/')) {
              contents = 'export default undefined;\n';
              loader = 'js';
            }
          } else {
            const injected = injectServerFnIds(code, fileId);
            if (injected) {
              contents = injected.code;
            }
          }

          return {
            contents,
            loader,
            resolveDir: dirname(file),
            watchFiles: [file],
          };
        },
      );
    },
  };
}
