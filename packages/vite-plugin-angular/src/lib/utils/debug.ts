import { createDebug, type Debugger } from 'obug';
import { createDebugHarness } from './debug-harness.js';

// Normal — key decisions, once per startup or per component
export const debugHmr: Debugger = createDebug('analog:angular:hmr');
export const debugStyles: Debugger = createDebug('analog:angular:styles');
export const debugCompiler: Debugger = createDebug('analog:angular:compiler');
export const debugCompilationApi: Debugger = createDebug(
  'analog:angular:compilation-api',
);
export const debugEmit: Debugger = createDebug('analog:angular:emit');
export const debugStylePipeline: Debugger = createDebug(
  'analog:angular:style-pipeline',
);

// Verbose — per-file detail, enable with :v suffix or parent:*
export const debugHmrV: Debugger = createDebug('analog:angular:hmr:v');
export const debugStylesV: Debugger = createDebug('analog:angular:styles:v');
export const debugCompilerV: Debugger = createDebug(
  'analog:angular:compiler:v',
);
export const debugEmitV: Debugger = createDebug('analog:angular:emit:v');

const angularDebugInstances = [
  debugHmr,
  debugStyles,
  debugCompiler,
  debugCompilationApi,
  debugEmit,
  debugStylePipeline,
  debugHmrV,
  debugStylesV,
  debugCompilerV,
  debugEmitV,
];

import type {
  DebugScope,
  DebugMode,
  DebugModeOptions,
  DebugOption,
} from '../debug-options.js';
export type {
  DebugScope,
  DebugMode,
  DebugModeOptions,
  DebugOption,
} from '../debug-options.js';

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
