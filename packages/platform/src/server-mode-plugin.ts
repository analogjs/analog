import { Plugin } from 'vite';

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
export function serverModePlugin(): Plugin[] {
  return [
    {
      name: 'analogjs-server-mode-plugin',
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
