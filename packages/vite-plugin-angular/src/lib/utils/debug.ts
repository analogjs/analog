import { createDebug, enable } from 'obug';

export const debugHmr = createDebug('analog:angular:hmr');
export const debugStyles = createDebug('analog:angular:styles');
export const debugCompiler = createDebug('analog:angular:compiler');
export const debugCompilationApi = createDebug(
  'analog:angular:compilation-api',
);
export const debugTailwind = createDebug('analog:angular:tailwind');

/**
 * Translates the user-facing `debug` plugin option into obug namespace
 * activations.  Called once during the Vite plugin config hook.
 *
 * Additive — does not replace namespaces already enabled via the DEBUG
 * env var or localStorage.debug.
 */
export function applyDebugOption(debug: boolean | string[] | undefined): void {
  if (debug === true) {
    enable('analog:angular:*');
  } else if (Array.isArray(debug) && debug.length) {
    enable(debug.join(','));
  }
}
