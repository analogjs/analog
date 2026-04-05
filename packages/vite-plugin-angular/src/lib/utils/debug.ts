import { createDebug } from 'obug';
import { createDebugHarness } from './debug-harness.js';

// Normal — key decisions, once per startup or per component
export const debugTailwind = createDebug('analog:angular:tailwind');
export const debugHmr = createDebug('analog:angular:hmr');
export const debugStyles = createDebug('analog:angular:styles');
export const debugCompiler = createDebug('analog:angular:compiler');
export const debugCompilationApi = createDebug(
  'analog:angular:compilation-api',
);
export const debugStylePipeline = createDebug('analog:angular:style-pipeline');

// Verbose — per-file detail, enable with :v suffix or parent:*
export const debugTailwindV = createDebug('analog:angular:tailwind:v');
export const debugHmrV = createDebug('analog:angular:hmr:v');
export const debugStylesV = createDebug('analog:angular:styles:v');
export const debugCompilerV = createDebug('analog:angular:compiler:v');

const angularDebugInstances = [
  debugTailwind,
  debugHmr,
  debugStyles,
  debugCompiler,
  debugCompilationApi,
  debugStylePipeline,
  debugTailwindV,
  debugHmrV,
  debugStylesV,
  debugCompilerV,
];

export type DebugScope =
  | 'analog:angular:*'
  | 'analog:angular:hmr'
  | 'analog:angular:hmr:v'
  | 'analog:angular:styles'
  | 'analog:angular:styles:v'
  | 'analog:angular:compiler'
  | 'analog:angular:compiler:v'
  | 'analog:angular:compilation-api'
  | 'analog:angular:style-pipeline'
  | 'analog:angular:tailwind'
  | 'analog:angular:tailwind:v'
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
