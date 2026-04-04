import { createDebug } from 'obug';
import { debugInstances as nitroDebugInstances } from '@analogjs/vite-plugin-nitro/internal';
import { createDebugHarness } from '@analogjs/cross-utils';

export const debugPlatform = createDebug('analog:platform');
export const debugRoutes = createDebug('analog:platform:routes');
export const debugContent = createDebug('analog:platform:content');
export const debugTypedRouter = createDebug('analog:platform:typed-router');
export const debugTailwind = createDebug('analog:platform:tailwind');

const platformDebugInstances = [
  debugPlatform,
  debugRoutes,
  debugContent,
  debugTypedRouter,
  debugTailwind,
];

export type DebugScope =
  | 'analog:*'
  | 'analog:platform'
  | 'analog:platform:*'
  | 'analog:platform:routes'
  | 'analog:platform:content'
  | 'analog:platform:typed-router'
  | 'analog:platform:tailwind'
  | 'analog:angular:*'
  | 'analog:angular:hmr'
  | 'analog:angular:styles'
  | 'analog:angular:compiler'
  | 'analog:angular:compilation-api'
  | 'analog:angular:tailwind'
  | 'analog:nitro'
  | 'analog:nitro:*'
  | 'analog:nitro:ssr'
  | 'analog:nitro:prerender'
  | (string & {});

export type DebugMode = 'build' | 'dev';

export interface DebugModeOptions {
  scopes?: boolean | DebugScope[];
  mode?: DebugMode;
  /**
   * Write debug output to log files under `tmp/debug/` in the workspace root.
   * - `true` or `'single'` — all output to `tmp/debug/analog.log`
   * - `'scoped'` — one file per scope, e.g. `tmp/debug/analog.angular.hmr.log`
   */
  logFile?: boolean | 'single' | 'scoped';
}

export type DebugOption =
  | boolean
  | DebugScope[]
  | DebugModeOptions
  | DebugModeOptions[];

const harness = createDebugHarness({
  fallbackNamespace: 'analog:*',
  instanceGroups: [platformDebugInstances, nitroDebugInstances],
});

export const applyDebugOption: (
  debug: DebugOption | undefined,
  workspaceRoot?: string,
) => void = harness.applyDebugOption;
export const activateDeferredDebug: (command: 'build' | 'serve') => void =
  harness.activateDeferredDebug;
export const _resetDeferredDebug: () => void = harness._resetDeferredDebug;
