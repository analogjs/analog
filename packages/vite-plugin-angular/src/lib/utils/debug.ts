import { createDebug } from 'obug';
import { createDebugHarness } from '@analogjs/cross-utils';

export const debugHmr = createDebug('analog:angular:hmr');
export const debugStyles = createDebug('analog:angular:styles');
export const debugCompiler = createDebug('analog:angular:compiler');
export const debugCompilationApi = createDebug(
  'analog:angular:compilation-api',
);
export const debugTailwind = createDebug('analog:angular:tailwind');

const angularDebugInstances = [
  debugHmr,
  debugStyles,
  debugCompiler,
  debugCompilationApi,
  debugTailwind,
];

export type DebugScope =
  | 'analog:angular:*'
  | 'analog:angular:hmr'
  | 'analog:angular:styles'
  | 'analog:angular:compiler'
  | 'analog:angular:compilation-api'
  | 'analog:angular:tailwind'
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
  fallbackNamespace: 'analog:angular:*',
  instanceGroups: [angularDebugInstances],
});

export const applyDebugOption: (
  debug: DebugOption | undefined,
  workspaceRoot?: string,
) => void = harness.applyDebugOption;
export const activateDeferredDebug: (command: 'build' | 'serve') => void =
  harness.activateDeferredDebug;
export const _resetDeferredDebug: () => void = harness._resetDeferredDebug;
