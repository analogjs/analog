import type { FileReplacement } from './file-replacement.js';
import type { DebugOption } from './debug-options.js';
export interface PluginOptions {
  tsconfig?: string | (() => string);
  workspaceRoot?: string;
  inlineStylesExtension?: string;
  jit?: boolean;
  supportedBrowsers?: string[];
  /**
   * Additional files to include in compilation
   */
  include?: string[];
  /**
   * Enables Analog's Angular live-reload/HMR pipeline during development/watch mode.
   *
   * This is separate from Vite's `server.hmr` option, which configures the
   * HMR client transport.
   *
   * Defaults to `true` for watch mode. Set to `false` to disable Angular
   * reload updates while keeping other stylesheet externalization behavior
   * available when needed.
   */
  liveReload?: boolean;
  disableTypeChecking?: boolean;
  fileReplacements?: FileReplacement[];
  /**
   * Opt into the fast compile path. Skips Angular's template type-checking
   * and routes compilation through an internal single-pass transform.
   * Defaults to `false`.
   */
  fastCompile?: boolean;
  /**
   * Compilation output mode used when `fastCompile` is enabled.
   * - `'full'` (default): Emit final Ivy definitions for application builds.
   * - `'partial'`: Emit partial declarations for library publishing.
   */
  fastCompileMode?: 'full' | 'partial';
  experimental?: {
    useAngularCompilationAPI?: boolean;
    /** Warm previously read SSR environments after 75 ms without edits. Defaults to true in dev. */
    ssrHmrWarmup?: boolean;
    /** Prefer qualified native external CSS updates. Metadata retains the existing style behavior. */
    componentStyleHmr?: 'auto' | 'metadata';
  };
  /**
   * Enable debug logging for specific scopes.
   *
   * - `true` → enables all `analog:angular:*` scopes
   * - `string[]` → enables listed namespaces (e.g. `['analog:angular:hmr']`)
   * - `{ scopes?, mode? }` → object form with optional `mode: 'build' | 'dev'`
   *   to restrict output to a specific Vite command (omit for both)
   *
   * Also responds to the `DEBUG` env var (Node.js) or `localStorage.debug`
   * (browser), using the `obug` convention.
   */
  debug?: DebugOption;
}
