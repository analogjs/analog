import { createDebug, enable } from 'obug';

export const debugHmr = createDebug('analog:angular:hmr');
export const debugStyles = createDebug('analog:angular:styles');
export const debugCompiler = createDebug('analog:angular:compiler');
export const debugCompilationApi = createDebug(
  'analog:angular:compilation-api',
);
export const debugTailwind = createDebug('analog:angular:tailwind');

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
}

export type DebugOption =
  | boolean
  | DebugScope[]
  | DebugModeOptions
  | DebugModeOptions[];

let pendingDebug: DebugModeOptions[] = [];

function resolveNamespaces(
  scopes: boolean | string[] | undefined,
  fallback: string,
): string | null {
  if (scopes === true || scopes === undefined) return fallback;
  if (Array.isArray(scopes) && scopes.length) return scopes.join(',');
  return null;
}

function applyEntry(entry: DebugModeOptions, fallback: string): void {
  if (!entry.mode) {
    const ns = resolveNamespaces(entry.scopes ?? true, fallback);
    if (ns) enable(ns);
  } else {
    pendingDebug.push(entry);
  }
}

/**
 * Translates the user-facing `debug` plugin option into obug namespace
 * activations.  Called once during the Vite plugin config hook.
 *
 * Additive — does not replace namespaces already enabled via the DEBUG
 * env var or localStorage.debug.
 *
 * When an object with `mode` is provided, activation is deferred until
 * {@link activateDeferredDebug} is called from a Vite config hook.
 *
 * Accepts an array of objects to enable different scopes per command:
 * ```ts
 * debug: [
 *   { scopes: ['analog:angular:hmr'], mode: 'dev' },
 *   { scopes: ['analog:angular:compiler'], mode: 'build' },
 * ]
 * ```
 */
export function applyDebugOption(debug: DebugOption | undefined): void {
  if (debug == null || debug === false) return;

  if (typeof debug === 'boolean') {
    const ns = resolveNamespaces(debug, 'analog:angular:*');
    if (ns) enable(ns);
    return;
  }

  if (Array.isArray(debug)) {
    if (debug.length === 0) return;

    if (typeof debug[0] === 'string') {
      const ns = (debug as string[]).join(',');
      if (ns) enable(ns);
      return;
    }

    for (const entry of debug as DebugModeOptions[]) {
      applyEntry(entry, 'analog:angular:*');
    }
    return;
  }

  applyEntry(debug, 'analog:angular:*');
}

/**
 * Called from a Vite config hook once `command` is known.
 * Maps Vite's `'serve'` to `'dev'` and `'build'` to `'build'`.
 * Idempotent — clears pending state after the first call.
 */
export function activateDeferredDebug(command: 'build' | 'serve'): void {
  if (pendingDebug.length === 0) return;

  const currentMode = command === 'serve' ? 'dev' : 'build';

  for (const entry of pendingDebug) {
    if (entry.mode === currentMode) {
      const ns = resolveNamespaces(entry.scopes ?? true, 'analog:angular:*');
      if (ns) enable(ns);
    }
  }

  pendingDebug = [];
}

/** @internal test-only reset */
export function _resetDeferredDebug(): void {
  pendingDebug = [];
}
