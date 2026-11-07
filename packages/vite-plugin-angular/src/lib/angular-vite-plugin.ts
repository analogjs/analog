import type { Plugin } from 'vite';

import type { AngularCompilerPlugin } from './angular-compiler-api.js';
import { fastCompilePlugin } from './fast-compile-plugin.js';
import { ngpCompilePlugin } from './ngp-compile-plugin.js';
import { ngtscCompilePlugin } from './ngtsc-compile-plugin.js';
import type { FileReplacement } from './plugins/file-replacements.plugin.js';
import { angularSupportPlugins } from './support-plugins.js';
import { applyDebugOption, type DebugOption } from './utils/debug.js';
import type { TypeCheckerOption } from './utils/lsp-type-checker.js';
import { createTsConfigGetter } from './utils/plugin-config.js';

export interface PluginOptions {
  /**
   * Path to the tsconfig used for compilation, or a function returning it.
   * Defaults to `tsconfig.app.json` (`tsconfig.lib.json` for libraries,
   * `tsconfig.spec.json` in tests).
   */
  tsconfig?: string | (() => string);
  /**
   * Absolute path to the workspace root. Defaults to `NX_WORKSPACE_ROOT`,
   * then `process.cwd()`.
   */
  workspaceRoot?: string;
  /**
   * Stylesheet extension used for inline component `styles`. Defaults to `css`.
   */
  inlineStylesExtension?: string;
  /**
   * Compile components in JIT mode. Defaults to `true` in tests and `false`
   * otherwise.
   */
  jit?: boolean;
  /**
   * Additional files to include in compilation, as globs relative to the
   * workspace root.
   */
  include?: string[];
  /**
   * Enables Analog's Angular live-reload/HMR pipeline during development/watch mode.
   *
   * This is separate from Vite's `server.hmr` option, which configures the
   * HMR client transport.
   *
   * Defaults to `true` for watch mode, or `false` with `compilation: 'ngp'`,
   * which reloads the page on every change unless this is `true`. Set to
   * `false` to disable Angular reload updates while keeping other stylesheet
   * externalization behavior available when needed.
   */
  liveReload?: boolean;
  /**
   * Skip semantic and Angular template diagnostics during compilation.
   * Defaults to `true`, or `false` with `compilation: 'ngp'`, which requires
   * a TypeScript 7 type checker (see `typeChecker`).
   */
  disableTypeChecking?: boolean;
  /**
   * TypeScript 7 type checker used with `compilation: 'ngp'`: `'tsgo'`
   * (default), `'tsrs'`, or a command serving the TypeScript 7 language
   * server over stdio (`args` defaults to `['--lsp', '--stdio']`).
   */
  typeChecker?: TypeCheckerOption;
  /**
   * Replace source files at build time, like `fileReplacements` in
   * `angular.json`.
   */
  fileReplacements?: FileReplacement[];
  /**
   * Opt into the fast compile path. Skips Angular's template type-checking
   * and routes compilation through an internal single-pass transform when
   * `compilation` is not specified.
   * Defaults to `false`.
   */
  fastCompile?: boolean;
  /**
   * Selects the compilation path, overriding fastCompile. Defaults to 'ngtsc';
   * 'ngp' is experimental and falls back to 'ngtsc' under Vitest's JIT default.
   */
  compilation?: 'ngtsc' | 'ngp';
  /**
   * Compilation output mode used when `fastCompile` is enabled.
   * - `'full'` (default): Emit final Ivy definitions for application builds.
   * - `'partial'`: Emit partial declarations for library publishing.
   */
  fastCompileMode?: 'full' | 'partial';
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

export function angular(options: PluginOptions = {}): Plugin[] {
  applyDebugOption(options.debug, options.workspaceRoot);
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const isNgp =
    options.compilation === 'ngp' && !(isTest && options.jit === undefined);
  const fastCompile =
    options.compilation === undefined && (options.fastCompile ?? false);
  const liveReload = options.liveReload ?? !isNgp;
  const workspaceRoot =
    options.workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd();
  const inlineStylesExtension = options.inlineStylesExtension ?? 'css';
  const jit = options.jit ?? isTest;
  const fileReplacements = options.fileReplacements ?? [];
  const compilerOptions = {
    tsconfigGetter: createTsConfigGetter(options.tsconfig),
    workspaceRoot,
    inlineStylesExtension,
    jit,
    liveReload,
    disableTypeChecking: options.disableTypeChecking ?? !isNgp,
    isTest,
    isAstroIntegration: process.env['ANALOG_ASTRO'] === 'true',
  };
  const fastCompileOptions = {
    ...compilerOptions,
    fastCompileMode: options.fastCompileMode ?? 'full',
    typeChecker: options.typeChecker,
  };

  const compiler: AngularCompilerPlugin = isNgp
    ? ngpCompilePlugin(fastCompileOptions)
    : fastCompile
      ? fastCompilePlugin(fastCompileOptions)
      : ngtscCompilePlugin({
          ...compilerOptions,
          include: options.include ?? [],
          fileReplacements,
        });

  return angularSupportPlugins(compiler, {
    jit,
    isTest,
    liveReload,
    inlineStylesExtension,
    fileReplacements,
    workspaceRoot,
  });
}
