export type DebugScope =
  | 'analog:angular:*'
  | 'analog:angular:hmr'
  | 'analog:angular:hmr:v'
  | 'analog:angular:styles'
  | 'analog:angular:styles:v'
  | 'analog:angular:compiler'
  | 'analog:angular:compiler:v'
  | 'analog:angular:compilation-api'
  | 'analog:angular:emit'
  | 'analog:angular:emit:v'
  | 'analog:angular:style-pipeline'
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
