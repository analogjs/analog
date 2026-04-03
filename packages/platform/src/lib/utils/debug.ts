import { createDebug, enable } from 'obug';

export const debugPlatform = createDebug('analog:platform');
export const debugRoutes = createDebug('analog:platform:routes');
export const debugContent = createDebug('analog:platform:content');
export const debugTypedRouter = createDebug('analog:platform:typed-router');
export const debugTailwind = createDebug('analog:platform:tailwind');

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
 * Translates the user-facing `debug` platform option into obug namespace
 * activations.  Called once during the Vite plugin config hook.
 *
 * When `true`, enables all `analog:*` scopes (platform + angular + nitro).
 * Additive — does not replace namespaces already enabled via the DEBUG
 * env var or localStorage.debug.
 *
 * When an object with `mode` is provided, activation is deferred until
 * {@link activateDeferredDebug} is called from a Vite config hook.
 */
export function applyDebugOption(debug: DebugOption | undefined): void {
  if (debug == null || debug === false) return;

  if (typeof debug === 'boolean' || Array.isArray(debug)) {
    const ns = resolveNamespaces(debug, 'analog:*');
    if (ns) enable(ns);
    return;
  }

  if (!debug.mode) {
    const ns = resolveNamespaces(debug.scopes ?? true, 'analog:*');
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
    const ns = resolveNamespaces(pendingDebug.scopes ?? true, 'analog:*');
    if (ns) enable(ns);
  }

  pendingDebug = null;
}

/** @internal test-only reset */
export function _resetDeferredDebug(): void {
  pendingDebug = null;
}
