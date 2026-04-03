import { createDebug, enable } from 'obug';

export const debugHmr = createDebug('analog:angular:hmr');
export const debugStyles = createDebug('analog:angular:styles');
export const debugCompiler = createDebug('analog:angular:compiler');
export const debugCompilationApi = createDebug(
  'analog:angular:compilation-api',
);
export const debugTailwind = createDebug('analog:angular:tailwind');

export interface DebugModeOptions {
  scopes?: boolean | string[];
  mode?: 'build' | 'dev';
}

export type DebugOption = boolean | string[] | DebugModeOptions;

let pendingDebug: DebugModeOptions | null = null;

function resolveNamespaces(
  scopes: boolean | string[] | undefined,
  fallback: string,
): string | null {
  if (scopes === true || scopes === undefined) return fallback;
  if (Array.isArray(scopes) && scopes.length) return scopes.join(',');
  return null;
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
 */
export function applyDebugOption(debug: DebugOption | undefined): void {
  if (debug == null || debug === false) return;

  if (typeof debug === 'boolean' || Array.isArray(debug)) {
    const ns = resolveNamespaces(debug, 'analog:angular:*');
    if (ns) enable(ns);
    return;
  }

  if (!debug.mode) {
    const ns = resolveNamespaces(debug.scopes ?? true, 'analog:angular:*');
    if (ns) enable(ns);
    return;
  }

  pendingDebug = debug;
}

/**
 * Called from a Vite config hook once `command` is known.
 * Maps Vite's `'serve'` to `'dev'` and `'build'` to `'build'`.
 * Idempotent — clears pending state after the first call.
 */
export function activateDeferredDebug(command: 'build' | 'serve'): void {
  if (!pendingDebug) return;

  const currentMode = command === 'serve' ? 'dev' : 'build';

  if (pendingDebug.mode === currentMode) {
    const ns = resolveNamespaces(
      pendingDebug.scopes ?? true,
      'analog:angular:*',
    );
    if (ns) enable(ns);
  }

  pendingDebug = null;
}

/** @internal test-only reset */
export function _resetDeferredDebug(): void {
  pendingDebug = null;
}
