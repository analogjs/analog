import { resolve } from 'node:path';
import { Plugin, normalizePath } from 'vite';

export const SERVER_MODE_ID = 'virtual:@analogjs/platform/server-mode';
const RESOLVED_SERVER_MODE_ID = `\0${SERVER_MODE_ID}`;

/**
 * Serves a module that sets `globalThis.ngServerMode = true`.
 *
 * Angular decides at provider-creation time whether browser-only features
 * such as event replay apply, and `provideClientHydration()` runs while the
 * app config module evaluates, before `platformServer()` or
 * `provideServerRendering()` set the flag. The SSR entry imports this module
 * first so the flag is set before any application module evaluates. A text
 * replacement cannot do this because Angular is pre-bundled for SSR.
 */
export function serverModePlugin(entryServer?: string): Plugin[] {
  let entryServerPath = '';

  return [
    {
      name: 'analogjs-server-mode-plugin',
      configResolved(config) {
        entryServerPath = normalizePath(
          resolve(config.root, entryServer ?? 'src/main.server.ts'),
        );
      },
      // Nitro v2 builds `main.server.ts` as the SSR entry directly, so set the
      // flag there too.
      transform(code, id, options) {
        if (options?.ssr && normalizePath(id) === entryServerPath) {
          return {
            code: `import ${JSON.stringify(SERVER_MODE_ID)};\n${code}`,
            map: null,
          };
        }
        return undefined;
      },
      resolveId(id) {
        return id === SERVER_MODE_ID ? RESOLVED_SERVER_MODE_ID : undefined;
      },
      load(id) {
        return id === RESOLVED_SERVER_MODE_ID
          ? 'globalThis.ngServerMode = true;\nexport {};\n'
          : undefined;
      },
    },
  ];
}
